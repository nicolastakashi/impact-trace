// Ingest one week of collector output from data/raw/<week>/ into SQLite.
// Usage: bun ingest/ingest.ts 2026-W42
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
type Status = "ok" | "count_mismatch" | "error";

export function open(path = join(ROOT, "data/impact.db")) {
  const db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

export function migrate(db: Database) {
  const dir = join(ROOT, "db/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const { user_version } = db.query("PRAGMA user_version").get() as { user_version: number };
  files.slice(user_version).forEach((f, i) =>
    db.transaction(() => {
      db.exec(readFileSync(join(dir, f), "utf8"));
      db.exec(`PRAGMA user_version = ${user_version + i + 1}`);
    })(),
  );
}

// ponytail: week of the UTC date; a Sunday-night Berlin timestamp lands in the next week.
export function isoWeek(iso: string) {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)); // Thursday of that week
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  const w = 1 + Math.floor((d.getTime() - jan1) / 864e5 / 7);
  return `${d.getUTCFullYear()}-W${String(w).padStart(2, "0")}`;
}

const completedIn = (i: any, week: string) => i.status_type === "completed" && !!i.completed_at && isoWeek(i.completed_at) === week;
const OPEN = new Set(["started", "unstarted", "backlog", "triage"]);

// The open state Linear returns is today's, so it only describes the current week.
export function isCurrentWeek(week: string, today = new Date()) {
  return isoWeek(today.toISOString()) <= week;
}

// One id per PR, issue or doc, whichever source mentions it. Anything else stays a URL.
export function refOf(url: string) {
  let m;
  if ((m = url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/))) return `github:${m[1]}#${m[2]}`;
  if ((m = url.match(/^https:\/\/linear\.app\/[^/]+\/issue\/([A-Z]+-\d+)/))) return `linear:${m[1]}`;
  if ((m = url.match(/^https:\/\/docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/([\w-]+)/))) return `gdoc:${m[1]}`;
  return url;
}

