// What the app can measure for a key result. Code counts; a key result only names the metric.
// Two kinds of "now":
// - rate: per week over the last 4 closed weeks, across quarters: it says where you are now. Flow you have every week (reviews, lead time),
//   where a quarter's sum only grows and "requests drop from 8 to 3" could never be read.
// - total: the quarter so far, from 0. Rare events (praise, a talk), where a week without one
//   is normal and a weekly rate reads as failure.
import type { Database } from "bun:sqlite";
import { dayOf, placeholders } from "./db";
import { discardOf, labelsOf, labelValue, reviewThreads } from "./threads";

type Metric = {
  label: string;
  unit: string;
  better: "up" | "down";
  aggregation: "rate" | "total";
  value: (db: Database, weeks: string[]) => number | null;
};
// "IN ()" is not valid SQL, so every query below returns early for no weeks.
function sumOf(db: Database, kind: string, field: string, weeks: string[]) {
  if (!weeks.length) return 0;
  const row = db
    .query(
      `SELECT coalesce(sum(json_extract(payload, '$.' || ?)), 0) total
  FROM events WHERE kind = ? AND week IN (${placeholders(weeks)})`,
    )
    .get(field, kind, ...weeks) as any;
  return row.total;
}
function countOf(db: Database, kind: string, weeks: string[]) {
  if (!weeks.length) return 0;
  const row = db
    .query(`SELECT count(*) total FROM events WHERE kind = ? AND week IN (${placeholders(weeks)})`)
    .get(kind, ...weeks) as any;
  return row.total;
}
function praiseCount(db: Database, weeks: string[]) {
  if (!weeks.length) return 0;
  const row = db
    .query(
      `SELECT count(*) total FROM mention_kinds k JOIN events e ON e.id = k.event_id
    WHERE COALESCE(k.human_kind, k.kind) = 'praise' AND e.week IN (${placeholders(weeks)})`,
    )
    .get(...weeks) as any;
  return row.total;
}
function mergedPrs(db: Database, weeks: string[]) {
  if (!weeks.length) return [];
  const rows = db
    .query(
      `SELECT payload FROM events
    WHERE kind = 'pr_merged' AND week IN (${placeholders(weeks)})`,
    )
    .all(...weeks) as any[];
  return rows.map((row) => JSON.parse(row.payload));
}
const perWeek = (total: number, weeks: string[]) =>
  weeks.length ? +(total / weeks.length).toFixed(1) : null;
function giveVsTake(db: Database, weeks: string[]) {
  const opened = sumOf(db, "prs_opened", "count", weeks);
  if (!opened) return null;
  return +(sumOf(db, "reviews_given", "count", weeks) / opened).toFixed(2);
}

// Median, not mean: one PR open for a month would drag a mean. null for no values.
export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return +value.toFixed(1);
}
// Hours from opened to merged, for merged PRs that know when they were opened.
export const leadTimeHours = (prs: { at: string; opened?: string }[]) =>
  prs.filter((pr) => pr.opened).map((pr) => (Date.parse(pr.at) - Date.parse(pr.opened!)) / 36e5);

// Kept threads with a mode, by your label first, then Claude's.
function keptIn(db: Database, weeks: string[], mode: string) {
  let count = 0;
  for (const week of weeks)
    for (const thread of reviewThreads(db, week)) {
      const labels = labelsOf(db, thread);
      if (discardOf(labels) === "no" && labelValue(labels, "mode") === mode) count++;
    }
  return count;
}

