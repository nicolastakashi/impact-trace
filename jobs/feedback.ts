// Feedback on how you show up, from your own Slack messages. Claude finds patterns and quotes them;
// this file keeps only quotes it finds in your messages and makes every count itself.
// Usage: bun jobs/feedback.ts emit 2026-W42 | claude -p "/weekly-feedback 2026-W42" ...
//        bun jobs/feedback.ts save 2026-W42 data/raw/2026-W42/feedback.run.json
import type { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config, open } from "../core/db";
import { reviewThreads } from "../core/threads";
import { modelOf, promptVersion, readJson, weekOutput } from "./claude";

// What Claude may flag, and who says it matters. Claude picks from this list; code drops anything else.
export const CATEGORIES: {
  id: string;
  kind: "pattern" | "strength";
  name: string;
  look_for: string;
  not?: string;
  refs: any[];
}[] = JSON.parse(readFileSync(join(import.meta.dir, "feedback-categories.json"), "utf8"));
const category = (id: string, kind: string) =>
  CATEGORIES.find((entry) => entry.id === id && entry.kind === kind);

type Message = { week: string; at: string; channel: string; text: string; url: string | null };

// The feedback window: the last 8 weeks with any events, up to this one, oldest first.
function windowWeeks(db: Database, week: string) {
  const rows = db
    .query("SELECT DISTINCT week FROM events WHERE week <= ? ORDER BY 1 DESC LIMIT 8")
    .all(week) as any[];
  return rows.map((row) => row.week).reverse() as string[];
}

function messagesIn(db: Database, weeks: string[]): Message[] {
  return db
    .query(
      `SELECT week, occurred_at at, title channel, url, json_extract(payload, '$.text') text FROM events
    WHERE kind = 'slack_message' AND week IN (${weeks.map(() => "?").join()}) ORDER BY occurred_at`,
    )
    .all(...weeks) as any[];
}

const squashSpaces = (text: string) => text.replace(/\s+/g, " ").trim();
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A marker matches as a whole phrase: "wdyt" in a message, not inside another word.
function matcher(markers: string[]) {
  const phrases = markers.map(
    (marker) => `(?<![\\w])${escapeRegExp(marker.toLowerCase())}(?![\\w])`,
  );
  const pattern = new RegExp(phrases.join("|"));
  return (message: Message) => pattern.test((message.text ?? "").toLowerCase());
}

function trend(messages: Message[], weeks: string[], markers: string[]) {
  const matches = matcher(markers);
  return weeks.map(
    (week) => messages.filter((message) => message.week === week && matches(message)).length,
  );
}

// Last week's experiment, measured: how often its markers showed up then and now.
function previous(db: Database, week: string, weeks: string[], messages: Message[]) {
  const row = db
    .query("SELECT week, output FROM feedback WHERE week < ? ORDER BY week DESC LIMIT 1")
    .get(week) as any;
  if (!row) return null;
  const verdict = db
    .query("SELECT verdict FROM feedback_verdicts WHERE week = ? AND item = 'experiment'")
    .get(row.week) as any;
  // You passed on that experiment: there is nothing to measure.
  if (verdict?.verdict === "reject") return null;
  const experiment = JSON.parse(row.output).experiment;
  const counts = experiment?.markers?.length ? trend(messages, weeks, experiment.markers) : null;
  return {
    week: row.week,
    pattern: experiment?.pattern,
    do: experiment?.do,
    markers: experiment?.markers ?? [],
    before: counts ? (counts[weeks.indexOf(row.week)] ?? null) : null,
    after: counts ? counts.at(-1) : null,
  };
}

