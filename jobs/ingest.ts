// Ingest one week of collector output from data/raw/<week>/ into SQLite.
// Usage: bun jobs/ingest.ts 2026-W42
import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config, type Config, DATA, dayOf, isCurrentWeek, isoWeek, open } from "../core/db";
import { readJson } from "./claude";

type Status = "ok" | "count_mismatch" | "error";
type Count = { expected: number | null; got: number | null };

// Rows per Slack search page; the collect-slack skill asks for `limit: 20`.
const SLACK_PAGE = 20;
const OPEN = new Set(["started", "unstarted", "backlog", "triage"]);
const DOC = /^application\/vnd\.google-apps\.(document|spreadsheet|presentation)$/;

// slack_own and slack_mention are the old one-call-per-week files; older weeks still have them.
const SLACK_DAYS = [1, 2, 3, 4, 5, 6, 7].flatMap((day) => [
  `slack_own_${day}`,
  `slack_mention_${day}`,
]);
const SOURCES = [
  "linear",
  "github",
  "reviews",
  "requests",
  "slack_own",
  "slack_mention",
  ...SLACK_DAYS,
  "calendar",
  "drive",
];

// One row of the events table. Fields left out are stored as NULL.
type EventRow = {
  id: string;
  source: string;
  kind: string;
  week: string;
  at?: string | null;
  title?: string | null;
  url?: string | null;
  author?: string | null;
  projectId?: string | null;
  milestoneId?: string | null;
  payload: unknown;
};

// What each source's ingest needs: the week, its run, and the two inserts.
type Step = {
  db: Database;
  directory: string;
  week: string;
  runId: string;
  now: string;
  me: Config;
  event: (row: EventRow) => void;
  link: (from: string, to: string, relation: string) => void;
};

const completedIn = (issue: any, week: string) =>
  issue.status_type === "completed" && !!issue.completed_at && isoWeek(issue.completed_at) === week;

const prKey = (row: { repo: string; number: number }) => `${row.repo}#${row.number}`;
const isBot = (author: string) => author.endsWith("[bot]");

// One id per PR, issue or doc, whichever source mentions it. Anything else stays a URL.
export function referenceOf(url: string) {
  const pr = url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  if (pr) return `github:${pr[1]}#${pr[2]}`;
  const issue = url.match(/^https:\/\/linear\.app\/[^/]+\/issue\/([A-Z]+-\d+)/);
  if (issue) return `linear:${issue[1]}`;
  const doc = url.match(
    /^https:\/\/docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/([\w-]+)/,
  );
  if (doc) return `gdoc:${doc[1]}`;
  return url;
}