export const METRICS: Record<string, Metric> = {
  reviews_given: {
    label: "PRs you reviewed",
    unit: "PRs a week",
    better: "up",
    aggregation: "rate",
    value: (db, weeks) => perWeek(sumOf(db, "reviews_given", "count", weeks), weeks),
  },
  give_vs_take: {
    label: "Give vs take (reviewed ÷ opened)",
    unit: "×",
    better: "up",
    aggregation: "rate",
    value: giveVsTake,
  },
  prs_merged: {
    label: "PRs you merged",
    unit: "PRs a week",
    better: "up",
    aggregation: "rate",
    value: (db, weeks) => perWeek(countOf(db, "pr_merged", weeks), weeks),
  },
  lead_time_h: {
    label: "Lead time, median hours",
    unit: "h",
    better: "down",
    aggregation: "rate",
    value: (db, weeks) => median(leadTimeHours(mergedPrs(db, weeks))),
  },
  recognition: {
    label: "Recognition from others",
    unit: "praise",
    better: "up",
    aggregation: "total",
    value: praiseCount,
  },
  asked_direct: {
    label: "Review requests that name you",
    unit: "PRs a week",
    better: "up",
    aggregation: "rate",
    value: (db, weeks) => perWeek(sumOf(db, "review_requests", "direct", weeks), weeks),
  },
  elevate_threads: {
    label: "Threads that elevate others",
    unit: "threads",
    better: "up",
    aggregation: "total",
    value: (db, weeks) => keptIn(db, weeks, "elevate"),
  },
  external_threads: {
    label: "External threads (talks, upstream)",
    unit: "threads",
    better: "up",
    aggregation: "total",
    value: (db, weeks) => keptIn(db, weeks, "external"),
  },
};

// "milestone:<id>": a Linear milestone's progress, for a key result that ships something.
const MILESTONE = "milestone:";
const milestoneId = (metric: string) =>
  metric.startsWith(MILESTONE) ? metric.slice(MILESTONE.length) : null;

export function measure(db: Database, metric: string, weeks: string[]) {
  const milestone = milestoneId(metric);
  if (milestone !== null) {
    const row = db.query("SELECT progress FROM milestones WHERE id = ?").get(milestone) as any;
    return row?.progress ?? null;
  }
  return METRICS[metric]?.value(db, weeks) ?? null;
}
export function known(db: Database, metric: string) {
  if (metric in METRICS) return true;
  const milestone = milestoneId(metric);
  return milestone !== null && !!db.query("SELECT 1 FROM milestones WHERE id = ?").get(milestone);
}

// The weeks a metric reads now: see the top of this file.
export const weeksFor = (db: Database, metric: string, quarter: string | null, now: string) =>
  METRICS[metric]?.aggregation === "total"
    ? quarterAll(db, quarter, now)
    : quarterWeeks(db, null, now);
export const current = (db: Database, metric: string, quarter: string | null, now: string) =>
  measure(db, metric, weeksFor(db, metric, quarter, now));

// Every week that has events, oldest first.
const collectedWeeks = (db: Database) =>
  (
    db.query("SELECT DISTINCT week FROM events WHERE week IS NOT NULL ORDER BY 1").all() as any[]
  ).map((row) => row.week as string);

// A week belongs to the quarter its Monday is in.
function inQuarter(week: string, quarter: string) {
  const [year, quarterNumber] = quarter.split("-Q").map(Number);
  const monday = dayOf(week, 0);
  return (
    monday >= Date.UTC(year, (quarterNumber - 1) * 3, 1) &&
    monday < Date.UTC(year, quarterNumber * 3, 1)
  );
}

// Every collected week of the quarter up to now, this one too. No quarter: every collected week.
export function quarterAll(db: Database, quarter: string | null, now: string) {
  const upToNow = collectedWeeks(db).filter((week) => week <= now);
  return quarter ? upToNow.filter((week) => inQuarter(week, quarter)) : upToNow;
}

// The last 4 closed weeks collected inside the quarter. No quarter: the last 4 closed weeks.
export function quarterWeeks(db: Database, quarter: string | null, now: string) {
  const closed = collectedWeeks(db).filter((week) => week < now);
  return (quarter ? closed.filter((week) => inQuarter(week, quarter)) : closed).slice(-4);
}

// 0 at the start, 1 at the target, either direction. null until both numbers and a value exist.
export function progress(start: number | null, target: number | null, value: number | null) {
  if (start == null || target == null || value == null || start === target) return null;
  return Math.max(0, Math.min(1, +((value - start) / (target - start)).toFixed(2)));
}