// References in free text: URLs, plus bare issue ids like ABC-12 for team keys seen in Linear.
// Only known keys count, so "UTF-8" is not an issue.
export function refsIn(text: string, issueKeys: Set<string>) {
  const refs = new Set((text.match(/https?:\/\/[^\s<>|)"']+/g) ?? []).map(refOf));
  for (const m of text.matchAll(/\b([A-Z]{2,6})-(\d+)\b/g)) if (issueKeys.has(m[1])) refs.add(`linear:${m[1]}-${m[2]}`);
  return [...refs];
}

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function ingestWeek(db: Database, dir: string, week: string) {
  const result: Record<string, Status> = {};
  const now = new Date().toISOString();
  const event = db.query(`INSERT INTO events (id, source, kind, week, occurred_at, title, url, author, project_id, milestone_id, payload, run_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, week=excluded.week, occurred_at=excluded.occurred_at, title=excluded.title,
      url=excluded.url, author=excluded.author, project_id=excluded.project_id, milestone_id=excluded.milestone_id,
      payload=excluded.payload, run_id=excluded.run_id`);
  const link = db.query("INSERT OR IGNORE INTO links (from_id, to_ref, rel) VALUES (?, ?, ?)");

  for (const source of ["linear", "github", "slack_own", "slack_mention", "calendar", "drive"]) {
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
      check(out.week === week, `${source}: collected ${out.week}, expected ${week}`);
      if (source === "linear") {
        // Claude copies every row; the window filter is ours. Its own picks are the check.
        const inWindow = new Set(out.issues.filter((i: any) => completedIn(i, week)).map((i: any) => i.id));
        const picked = new Set(out.attachments.map((a: any) => a.id));
        const missed = [...inWindow].filter((id) => !picked.has(id));
        if (missed.length) console.warn(`linear ${week}: no attachments collected for ${missed.join(", ")}`);
        [expected, got] = [inWindow.size, [...inWindow].filter((id) => picked.has(id)).length];
      } else if (source === "github") got = out.prs_merged.length;
      else if (source === "calendar") got = out.events.length;
      else if (source === "drive") got = out.files.length;
      else {
        // No source gives Slack a total, so the only check left is that paging finished.
        got = out.messages.length;
        if (!out.exhausted) console.warn(`slack ${week}: paging did not finish after ${out.pages_read} pages`);
      }
      status = (expected == null || expected === got) && out.exhausted !== false ? "ok" : "count_mismatch";
    }
    result[source] = status;

    db.transaction(() => {
      db.query(`INSERT INTO runs (id, week, source, cost_usd, num_turns, expected, got, status, ingested_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET expected=excluded.expected, got=excluded.got, status=excluded.status, ingested_at=excluded.ingested_at`)
        .run(runId, week, source, run.total_cost_usd ?? null, run.num_turns ?? null, expected, got, status, now);
      if (status === "error") return;
      if (source === "linear") ingestLinear(db, out, week, runId, now, event, link);
      else if (source === "github") ingestGithub(out, week, runId, event, link);
      else if (source === "calendar") ingestCalendar(out, week, runId, event, link);
      else if (source === "drive") ingestDrive(out, week, runId, event, link);
      else ingestSlack(db, out, week, runId, event, link);
    })();
  }
  return result;
}

function ingestLinear(db: Database, out: any, week: string, runId: string, now: string, event: any, link: any) {
  const projectId = new Map<string, string>();
  const milestoneId = new Map<string, string>();
  for (const p of out.projects) {
    db.query(`INSERT INTO projects (id, name, url, lead, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, url=excluded.url, lead=excluded.lead, status=excluded.status, updated_at=excluded.updated_at`)
      .run(p.id, p.name, p.url, p.lead, p.status, now);
    projectId.set(p.name, p.id);
    for (const m of p.milestones) {
      db.query(`INSERT INTO milestones (id, project_id, name, progress, target_date, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, progress=excluded.progress, target_date=excluded.target_date, updated_at=excluded.updated_at`)
        .run(m.id, p.id, m.name, m.progress, m.target_date, now);
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
    const pid = i.project_name ? projectId.get(i.project_name) ?? null : null;
    if (i.project_name && !pid) console.warn(`linear: ${i.id} names project "${i.project_name}", which was not collected`);
    const mid = pid && i.milestone_name ? milestoneId.get(`${pid}/${i.milestone_name}`) ?? null : null;
    const id = `linear:${i.id}`;
    event.run(id, "linear", done ? "issue_completed" : "issue_open", done ? isoWeek(i.completed_at) : week,
      i.completed_at, i.title, i.url, null, pid, mid, JSON.stringify(i), runId);
    for (const u of urls.get(i.id) ?? []) link.run(id, refOf(u), "attachment");
  }
}

// Team keys of the Linear issues already ingested, so bare ids in text can be told from noise.
function issueKeys(db: Database) {
  const rows = db.query("SELECT DISTINCT substr(id, 8, instr(substr(id, 8), '-') - 1) k FROM events WHERE source = 'linear'").all() as { k: string }[];
  return new Set(rows.map((r) => r.k));
}

function ingestCalendar(out: any, week: string, runId: string, event: any, link: any) {
  for (const e of out.events) {
    // A meeting is a regular event with someone else in it that you did not decline.
    const meeting = e.event_type === "DEFAULT" && e.status !== "cancelled" && e.my_response !== "declined" && e.attendees.length > 1;
    const at = new Date(e.start).toISOString();
    if (!meeting || isoWeek(at) !== week) continue;
    const id = `calendar:${e.id}`;
    event.run(id, "calendar", "meeting", week, at, e.summary, e.html_link, e.organizer, null, null, JSON.stringify(e), runId);
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
    event.run(id, "drive", created ? "doc_created" : "doc_edited", week, created ? f.created_time : f.modified_time,
      f.title, f.url, null, null, null, JSON.stringify(f), runId);
    link.run(id, refOf(f.url), "is");
  }
}

function ingestSlack(db: Database, out: any, week: string, runId: string, event: any, link: any) {
  const keys = issueKeys(db);
  for (const m of out.messages) {
    const at = new Date(Number(m.ts) * 1000).toISOString();
    const mine = m.author_id === out.self_user_id;
    // Search matches the name anywhere, threads included; a mention must name you in the text.
    const names = m.text.includes(`<@${out.self_user_id}`) || m.text.includes("Nicolas Takashi");
    // ponytail: GitHub app posts echo PRs the github source already has; match by name until Slack gives a bot flag.
    const echo = m.author_name === "GitHub";
    if (isoWeek(at) !== week || (m.pass === "mention" && (mine || !names || echo))) continue;
    const id = `slack:${m.channel_id}/${m.ts}`;
    event.run(id, "slack", mine ? "slack_message" : "slack_mention", week, at, m.channel_name, m.permalink, m.author_name,
      null, null, JSON.stringify(m), runId);
    for (const r of refsIn(m.text, keys)) link.run(id, r, "mentions");
  }
}

function ingestGithub(out: any, week: string, runId: string, event: any, link: any) {
  for (const [kind, prs] of [["pr_merged", out.prs_merged], ["pr_open", out.prs_open]] as const) {
    for (const p of prs) {
      const id = `github:${p.repo}#${p.number}`;
      event.run(id, "github", kind, kind === "pr_merged" ? isoWeek(p.at) : week, p.at, p.title, p.url, "nicolastakashi", null, null, JSON.stringify(p), runId);
      for (const r of p.linear_refs) link.run(id, `linear:${r}`, "mentions");
    }
  }
  event.run(`github:reviews_given:${week}`, "github", "reviews_given", week, null, null, null, "nicolastakashi", null, null,
    JSON.stringify({ count: out.reviews_given }), runId);
  for (const c of out.review_comments_received) {
    const id = `github:${c.url}`;
    event.run(id, "github", "review_comment", week, null, null, c.url, c.author, null, null, JSON.stringify(c), runId);
    link.run(id, `github:${c.repo}#${c.number}`, "on");
  }
}

// Work threads: events joined through the PRs, issues and docs they share. Raw URLs do not join.
// ponytail: one hub ref (an epic named everywhere) merges its threads; cap by degree if that shows up.
export function threads(db: Database, weeks: string[]) {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  const marks = weeks.map(() => "?").join(",");
  const events = db.query(`SELECT id FROM events WHERE week IN (${marks})`).all(...weeks) as { id: string }[];
  const links = db.query(`SELECT from_id, to_ref FROM links JOIN events ON events.id = from_id
    WHERE week IN (${marks}) AND (to_ref LIKE 'github:%' OR to_ref LIKE 'linear:%' OR to_ref LIKE 'gdoc:%')`).all(...weeks) as any[];
  for (const l of links) parent.set(find(l.from_id), find(l.to_ref));
  const groups = new Map<string, string[]>();
  for (const { id } of events) groups.set(find(id), [...(groups.get(find(id)) ?? []), id]);
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

if (import.meta.main) {
  const week = process.argv[2];
  check(/^\d{4}-W\d{2}$/.test(week ?? ""), "usage: bun ingest/ingest.ts 2026-W42");
  const res = ingestWeek(open(), join(ROOT, "data/raw", week), week);
  for (const [s, st] of Object.entries(res)) console.log(`${st === "ok" ? "✓" : "✗"} ${s} ${week}: ${st}`);
  if (Object.values(res).some((s) => s !== "ok")) process.exit(2);
}