// References in free text: URLs, plus bare issue ids like ABC-12 for team keys seen in Linear.
// Only known keys count, so "UTF-8" is not an issue.
export function referencesIn(text: string, issueKeys: Set<string>) {
  const references = new Set((text.match(/https?:\/\/[^\s<>|)"']+/g) ?? []).map(referenceOf));
  for (const [, key, number] of text.matchAll(/\b([A-Z]{2,6})-(\d+)\b/g))
    if (issueKeys.has(key)) references.add(`linear:${key}-${number}`);
  return [...references];
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const readText = (file: string) => (existsSync(file) ? readFileSync(file, "utf8").trim() : null);

function readExpected(directory: string, name: string) {
  const text = readText(join(directory, `${name}.expected`));
  return text === null ? null : Number(text);
}

export function ingestWeek(db: Database, directory: string, week: string, me: Config = config()) {
  const result: Record<string, Status> = {};
  const now = new Date().toISOString();
  const insertEvent =
    db.query(`INSERT INTO events (id, source, kind, week, occurred_at, title, url, author, project_id, milestone_id, payload, run_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, week=excluded.week, occurred_at=excluded.occurred_at, title=excluded.title,
      url=excluded.url, author=excluded.author, project_id=excluded.project_id, milestone_id=excluded.milestone_id,
      payload=excluded.payload, run_id=excluded.run_id`);
  const insertLink = db.query(
    "INSERT OR IGNORE INTO links (from_id, to_ref, rel) VALUES (?, ?, ?)",
  );

  for (const source of SOURCES) {
    const file = join(directory, `${source}.run.json`);
    if (!existsSync(file)) continue;
    const run = readJson(file);
    const runId = `${week}:${source}:${run.session_id ?? "unknown"}`;
    const out = run.structured_output;
    let count: Count = { expected: readExpected(directory, source), got: null };
    let status: Status = "error";
    if (!run.is_error && out) {
      checkWindow(source, out, week);
      count = countRows(source, out, directory, week, me, count.expected);
      status = statusOf(source, out, count);
    }
    result[source] = status;

    const step: Step = {
      db,
      directory,
      week,
      runId,
      now,
      me,
      event: (row) =>
        insertEvent.run(
          row.id,
          row.source,
          row.kind,
          row.week,
          row.at ?? null,
          row.title ?? null,
          row.url ?? null,
          row.author ?? null,
          row.projectId ?? null,
          row.milestoneId ?? null,
          JSON.stringify(row.payload),
          runId,
        ),
      link: (from, to, relation) => insertLink.run(from, to, relation),
    };
    db.transaction(() => {
      saveRun(db, run, runId, week, source, count, status, now);
      if (status !== "error") ingestSource(step, source, out);
    })();
  }
  return result;
}

// Trust boundary: the shape was enforced by --json-schema, so check only what it cannot.
// Reviews come from PRs updated since `from`, with every date, so one run covers each week after it.
function checkWindow(source: string, out: any, week: string) {
  if (source === "reviews" || source === "requests")
    check(
      out.from <= new Date(dayOf(week, 0)).toISOString().slice(0, 10),
      `${source}: collected from ${out.from}, after ${week} starts`,
    );
  else check(out.week === week, `${source}: collected ${out.week}, expected ${week}`);
}

// How many rows the run should have and how many it has. Sources without a count of their own
// keep the `.expected` file's number.
function countRows(
  source: string,
  out: any,
  directory: string,
  week: string,
  me: Config,
  expected: number | null,
): Count {
  if (source === "linear") return countLinear(out, week);
  if (source === "github") return { expected, got: countGithub(out, directory, week) };
  // Every PR from the search has one of your reviews: PRs missing from the rows were not read.
  if (source === "reviews") return { expected, got: prsByOthers(out.reviews, me) };
  if (source === "requests") return { expected, got: prsByOthers(out.prs, me) };
  if (source === "calendar") return { expected, got: out.events.length };
  if (source === "drive") return { expected, got: out.files.length };
  return countSlack(source, out, week);
}

const prsByOthers = (rows: any[], me: Config) =>
  new Set(rows.filter((row) => row.author !== me.github).map(prKey)).size;

// Claude copies every row; the window filter is ours. Its own picks are the check.
function countLinear(out: any, week: string): Count {
  const inWindow = new Set<string>(
    out.issues.filter((issue: any) => completedIn(issue, week)).map((issue: any) => issue.id),
  );
  const picked = new Set(out.attachments.map((attachment: any) => attachment.id));
  const missed = [...inWindow].filter((id) => !picked.has(id));
  if (missed.length)
    console.warn(`linear ${week}: no attachments collected for ${missed.join(", ")}`);
  return { expected: inWindow.size, got: inWindow.size - missed.length };
}

// PRs opened have their own count: a short list flags the run like a short merged list.
function countGithub(out: any, directory: string, week: string) {
  const opened = out.prs_opened ? new Set(out.prs_opened.map((pr: any) => pr.url)).size : null;
  const searched = readText(join(directory, "github_opened.expected"));
  if (opened != null && searched !== null && Number(searched) !== opened) {
    console.warn(`github ${week}: ${opened} PRs opened, search says ${searched}`);
    out.short = true;
  }
  return out.prs_merged.length;
}

// No source gives Slack a total. Every page but the last is full, so N pages hold at
// least (N-1) x 20 rows: Haiku read 11 pages and returned the first 20, saying it was done.
// A day call must return that day: one Saturday call came back with Monday's 93 rows.
// Rows more than a day off (time zones) are dropped and the run is flagged.
function countSlack(source: string, out: any, week: string): Count {
  const day = Number(source.match(/_(\d)$/)?.[1]);
  const millisecondsFromNoon = (message: any) =>
    Math.abs(Number(message.ts) * 1000 - dayOf(week, day - 1) - 12 * 36e5);
  const offDay = day
    ? out.messages.filter((message: any) => millisecondsFromNoon(message) > 36 * 36e5)
    : [];
  if (offDay.length) {
    console.warn(`${source} ${week}: dropped ${offDay.length} rows from other days`);
    out.messages = out.messages.filter((message: any) => !offDay.includes(message));
    out.dropped = offDay.length;
  }
  const got = out.messages.length;
  const expected = Math.max(0, (out.pages_read - 1) * SLACK_PAGE);
  if (!out.exhausted)
    console.warn(`slack ${week}: paging did not finish after ${out.pages_read} pages`);
  if (got < expected)
    console.warn(`${source} ${week}: ${out.pages_read} pages read but ${got} rows returned`);
  return { expected, got };
}

// Slack has a floor, not a total: at least as many rows as full pages is enough.
function statusOf(source: string, out: any, { expected, got }: Count): Status {
  const slack = source.startsWith("slack");
  const counted = expected == null || (slack ? got! >= expected : expected === got);
  const complete = out.exhausted !== false && !out.short && !(slack && out.dropped);
  return counted && complete ? "ok" : "count_mismatch";
}

function saveRun(
  db: Database,
  run: any,
  runId: string,
  week: string,
  source: string,
  { expected, got }: Count,
  status: Status,
  now: string,
) {
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
}

function ingestSource(step: Step, source: string, out: any) {
  if (source === "linear") ingestLinear(step, out);
  else if (source === "github") ingestGithub(step, out);
  else if (source === "reviews") ingestReviews(step, out);
  else if (source === "requests") ingestRequests(step, out);
  else if (source === "calendar") ingestCalendar(step, out);
  else if (source === "drive") ingestDrive(step, out);
  else ingestSlack(step, out);
}

// A count for the whole week, under your GitHub name: one event per kind and week.
function weekTotal(step: Step, kind: string, payload: unknown) {
  step.event({
    id: `github:${kind}:${step.week}`,
    source: "github",
    kind,
    week: step.week,
    author: step.me.github,
    payload,
  });
}

// Projects and milestones, then their ids by name, so issues can point at them.
function saveProjects(step: Step, projects: any[]) {
  const projectId = new Map<string, string>();
  const milestoneId = new Map<string, string>();
  for (const project of projects) {
    step.db
      .query(
        `INSERT INTO projects (id, name, url, lead, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, url=excluded.url, lead=excluded.lead, status=excluded.status, updated_at=excluded.updated_at`,
      )
      .run(project.id, project.name, project.url, project.lead, project.status, step.now);
    projectId.set(project.name, project.id);
    for (const milestone of project.milestones) {
      step.db
        .query(
          `INSERT INTO milestones (id, project_id, name, progress, target_date, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, progress=excluded.progress, target_date=excluded.target_date, updated_at=excluded.updated_at`,
        )
        .run(
          milestone.id,
          project.id,
          milestone.name,
          milestone.progress,
          milestone.target_date,
          step.now,
        );
      milestoneId.set(`${project.id}/${milestone.name}`, milestone.id);
    }
  }
  return { projectId, milestoneId };
}

function ingestLinear(step: Step, out: any) {
  const { week } = step;
  const { projectId, milestoneId } = saveProjects(step, out.projects);
  const urls = new Map<string, string[]>(
    out.attachments.map((attachment: any) => [attachment.id, attachment.urls]),
  );
  const current = isCurrentWeek(week);
  const seen = new Set<string>();
  for (const issue of out.issues) {
    const done = completedIn(issue, week);
    if (seen.has(issue.id) || !(done || (current && OPEN.has(issue.status_type)))) continue;
    seen.add(issue.id);
    const issueProjectId = issue.project_name ? (projectId.get(issue.project_name) ?? null) : null;
    if (issue.project_name && !issueProjectId)
      console.warn(
        `linear: ${issue.id} names project "${issue.project_name}", which was not collected`,
      );
    const issueMilestoneId =
      issueProjectId && issue.milestone_name
        ? (milestoneId.get(`${issueProjectId}/${issue.milestone_name}`) ?? null)
        : null;
    const id = `linear:${issue.id}`;
    step.event({
      id,
      source: "linear",
      kind: done ? "issue_completed" : "issue_open",
      week: done ? isoWeek(issue.completed_at) : week,
      at: issue.completed_at,
      title: issue.title,
      url: issue.url,
      projectId: issueProjectId,
      milestoneId: issueMilestoneId,
      payload: issue,
    });
    for (const url of urls.get(issue.id) ?? []) step.link(id, referenceOf(url), "attachment");
  }
}

// Team keys of the Linear issues already ingested, so bare ids in text can be told from noise.
function issueKeys(db: Database) {
  const rows = db
    .query(
      "SELECT DISTINCT substr(id, 8, instr(substr(id, 8), '-') - 1) k FROM events WHERE source = 'linear'",
    )
    .all() as { k: string }[];
  return new Set(rows.map((row) => row.k));
}

// A meeting is a regular event with someone else in it that you did not decline.
const isMeeting = (calendarEvent: any) =>
  calendarEvent.event_type === "DEFAULT" &&
  calendarEvent.status !== "cancelled" &&
  calendarEvent.my_response !== "declined" &&
  calendarEvent.attendees.length > 1;

function ingestCalendar(step: Step, out: any) {
  for (const calendarEvent of out.events) {
    const at = new Date(calendarEvent.start).toISOString();
    if (!isMeeting(calendarEvent) || isoWeek(at) !== step.week) continue;
    const id = `calendar:${calendarEvent.id}`;
    step.event({
      id,
      source: "calendar",
      kind: "meeting",
      week: step.week,
      at,
      title: calendarEvent.summary,
      url: calendarEvent.html_link,
      author: calendarEvent.organizer,
      payload: calendarEvent,
    });
    // Only typed refs: agendas also carry board and huddle links that would join unrelated threads.
    for (const url of calendarEvent.urls)
      if (referenceOf(url) !== url) step.link(id, referenceOf(url), "agenda");
  }
}

function ingestDrive(step: Step, out: any) {
  for (const file of out.files) {
    // Folders and shortcuts are made by Gemini notes, not by you.
    if (!DOC.test(file.mime_type)) continue;
    const created = isoWeek(file.created_time) === step.week;
    // A doc can change in many weeks, so the week is part of the id.
    const id = `drive:${file.id}:${step.week}`;
    step.event({
      id,
      source: "drive",
      kind: created ? "doc_created" : "doc_edited",
      week: step.week,
      at: created ? file.created_time : file.modified_time,
      title: file.title,
      url: file.url,
      payload: file,
    });
    step.link(id, referenceOf(file.url), "is");
  }
}

function ingestSlack(step: Step, out: any) {
  const keys = issueKeys(step.db);
  for (const message of out.messages) {
    const at = new Date(Number(message.ts) * 1000).toISOString();
    const mine = message.author_id === out.self_user_id;
    // Search matches the name anywhere, threads included; a mention must name you in the text.
    const namesMe =
      message.text.includes(`<@${out.self_user_id}`) || message.text.includes(step.me.name);
    // ponytail: GitHub app posts echo PRs the github source already has; match by name until Slack gives a bot flag.
    const echo = message.author_name === "GitHub";
    const notAMention = message.pass === "mention" && (mine || !namesMe || echo);
    if (isoWeek(at) !== step.week || notAMention) continue;
    const id = `slack:${message.channel_id}/${message.ts}`;
    step.event({
      id,
      source: "slack",
      kind: mine ? "slack_message" : "slack_mention",
      week: step.week,
      at,
      title: message.channel_name,
      url: message.permalink,
      author: message.author_name,
      payload: message,
    });
    channelTopic(step.db, message.channel_name);
    for (const reference of referencesIn(message.text, keys)) step.link(id, reference, "mentions");
  }
}

// Reviews given: the PRs you reviewed this week, counted by when you submitted the review.
function ingestReviews(step: Step, out: any) {
  // A review on a bot's PR (dependabot, renovate) is not help given to a person.
  const mine = out.reviews.filter(
    (review: any) =>
      review.author !== step.me.github &&
      !isBot(review.author) &&
      review.submitted_at &&
      isoWeek(review.submitted_at) === step.week,
  );
  weekTotal(step, "reviews_given", {
    count: new Set(mine.map(prKey)).size,
    submissions: mine.length,
  });
}

// Asked for a review in the week: PRs that named you, and PRs that named one of your teams.
// Bot PRs are left out, as in reviews given. ponytail: a request removed before the run
// (someone else reviewed for the team, the author took you off) is missed when the PR left both searches.
function ingestRequests(step: Step, out: any) {
  const teamsFile = join(step.directory, "teams.txt");
  const teams = existsSync(teamsFile)
    ? new Set(readFileSync(teamsFile, "utf8").split("\n").filter(Boolean))
    : null;
  const prs = out.prs.filter((pr: any) => pr.author !== step.me.github && !isBot(pr.author));
  const askedOf = (isReviewer: (reviewer: string) => boolean) =>
    prs.filter((pr: any) =>
      pr.requests.some(
        (request: any) => isReviewer(request.reviewer) && isoWeek(request.at) === step.week,
      ),
    ).length;
  weekTotal(step, "review_requests", {
    direct: askedOf((reviewer) => reviewer === step.me.github),
    team: teams ? askedOf((reviewer) => teams.has(reviewer)) : null,
  });
}

function ingestGithub(step: Step, out: any) {
  const { db, week, me } = step;
  // Claude copies anything shaped like ABC-123 from a PR body: eu-west-1, UTF-8, names. Only
  // your Linear teams' keys are issues. ponytail: teams seen in your issues; a PR citing another
  // team's issue loses that link, fetch the team list from Linear if that matters.
  const keys = issueKeys(db);
  const dropMentions = db.query("DELETE FROM links WHERE from_id = ? AND rel = 'mentions'");
  for (const [kind, prs] of [
    ["pr_merged", out.prs_merged],
    ["pr_open", out.prs_open],
  ] as const) {
    for (const pr of prs) {
      const id = `github:${pr.repo}#${pr.number}`;
      step.event({
        id,
        source: "github",
        kind,
        week: kind === "pr_merged" ? isoWeek(pr.at) : week,
        at: pr.at,
        title: pr.title,
        url: pr.url,
        author: me.github,
        payload: pr,
      });
      // Re-ingest replaces the links, so a fixed filter also removes old wrong ones.
      dropMentions.run(id);
      for (const reference of pr.linear_refs)
        if (keys.has(reference.split("-")[0])) step.link(id, `linear:${reference}`, "mentions");
    }
  }
  // Older runs have no PRs opened: the North tile shows 0 for them.
  if (out.prs_opened)
    weekTotal(step, "prs_opened", {
      count: new Set(out.prs_opened.map((pr: any) => pr.url)).size,
    });
  // Older runs counted PRs updated in the week; the reviews source replaces that count.
  if (out.reviews_given != null) weekTotal(step, "reviews_given", { count: out.reviews_given });
  for (const comment of out.review_comments_received) {
    const id = `github:${comment.url}`;
    step.event({
      id,
      source: "github",
      kind: "review_comment",
      week,
      url: comment.url,
      author: comment.author,
      payload: comment,
    });
    step.link(id, `github:${comment.repo}#${comment.number}`, "on");
  }
}

// "#internal-acme" → topic "Acme".
export function channelTopic(db: Database, channel: string) {
  if (!channel.startsWith("#internal-")) return;
  const name = channel
    .slice("#internal-".length)
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
  db.query(
    "INSERT INTO projects (id, name, kind, updated_at) VALUES (?, ?, 'topic', ?) ON CONFLICT DO NOTHING",
  ).run(`topic:${channel.slice(1)}`, name, new Date().toISOString());
}

if (import.meta.main) {
  const week = process.argv[2];
  check(/^\d{4}-W\d{2}$/.test(week ?? ""), "usage: bun jobs/ingest.ts 2026-W42");
  const result = ingestWeek(open(), join(DATA, "raw", week), week);
  for (const [source, status] of Object.entries(result))
    console.log(`${status === "ok" ? "✓" : "✗"} ${source} ${week}: ${status}`);
  if (Object.values(result).some((status) => status !== "ok")) process.exit(2);
}
