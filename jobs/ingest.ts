// Ingest one week of collector output from data/raw/<week>/ into SQLite.
// Usage: bun jobs/ingest.ts 2026-W42
import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config, type Config, DATA, dayOf, isCurrentWeek, isoWeek, open } from "../core/db";

type Status = "ok" | "count_mismatch" | "error";
// Rows per Slack search page; the collect-slack skill asks for `limit: 20`.
const SLACK_PAGE = 20;
const completedIn = (i: any, week: string) =>
  i.status_type === "completed" && !!i.completed_at && isoWeek(i.completed_at) === week;
const OPEN = new Set(["started", "unstarted", "backlog", "triage"]);

// One id per PR, issue or doc, whichever source mentions it. Anything else stays a URL.
export function refOf(url: string) {
  let m;
  if ((m = url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/)))
    return `github:${m[1]}#${m[2]}`;
  if ((m = url.match(/^https:\/\/linear\.app\/[^/]+\/issue\/([A-Z]+-\d+)/)))
    return `linear:${m[1]}`;
  if (
    (m = url.match(
      /^https:\/\/docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/([\w-]+)/,
    ))
  )
    return `gdoc:${m[1]}`;
  return url;
}

// References in free text: URLs, plus bare issue ids like ABC-12 for team keys seen in Linear.
// Only known keys count, so "UTF-8" is not an issue.
export function refsIn(text: string, issueKeys: Set<string>) {
  const refs = new Set((text.match(/https?:\/\/[^\s<>|)"']+/g) ?? []).map(refOf));
  for (const m of text.matchAll(/\b([A-Z]{2,6})-(\d+)\b/g))
    if (issueKeys.has(m[1])) refs.add(`linear:${m[1]}-${m[2]}`);
  return [...refs];
}

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function ingestWeek(db: Database, dir: string, week: string, me: Config = config()) {
  const result: Record<string, Status> = {};
  const now = new Date().toISOString();
  const event =
    db.query(`INSERT INTO events (id, source, kind, week, occurred_at, title, url, author, project_id, milestone_id, payload, run_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, week=excluded.week, occurred_at=excluded.occurred_at, title=excluded.title,
      url=excluded.url, author=excluded.author, project_id=excluded.project_id, milestone_id=excluded.milestone_id,
      payload=excluded.payload, run_id=excluded.run_id`);
  const link = db.query("INSERT OR IGNORE INTO links (from_id, to_ref, rel) VALUES (?, ?, ?)");

  // slack_own and slack_mention are the old one-call-per-week files; older weeks still have them.
  const days = [1, 2, 3, 4, 5, 6, 7].flatMap((d) => [`slack_own_${d}`, `slack_mention_${d}`]);
  for (const source of [
    "linear",
    "github",
    "reviews",
    "requests",
    "slack_own",
    "slack_mention",
    ...days,
    "calendar",
    "drive",
  ]) {
    const file = join(dir, `${source}.run.json`);
    if (!existsSync(file)) continue;
    const run = JSON.parse(readFileSync(file, "utf8"));
    const runId = `${week}:${source}:${run.session_id ?? "unknown"}`;
    const out = run.structured_output;
    const expFile = join(dir, `${source}.expected`);
    let expected = existsSync(expFile) ? Number(readFileSync(expFile, "utf8").trim()) : null;

    let got: number | null = null;
    let status: Status = "error";
    if (!run.is_error && out) {
      // Trust boundary: the shape was enforced by --json-schema, so check only what it cannot.
      // Reviews come from PRs updated since `from`, with every date, so one run covers each week after it.
      if (source === "reviews" || source === "requests")
        check(
          out.from <= new Date(dayOf(week, 0)).toISOString().slice(0, 10),
          `${source}: collected from ${out.from}, after ${week} starts`,
        );
      else check(out.week === week, `${source}: collected ${out.week}, expected ${week}`);
      if (source === "linear") {
        // Claude copies every row; the window filter is ours. Its own picks are the check.
        const inWindow = new Set(
          out.issues.filter((i: any) => completedIn(i, week)).map((i: any) => i.id),
        );
        const picked = new Set(out.attachments.map((a: any) => a.id));
        const missed = [...inWindow].filter((id) => !picked.has(id));
        if (missed.length)
          console.warn(`linear ${week}: no attachments collected for ${missed.join(", ")}`);
        [expected, got] = [inWindow.size, [...inWindow].filter((id) => picked.has(id)).length];
      } else if (source === "github") {
        got = out.prs_merged.length;
        // PRs opened have their own count: a short list flags the run like a short merged list.
        const f = join(dir, "github_opened.expected"),
          n = out.prs_opened ? new Set(out.prs_opened.map((p: any) => p.url)).size : null;
        if (n != null && existsSync(f) && Number(readFileSync(f, "utf8").trim()) !== n) {
          console.warn(
            `github ${week}: ${n} PRs opened, search says ${readFileSync(f, "utf8").trim()}`,
          );
          out.short = true;
        }
      }
      // Every PR from the search has one of your reviews: PRs missing from the rows were not read.
      else if (source === "reviews")
        got = new Set(
          out.reviews
            .filter((r: any) => r.author !== me.github)
            .map((r: any) => `${r.repo}#${r.number}`),
        ).size;
      else if (source === "requests")
        got = new Set(
          out.prs
            .filter((p: any) => p.author !== me.github)
            .map((p: any) => `${p.repo}#${p.number}`),
        ).size;
      else if (source === "calendar") got = out.events.length;
      else if (source === "drive") got = out.files.length;
      else {
        // No source gives Slack a total. Every page but the last is full, so N pages hold at
        // least (N-1) x 20 rows: Haiku read 11 pages and returned the first 20, saying it was done.
        // A day call must return that day: one Saturday call came back with Monday's 93 rows.
        // Rows more than a day off (time zones) are dropped and the run is flagged.
        const n = Number(source.match(/_(\d)$/)?.[1]);
        const off = n
          ? out.messages.filter(
              (m: any) =>
                Math.abs(Number(m.ts) * 1000 - dayOf(week, n - 1) - 12 * 36e5) > 36 * 36e5,
            )
          : [];
        if (off.length) {
          console.warn(`${source} ${week}: dropped ${off.length} rows from other days`);
          out.messages = out.messages.filter((m: any) => !off.includes(m));
          out.dropped = off.length;
        }
        got = out.messages.length;
        expected = Math.max(0, (out.pages_read - 1) * SLACK_PAGE);
        if (!out.exhausted)
          console.warn(`slack ${week}: paging did not finish after ${out.pages_read} pages`);
        if (got < expected)
          console.warn(`${source} ${week}: ${out.pages_read} pages read but ${got} rows returned`);
      }
      const counted =
        expected == null || (source.startsWith("slack") ? got! >= expected : expected === got);
      status =
        counted &&
        out.exhausted !== false &&
        !out.short &&
        !(source.startsWith("slack") && out.dropped)
          ? "ok"
          : "count_mismatch";
    }
    result[source] = status;

    db.transaction(() => {
      db.query(
        `INSERT INTO runs (id, week, source, cost_usd, num_turns, expected, got, status, ingested_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET expected=excluded.expected, got=excluded.got, status=excluded.status, ingested_at=excluded.ingested_at`,
      ).run(
        runId,
        week,
        source,
        run.total_cost_usd ?? null,
        run.num_turns ?? null,
        expected,
        got,
        status,
        now,
      );
      if (status === "error") return;
      if (source === "linear") ingestLinear(db, out, week, runId, now, event, link);
      else if (source === "github") ingestGithub(db, out, week, runId, event, link, me);
      else if (source === "reviews") ingestReviews(out, week, runId, event, me);
      else if (source === "requests") ingestRequests(out, dir, week, runId, event, me);
      else if (source === "calendar") ingestCalendar(out, week, runId, event, link);
      else if (source === "drive") ingestDrive(out, week, runId, event, link);
      else ingestSlack(db, out, week, runId, event, link, me);
    })();
  }
  return result;
}

function ingestLinear(
  db: Database,
  out: any,
  week: string,
  runId: string,
  now: string,
  event: any,
  link: any,
) {
  const projectId = new Map<string, string>();
  const milestoneId = new Map<string, string>();
  for (const p of out.projects) {
    db.query(
      `INSERT INTO projects (id, name, url, lead, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, url=excluded.url, lead=excluded.lead, status=excluded.status, updated_at=excluded.updated_at`,
    ).run(p.id, p.name, p.url, p.lead, p.status, now);
    projectId.set(p.name, p.id);
    for (const m of p.milestones) {
      db.query(
        `INSERT INTO milestones (id, project_id, name, progress, target_date, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, progress=excluded.progress, target_date=excluded.target_date, updated_at=excluded.updated_at`,
      ).run(m.id, p.id, m.name, m.progress, m.target_date, now);
      milestoneId.set(`${p.id}/${m.name}`, m.id);
    }
  }
  const urls = new Map<string, string[]>(out.attachments.map((a: any) => [a.id, a.urls]));
  const current = isCurrentWeek(week);
  const seen = new Set<string>();
  for (const i of out.issues) {
    const done = completedIn(i, week);
    if (seen.has(i.id) || !(done || (current && OPEN.has(i.status_type)))) continue;
    seen.add(i.id);
    const pid = i.project_name ? (projectId.get(i.project_name) ?? null) : null;
    if (i.project_name && !pid)
      console.warn(`linear: ${i.id} names project "${i.project_name}", which was not collected`);
    const mid =
      pid && i.milestone_name ? (milestoneId.get(`${pid}/${i.milestone_name}`) ?? null) : null;
    const id = `linear:${i.id}`;
    event.run(
      id,
      "linear",
      done ? "issue_completed" : "issue_open",
      done ? isoWeek(i.completed_at) : week,
      i.completed_at,
      i.title,
      i.url,
      null,
      pid,
      mid,
      JSON.stringify(i),
      runId,
    );
    for (const u of urls.get(i.id) ?? []) link.run(id, refOf(u), "attachment");
  }
}

// Team keys of the Linear issues already ingested, so bare ids in text can be told from noise.
function issueKeys(db: Database) {
  const rows = db
    .query(
      "SELECT DISTINCT substr(id, 8, instr(substr(id, 8), '-') - 1) k FROM events WHERE source = 'linear'",
    )
    .all() as { k: string }[];
  return new Set(rows.map((r) => r.k));
}

function ingestCalendar(out: any, week: string, runId: string, event: any, link: any) {
  for (const e of out.events) {
    // A meeting is a regular event with someone else in it that you did not decline.
    const meeting =
      e.event_type === "DEFAULT" &&
      e.status !== "cancelled" &&
      e.my_response !== "declined" &&
      e.attendees.length > 1;
    const at = new Date(e.start).toISOString();
    if (!meeting || isoWeek(at) !== week) continue;
    const id = `calendar:${e.id}`;
    event.run(
      id,
      "calendar",
      "meeting",
      week,
      at,
      e.summary,
      e.html_link,
      e.organizer,
      null,
      null,
      JSON.stringify(e),
      runId,
    );
    // Only typed refs: agendas also carry board and huddle links that would join unrelated threads.
    for (const u of e.urls) if (refOf(u) !== u) link.run(id, refOf(u), "agenda");
  }
}

const DOC = /^application\/vnd\.google-apps\.(document|spreadsheet|presentation)$/;

function ingestDrive(out: any, week: string, runId: string, event: any, link: any) {
  for (const f of out.files) {
    // Folders and shortcuts are made by Gemini notes, not by you.
    if (!DOC.test(f.mime_type)) continue;
    const created = isoWeek(f.created_time) === week;
    // A doc can change in many weeks, so the week is part of the id.
    const id = `drive:${f.id}:${week}`;
    event.run(
      id,
      "drive",
      created ? "doc_created" : "doc_edited",
      week,
      created ? f.created_time : f.modified_time,
      f.title,
      f.url,
      null,
      null,
      null,
      JSON.stringify(f),
      runId,
    );
    link.run(id, refOf(f.url), "is");
  }
}

function ingestSlack(
  db: Database,
  out: any,
  week: string,
  runId: string,
  event: any,
  link: any,
  me: Config,
) {
  const keys = issueKeys(db);
  for (const m of out.messages) {
    const at = new Date(Number(m.ts) * 1000).toISOString();
    const mine = m.author_id === out.self_user_id;
    // Search matches the name anywhere, threads included; a mention must name you in the text.
    const names = m.text.includes(`<@${out.self_user_id}`) || m.text.includes(me.name);
    // ponytail: GitHub app posts echo PRs the github source already has; match by name until Slack gives a bot flag.
    const echo = m.author_name === "GitHub";
    if (isoWeek(at) !== week || (m.pass === "mention" && (mine || !names || echo))) continue;
    const id = `slack:${m.channel_id}/${m.ts}`;
    event.run(
      id,
      "slack",
      mine ? "slack_message" : "slack_mention",
      week,
      at,
      m.channel_name,
      m.permalink,
      m.author_name,
      null,
      null,
      JSON.stringify(m),
      runId,
    );
    channelTopic(db, m.channel_name);
    for (const r of refsIn(m.text, keys)) link.run(id, r, "mentions");
  }
}

// Reviews given: the PRs you reviewed this week, counted by when you submitted the review.
function ingestReviews(out: any, week: string, runId: string, event: any, me: Config) {
  // A review on a bot's PR (dependabot, renovate) is not help given to a person.
  const mine = out.reviews.filter(
    (r: any) =>
      r.author !== me.github &&
      !r.author.endsWith("[bot]") &&
      r.submitted_at &&
      isoWeek(r.submitted_at) === week,
  );
  event.run(
    `github:reviews_given:${week}`,
    "github",
    "reviews_given",
    week,
    null,
    null,
    null,
    me.github,
    null,
    null,
    JSON.stringify({
      count: new Set(mine.map((r: any) => `${r.repo}#${r.number}`)).size,
      submissions: mine.length,
    }),
    runId,
  );
}

// Asked for a review in the week: PRs that named you, and PRs that named one of your teams.
// Bot PRs are left out, as in reviews given. ponytail: a request removed before the run
// (someone else reviewed for the team, the author took you off) is missed when the PR left both searches.
function ingestRequests(
  out: any,
  dir: string,
  week: string,
  runId: string,
  event: any,
  me: Config,
) {
  const f = join(dir, "teams.txt"),
    teams = existsSync(f) ? new Set(readFileSync(f, "utf8").split("\n").filter(Boolean)) : null;
  const prs = out.prs.filter((p: any) => p.author !== me.github && !p.author.endsWith("[bot]"));
  const asked = (hit: (r: string) => boolean) =>
    prs.filter((p: any) => p.requests.some((r: any) => hit(r.reviewer) && isoWeek(r.at) === week))
      .length;
  event.run(
    `github:review_requests:${week}`,
    "github",
    "review_requests",
    week,
    null,
    null,
    null,
    me.github,
    null,
    null,
    JSON.stringify({
      direct: asked((r) => r === me.github),
      team: teams ? asked((r) => teams.has(r)) : null,
    }),
    runId,
  );
}

function ingestGithub(
  db: Database,
  out: any,
  week: string,
  runId: string,
  event: any,
  link: any,
  me: Config,
) {
  // Claude copies anything shaped like ABC-123 from a PR body: eu-west-1, UTF-8, names. Only
  // your Linear teams' keys are issues. ponytail: teams seen in your issues; a PR citing another
  // team's issue loses that link, fetch the team list from Linear if that matters.
  const keys = issueKeys(db);
  const drop = db.query("DELETE FROM links WHERE from_id = ? AND rel = 'mentions'");
  for (const [kind, prs] of [
    ["pr_merged", out.prs_merged],
    ["pr_open", out.prs_open],
  ] as const) {
    for (const p of prs) {
      const id = `github:${p.repo}#${p.number}`;
      event.run(
        id,
        "github",
        kind,
        kind === "pr_merged" ? isoWeek(p.at) : week,
        p.at,
        p.title,
        p.url,
        me.github,
        null,
        null,
        JSON.stringify(p),
        runId,
      );
      // Re-ingest replaces the links, so a fixed filter also removes old wrong ones.
      drop.run(id);
      for (const r of p.linear_refs)
        if (keys.has(r.split("-")[0])) link.run(id, `linear:${r}`, "mentions");
    }
  }
  // Older runs have no PRs opened: the North tile shows 0 for them.
  if (out.prs_opened)
    event.run(
      `github:prs_opened:${week}`,
      "github",
      "prs_opened",
      week,
      null,
      null,
      null,
      me.github,
      null,
      null,
      JSON.stringify({ count: new Set(out.prs_opened.map((p: any) => p.url)).size }),
      runId,
    );
  // Older runs counted PRs updated in the week; the reviews source replaces that count.
  if (out.reviews_given != null)
    event.run(
      `github:reviews_given:${week}`,
      "github",
      "reviews_given",
      week,
      null,
      null,
      null,
      me.github,
      null,
      null,
      JSON.stringify({ count: out.reviews_given }),
      runId,
    );
  for (const c of out.review_comments_received) {
    const id = `github:${c.url}`;
    event.run(
      id,
      "github",
      "review_comment",
      week,
      null,
      null,
      c.url,
      c.author,
      null,
      null,
      JSON.stringify(c),
      runId,
    );
    link.run(id, `github:${c.repo}#${c.number}`, "on");
  }
}

// "#internal-acme" → topic "Acme".
export function channelTopic(db: Database, channel: string) {
  if (!channel.startsWith("#internal-")) return;
  const name = channel
    .slice("#internal-".length)
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
  db.query(
    "INSERT INTO projects (id, name, kind, updated_at) VALUES (?, ?, 'topic', ?) ON CONFLICT DO NOTHING",
  ).run(`topic:${channel.slice(1)}`, name, new Date().toISOString());
}

if (import.meta.main) {
  const week = process.argv[2];
  check(/^\d{4}-W\d{2}$/.test(week ?? ""), "usage: bun jobs/ingest.ts 2026-W42");
  const res = ingestWeek(open(), join(DATA, "raw", week), week);
  for (const [s, st] of Object.entries(res))
    console.log(`${st === "ok" ? "✓" : "✗"} ${s} ${week}: ${st}`);
  if (Object.values(res).some((s) => s !== "ok")) process.exit(2);
}