// ISO week of a local date, e.g. 2026-W42. The Thursday of its week decides the year.
export function isoWeek(date: Date) {
  const weekday = (date.getDay() + 6) % 7;
  const thursday = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() + 3 - weekday),
  );
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const days = (thursday.getTime() - jan4.getTime()) / 864e5;
  const week = 1 + Math.round((days - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

const pad2 = (number: number) => String(number).padStart(2, "0");

// Mondays of the ended weeks that still have no feedback, oldest first. A week gets feedback only
// after it ends, so a Monday the Mac slept through, or a run that failed, shows up here the next day,
// even when a later week went fine. Weeks before your first feedback were collected before feedback
// existed: with none yet, only last week counts. At most 8 weeks back, the feedback window.
export function pendingMondays(today: Date, have: string[]) {
  const first = [...have].sort()[0];
  const pending: string[] = [];
  const thisMonday = today.getDate() - ((today.getDay() + 6) % 7);
  for (let weeksBack = 1; weeksBack <= 8; weeksBack++) {
    const monday = new Date(today.getFullYear(), today.getMonth(), thisMonday - 7 * weeksBack);
    const week = isoWeek(monday);
    if (first ? week < first : weeksBack > 1) break;
    if (!have.includes(week))
      pending.unshift(
        `${monday.getFullYear()}-${pad2(monday.getMonth() + 1)}-${pad2(monday.getDate())}`,
      );
  }
  return pending;
}

export function countMessages(db: Database, week: string) {
  const row = db
    .query("SELECT count(*) n FROM events WHERE kind = 'slack_message' AND week = ?")
    .get(week) as any;
  return row.n as number;
}

// Projects you had threads in during the window.
function projectsWorkedOn(db: Database, weeks: string[]) {
  const names = new Set<string>();
  for (const week of weeks)
    for (const thread of reviewThreads(db, week))
      for (const project of thread.projects) names.add(project.name);
  return [...names];
}

export function emit(db: Database, week: string) {
  const weeks = windowWeeks(db, week);
  const messages = messagesIn(db, weeks);
  const me = config();
  const led = db.query("SELECT name FROM projects WHERE lead = ?").all(me.name) as any[];
  return {
    week,
    level: me.level,
    weeks,
    projects_worked_on: projectsWorkedOn(db, weeks),
    projects_led: led.map((row) => row.name),
    categories: CATEGORIES.map(({ id, kind, name, look_for, not }) => ({
      id,
      kind,
      name,
      look_for,
      not,
    })),
    messages: messages.map((message) => ({
      week: message.week,
      at: message.at,
      channel: message.channel,
      text: message.text,
    })),
    previous: previous(db, week, weeks, messages),
    verdicts: db
      .query(
        "SELECT week, item, verdict, why FROM feedback_verdicts WHERE week < ? ORDER BY week DESC LIMIT 40",
      )
      .all(week),
  };
}

// A snippet around the first marker, so long messages still show why they counted.
function snippet(text: string, markers: string[]) {
  const lower = text.toLowerCase();
  const positions = markers
    .map((marker) => lower.indexOf(marker))
    .filter((position) => position >= 0);
  const first = Math.min(...positions);
  const start = Math.max(0, first - 110);
  const end = Math.min(text.length, first + 170);
  return `${start ? "… " : ""}${text.slice(start, end)}${end < text.length ? " …" : ""}`;
}

// Every counted message you do not see as a quote, so the count and the page always agree.
function others(messages: Message[], pattern: any) {
  const matches = matcher(pattern.markers);
  const quoted = (message: Message) =>
    pattern.evidence.some((evidence: any) =>
      squashSpaces(message.text ?? "").includes(evidence.quote),
    );
  return messages
    .filter((message) => matches(message) && !quoted(message))
    .map((message) => ({
      week: message.week,
      at: message.at,
      channel: message.channel,
      url: message.url,
      text: snippet(squashSpaces(message.text ?? ""), pattern.markers),
    }));
}

const quoteCount = (patterns: any[]) =>
  patterns.reduce((total: number, pattern: any) => total + pattern.evidence.length, 0);

export function verify(db: Database, week: string, out: any) {
  const weeks = windowWeeks(db, week);
  const messages = messagesIn(db, weeks);
  const findQuote = (quote: string) => {
    const text = squashSpaces(quote);
    if (text.length < 8) return undefined;
    return messages.find((message) => squashSpaces(message.text ?? "").includes(text));
  };
  // A quote is kept with the message it came from, or dropped.
  const cite = (evidence: any) => {
    const message = findQuote(evidence.quote);
    if (!message) return message;
    const quote = squashSpaces(evidence.quote);
    return {
      ...evidence,
      quote,
      week: message.week,
      at: message.at,
      channel: message.channel,
      url: message.url,
    };
  };
  // The name comes from the category, so a verdict on it means the same thing every week.
  const patterns = (out.patterns ?? [])
    .filter((pattern: any) => category(pattern.category, "pattern"))
    .map((pattern: any) => ({
      ...pattern,
      name: category(pattern.category, "pattern")!.name,
      markers: pattern.markers.map((marker: string) => marker.toLowerCase()),
      evidence: pattern.evidence.map(cite).filter(Boolean),
    }))
    .filter((pattern: any) => pattern.evidence.length >= 2)
    .map((pattern: any) => ({
      ...pattern,
      trend: trend(messages, weeks, pattern.markers),
      matches: others(messages, pattern),
    }));
  const strengthCategory = category(out.strength?.category, "strength");
  const strengthEvidence = strengthCategory
    ? (out.strength.evidence ?? []).map(cite).filter(Boolean)
    : [];
  const target = patterns.find((pattern: any) => pattern.category === out.experiment?.pattern);
  return {
    week,
    weeks,
    messages: weeks.map(
      (windowWeek) => messages.filter((message) => message.week === windowWeek).length,
    ),
    patterns,
    strength: strengthEvidence.length
      ? { ...out.strength, name: strengthCategory!.name, evidence: strengthEvidence }
      : null,
    experiment: target
      ? { ...out.experiment, pattern: target.name, markers: target.markers, trend: target.trend }
      : null,
    last_experiment: out.last_experiment ?? null,
    previous: previous(db, week, weeks, messages),
    dropped: quoteCount(out.patterns ?? []) - quoteCount(patterns),
  };
}

// No messages from you that week, so nothing to judge: the row still marks the week as closed.
function saveEmpty(db: Database, week: string) {
  const nothing = { patterns: [], strength: null, experiment: null, last_experiment: null };
  db.query("INSERT OR REPLACE INTO feedback VALUES (?, ?, NULL, NULL, 0, ?)").run(
    week,
    JSON.stringify(verify(db, week, nothing)),
    new Date().toISOString(),
  );
  return { week, empty: true };
}

function saveFeedback(db: Database, week: string, run: any) {
  const out = weekOutput(run, week, "feedback");
  // The categories are part of the prompt too.
  const version = promptVersion("weekly-feedback", JSON.stringify(CATEGORIES));
  const verified = verify(db, week, out);
  db.query(
    `INSERT INTO feedback VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (week) DO UPDATE SET output = excluded.output, model = excluded.model,
      prompt_version = excluded.prompt_version, cost_usd = excluded.cost_usd, at = excluded.at`,
  ).run(
    week,
    JSON.stringify(verified),
    modelOf(run),
    version,
    run.total_cost_usd ?? null,
    new Date().toISOString(),
  );
  return {
    patterns: verified.patterns.length,
    quotes_dropped: verified.dropped,
    experiment: !!verified.experiment?.trend,
  };
}

if (import.meta.main) {
  const [command, week, file] = process.argv.slice(2);
  const db = open();
  if (command === "emit") console.log(JSON.stringify(emit(db, week)));
  else if (command === "pending") {
    const have = (db.query("SELECT week FROM feedback").all() as any[]).map((row) => row.week);
    console.log(pendingMondays(new Date(), have).join("\n"));
  } else if (command === "count") console.log(countMessages(db, week));
  else if (command === "empty") console.log(saveEmpty(db, week));
  else if (command === "save") console.log(saveFeedback(db, week, readJson(file)));
  else throw new Error("usage: bun jobs/feedback.ts emit|save|count|empty <week> [file] | pending");
}
