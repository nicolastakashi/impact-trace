// Objectives Claude drafts from your data. Claude picks what to aim for; code checks each draft
// and sets every start it can measure, so a draft never invents where you are today.
// Usage: bun jobs/drafts.ts emit > in.json   |   bun jobs/drafts.ts save run.json
import type { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { CONFIG, isoWeek, open } from "../core/db";
import { current, known, METRICS, quarterAll } from "../core/metrics";
import { promptVersion, readJson } from "./claude";
import { facts, fetchAppFacts, localTimeZone } from "./facts";

export const quarterOf = (date: Date) =>
  `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;

function lastQuarter(quarter: string) {
  const [year, quarterNumber] = quarter.split("-Q").map(Number);
  return quarterNumber > 1 ? `${year}-Q${quarterNumber - 1}` : `${year - 1}-Q4`;
}

// The setup page may not have run yet: then there is no level.
function levelOrNull() {
  let saved;
  try {
    saved = JSON.parse(readFileSync(CONFIG, "utf8"));
  } catch {
    saved = {};
  }
  return saved.level ?? null;
}

// What Claude reads: what the app can measure and where you are on it, your projects'
// milestones, the goals you already have, and the facts North shows.
export function draftInput(db: Database, northFacts: any, now = new Date()) {
  const week = isoWeek(now.toISOString());
  const quarter = quarterOf(now);
  return {
    quarter,
    quarter_weeks_so_far: quarterAll(db, quarter, week).length,
    level: levelOrNull(),
    // A rate is per week, last 4 weeks. A total is this quarter so far; last_quarter is its whole total.
    metrics: Object.entries(METRICS).map(([key, metric]) => ({
      key,
      label: metric.label,
      unit: metric.unit,
      better: metric.better,
      agg: metric.agg,
      now: current(db, key, quarter, week),
      ...(metric.agg === "total"
        ? { last_quarter: current(db, key, lastQuarter(quarter), week) }
        : {}),
    })),
    milestones: db
      .query(
        `SELECT 'milestone:' || m.id metric, m.name, m.progress, p.name project FROM milestones m JOIN projects p ON p.id = m.project_id
      WHERE m.progress < 100 ORDER BY p.name, m.name`,
      )
      .all(),
    your_goals: db
      .query("SELECT title FROM goals")
      .all()
      .map((goal: any) => goal.title),
    facts: northFacts,
  };
}

// A trimmed, non-empty string of at most `max` characters, or null.
const shortText = (value: any, max: number) =>
  typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null;

const numbersIn = (text: string) => text.match(/\d+(?:\.\d+)?/g) ?? [];

// What every check of one run needs: the input as text, where you are now, and the drop list.
type Check = { db: Database; input: string; quarter: string; week: string; dropped: string[] };

// A number counts as yours when it stands alone somewhere in the input.
const inData = (check: Check, number: string) =>
  new RegExp(`(?<![\\d.])${number.replace(".", "\\.")}(?![\\d])`).test(check.input);

function checkedKeyResult(check: Check, title: string, keyResult: any) {
  const text = shortText(keyResult.text, 200);
  const metric = keyResult.metric || null;
  if (!text || !Number.isFinite(keyResult.target) || (metric && !known(check.db, metric))) {
    check.dropped.push(`${title} / ${keyResult.text}: bad key result`);
    return [];
  }
  const made = numbersIn(text).filter(
    (number) => number !== String(keyResult.target) && !inData(check, number),
  );
  if (made.length) {
    check.dropped.push(`${title} / ${text}: numbers not in your data: ${made.join(", ")}`);
    return [];
  }
  return [{ text, metric, start: start(check, keyResult, metric), target: keyResult.target }];
}

// A start the app can measure is code's. Any other start must be copied from your data:
// Claude averaged weeks itself once (2.75), so a number it worked out stays empty for you.
// A quarter total starts at 0.
function start(check: Check, keyResult: any, metric: string | null) {
  if (metric)
    return METRICS[metric]?.agg === "total"
      ? 0
      : current(check.db, metric, check.quarter, check.week);
  return Number.isFinite(keyResult.start) && inData(check, String(keyResult.start))
    ? keyResult.start
    : null;
}

function checkedGoal(check: Check, goal: any) {
  const title = shortText(goal.title, 120);
  const why = shortText(goal.why, 400);
  const validKind = ["team", "personal"].includes(goal.kind);
  const validType = ["committed", "aspirational"].includes(goal.type);
  if (!title || !why || !validKind || !validType) {
    check.dropped.push(`${goal.title}: bad fields`);
    return [];
  }
  // Each "based on" must be copied from the input; anything else is Claude's own story.
  const based_on = (goal.based_on ?? []).filter(
    (basis: any) =>
      typeof basis === "string" &&
      basis.length >= 4 &&
      check.input.includes(JSON.stringify(basis).slice(1, -1)),
  );
  if (!based_on.length) {
    check.dropped.push(`${title}: nothing it is based on is in your data`);
    return [];
  }
  // A number in "why" is copied from your data, or the draft goes. ponytail: matches digits
  // anywhere in the input, so a wrong number that exists elsewhere slips through.
  const made = numbersIn(why).filter((number) => !inData(check, number));
  if (made.length) {
    check.dropped.push(`${title}: numbers not in your data: ${made.join(", ")}`);
    return [];
  }
  const keyResults = (goal.key_results ?? [])
    .slice(0, 5)
    .flatMap((keyResult: any) => checkedKeyResult(check, title, keyResult));
  if (!keyResults.length) {
    check.dropped.push(`${title}: no key result left`);
    return [];
  }
  return [{ title, kind: goal.kind, type: goal.type, why, based_on, keyResults }];
}

// Replaces the drafts you have not used. Returns what was saved and why anything was dropped.
export function saveDrafts(db: Database, run: any, input: any, version: string, now = new Date()) {
  const out = run.structured_output;
  const check: Check = {
    db,
    input: JSON.stringify(input),
    quarter: quarterOf(now),
    week: isoWeek(now.toISOString()),
    dropped: [],
  };
  if (run.is_error || !Array.isArray(out?.objectives))
    throw new Error(`Claude failed: ${run.result ?? "no objectives"}`);
  const drafts = out.objectives.slice(0, 5).flatMap((goal: any) => checkedGoal(check, goal));
  const at = now.toISOString();
  db.transaction(() => {
    db.query("DELETE FROM goal_drafts").run();
    const put = db.query(
      "INSERT INTO goal_drafts (title, kind, type, quarter, why, based_on, krs, model, prompt_version, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const draft of drafts)
      put.run(
        draft.title,
        draft.kind,
        draft.type,
        check.quarter,
        draft.why,
        JSON.stringify(draft.based_on),
        JSON.stringify(draft.keyResults),
        "sonnet",
        version,
        at,
      );
  })();
  return { saved: drafts.length, dropped: check.dropped, cost: run.total_cost_usd ?? null };
}

if (import.meta.main) {
  const [command, file, inputFile] = process.argv.slice(2);
  const db = open();
  if (command === "emit") {
    const northFacts = facts(await fetchAppFacts(), localTimeZone());
    console.log(JSON.stringify(draftInput(db, northFacts)));
  } else if (command === "save") {
    const version = promptVersion("draft-goals");
    console.log(saveDrafts(db, readJson(file), readJson(inputFile), version));
  } else throw new Error("usage: bun jobs/drafts.ts emit | save <run.json> <in.json>");
}
