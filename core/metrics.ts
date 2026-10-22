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
  agg: "rate" | "total";
  value: (db: Database, weeks: string[]) => number | null;
};
const marks = placeholders;
const sumOf = (db: Database, kind: string, field: string, weeks: string[]) =>
  weeks.length
    ? (
        db
          .query(
            `SELECT coalesce(sum(json_extract(payload, '$.' || ?)), 0) n
  FROM events WHERE kind = ? AND week IN (${marks(weeks)})`,
          )
          .get(field, kind, ...weeks) as any
      ).n
    : 0;
const countOf = (db: Database, kind: string, weeks: string[]) =>
  weeks.length
    ? (
        db
          .query(`SELECT count(*) n FROM events WHERE kind = ? AND week IN (${marks(weeks)})`)
          .get(kind, ...weeks) as any
      ).n
    : 0;
const avg = (n: number, w: string[]) => (w.length ? +(n / w.length).toFixed(1) : null);
// Median, not mean: one PR open for a month would drag a mean. null for no values.
export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return +value.toFixed(1);
}
// Hours from opened to merged, for merged PRs that know when they were opened.
export const leadTimeHours = (prs: { at: string; opened?: string }[]) =>
  prs.filter((pr) => pr.opened).map((pr) => (Date.parse(pr.at) - Date.parse(pr.opened!)) / 36e5);
// Kept threads with a mode, by your label first, then Claude's.
const keptIn = (db: Database, weeks: string[], mode: string) =>
  weeks.reduce(
    (n, w) =>
      n +
      reviewThreads(db, w).filter((t) => {
        const l = labelsOf(db, t);
        return discardOf(l) === "no" && labelValue(l, "mode") === mode;
      }).length,
    0,
  );

export const METRICS: Record<string, Metric> = {
  reviews_given: {
    label: "PRs you reviewed",
    unit: "PRs a week",
    better: "up",
    agg: "rate",
    value: (db, w) => avg(sumOf(db, "reviews_given", "count", w), w),
  },
  give_vs_take: {
    label: "Give vs take (reviewed ÷ opened)",
    unit: "×",
    better: "up",
    agg: "rate",
    value: (db, w) => {
      const o = sumOf(db, "prs_opened", "count", w);
      return o ? +(sumOf(db, "reviews_given", "count", w) / o).toFixed(2) : null;
    },
  },
  prs_merged: {
    label: "PRs you merged",
    unit: "PRs a week",
    better: "up",
    agg: "rate",
    value: (db, w) => avg(countOf(db, "pr_merged", w), w),
  },
  lead_time_h: {
    label: "Lead time, median hours",
    unit: "h",
    better: "down",
    agg: "rate",
    value: (db, w) =>
      median(
        leadTimeHours(
          (w.length
            ? (db
                .query(
                  `SELECT payload p FROM events
    WHERE kind = 'pr_merged' AND week IN (${marks(w)})`,
                )
                .all(...w) as any[])
            : []
          ).map((r) => JSON.parse(r.p)),
        ),
      ),
  },
  recognition: {
    label: "Recognition from others",
    unit: "praise",
    better: "up",
    agg: "total",
    value: (db, w) =>
      w.length
        ? (
            db
              .query(
                `SELECT count(*) n FROM mention_kinds k JOIN events e ON e.id = k.event_id
    WHERE COALESCE(k.human_kind, k.kind) = 'praise' AND e.week IN (${marks(w)})`,
              )
              .get(...w) as any
          ).n
        : 0,
  },
  asked_direct: {
    label: "Review requests that name you",
    unit: "PRs a week",
    better: "up",
    agg: "rate",
    value: (db, w) => avg(sumOf(db, "review_requests", "direct", w), w),
  },
  elevate_threads: {
    label: "Threads that elevate others",
    unit: "threads",
    better: "up",
    agg: "total",
    value: (db, w) => keptIn(db, w, "elevate"),
  },
  external_threads: {
    label: "External threads (talks, upstream)",
    unit: "threads",
    better: "up",
    agg: "total",
    value: (db, w) => keptIn(db, w, "external"),
  },
};

// "milestone:<id>": a Linear milestone's progress, for a key result that ships something.
export function measure(db: Database, metric: string, weeks: string[]) {
  if (metric.startsWith("milestone:"))
    return (
      (db.query("SELECT progress p FROM milestones WHERE id = ?").get(metric.slice(10)) as any)
        ?.p ?? null
    );
  return METRICS[metric]?.value(db, weeks) ?? null;
}
export const known = (db: Database, metric: string) =>
  metric in METRICS ||
  (metric.startsWith("milestone:") &&
    !!db.query("SELECT 1 FROM milestones WHERE id = ?").get(metric.slice(10)));

// The weeks a metric reads now: see the top of this file.
export const weeksFor = (db: Database, metric: string, quarter: string | null, now: string) =>
  METRICS[metric]?.agg === "total" ? quarterAll(db, quarter, now) : quarterWeeks(db, null, now);
export const current = (db: Database, metric: string, quarter: string | null, now: string) =>
  measure(db, metric, weeksFor(db, metric, quarter, now));

// Every collected week of the quarter up to now, this one too. No quarter: every collected week.
export function quarterAll(db: Database, quarter: string | null, now: string) {
  const all = (
    db
      .query("SELECT DISTINCT week FROM events WHERE week IS NOT NULL AND week <= ? ORDER BY 1")
      .all(now) as any[]
  ).map((r) => r.week as string);
  return quarter ? all.filter((w) => inQuarter(w, quarter)) : all;
}
const inQuarter = (w: string, quarter: string) => {
  const [y, q] = quarter.split("-Q").map(Number),
    m = dayOf(w, 0);
  return m >= Date.UTC(y, (q - 1) * 3, 1) && m < Date.UTC(y, q * 3, 1);
};

// The last 4 closed weeks collected inside the quarter. No quarter: the last 4 closed weeks.
export function quarterWeeks(db: Database, quarter: string | null, now: string) {
  const all = (
    db.query("SELECT DISTINCT week FROM events WHERE week IS NOT NULL ORDER BY 1").all() as any[]
  ).map((r) => r.week as string);
  const closed = all.filter((w) => w < now);
  return (quarter ? closed.filter((w) => inQuarter(w, quarter)) : closed).slice(-4);
}

// 0 at the start, 1 at the target, either direction. null until both numbers and a value exist.
export function progress(start: number | null, target: number | null, value: number | null) {
  if (start == null || target == null || value == null || start === target) return null;
  return Math.max(0, Math.min(1, +((value - start) / (target - start)).toFixed(2)));
}
