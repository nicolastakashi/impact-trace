// What the app can measure for a key result. Code counts; a key result only names the metric.
// "Now" is a rate over the last 4 closed weeks of the goal's quarter: a sum over a whole quarter
// only grows, so "requests drop from 8 to 3" could never be read from it.
import type { Database } from "bun:sqlite";
import { dayOf } from "./ingest";
import { labelsOf, reviewThreads } from "./review";

type Metric = { label: string; unit: string; better: "up" | "down"; value: (db: Database, weeks: string[]) => number | null };
const marks = (w: string[]) => w.map(() => "?").join(",");
const sumOf = (db: Database, kind: string, field: string, weeks: string[]) => weeks.length ? (db.query(`SELECT coalesce(sum(json_extract(payload, '$.' || ?)), 0) n
  FROM events WHERE kind = ? AND week IN (${marks(weeks)})`).get(field, kind, ...weeks) as any).n : 0;
const countOf = (db: Database, kind: string, weeks: string[]) => weeks.length ? (db.query(`SELECT count(*) n FROM events WHERE kind = ? AND week IN (${marks(weeks)})`).get(kind, ...weeks) as any).n : 0;
const avg = (n: number, w: string[]) => w.length ? +(n / w.length).toFixed(1) : null;
const median = (xs: number[]) => { const s = xs.sort((a, b) => a - b), h = s.length >> 1; return s.length ? +(s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2).toFixed(1) : null; };
// Kept threads with a mode, by your label first, then Claude's.
const keptIn = (db: Database, weeks: string[], mode: string) => weeks.reduce((n, w) => n + reviewThreads(db, w).filter((t) => {
  const l = labelsOf(db, t), v = (f: string) => (l.find((r) => r.field === f && r.source === "human") ?? l.find((r) => r.field === f && r.source === "claude"))?.value;
  return l.find((r) => r.field === "discard" && r.source === "human")?.value === "no" && v("mode") === mode; }).length, 0);

export const METRICS: Record<string, Metric> = {
  reviews_given: { label: "PRs you reviewed", unit: "PRs a week", better: "up", value: (db, w) => avg(sumOf(db, "reviews_given", "count", w), w) },
  give_vs_take: { label: "Give vs take (reviewed ÷ opened)", unit: "×", better: "up", value: (db, w) => {
    const o = sumOf(db, "prs_opened", "count", w); return o ? +(sumOf(db, "reviews_given", "count", w) / o).toFixed(2) : null; } },
  prs_merged: { label: "PRs you merged", unit: "PRs a week", better: "up", value: (db, w) => avg(countOf(db, "pr_merged", w), w) },
  lead_time_h: { label: "Lead time, median hours", unit: "h", better: "down", value: (db, w) => median((w.length ? db.query(`SELECT payload p FROM events
    WHERE kind = 'pr_merged' AND week IN (${marks(w)})`).all(...w) as any[] : []).map((r) => JSON.parse(r.p)).filter((p) => p.opened).map((p) => (Date.parse(p.at) - Date.parse(p.opened)) / 36e5)) },
  recognition: { label: "Recognition from others", unit: "a week", better: "up", value: (db, w) => w.length ? avg((db.query(`SELECT count(*) n FROM mention_kinds k JOIN events e ON e.id = k.event_id
    WHERE COALESCE(k.human_kind, k.kind) = 'praise' AND e.week IN (${marks(w)})`).get(...w) as any).n, w) : null },
  asked_direct: { label: "Review requests that name you", unit: "PRs a week", better: "up", value: (db, w) => avg(sumOf(db, "review_requests", "direct", w), w) },
  elevate_threads: { label: "Threads that elevate others", unit: "threads a week", better: "up", value: (db, w) => avg(keptIn(db, w, "elevate"), w) },
  external_threads: { label: "External threads (talks, upstream)", unit: "threads a week", better: "up", value: (db, w) => avg(keptIn(db, w, "external"), w) },
};

// "milestone:<id>": a Linear milestone's progress, for a key result that ships something.
export function measure(db: Database, metric: string, weeks: string[]) {
  if (metric.startsWith("milestone:")) return (db.query("SELECT progress p FROM milestones WHERE id = ?").get(metric.slice(10)) as any)?.p ?? null;
  return METRICS[metric]?.value(db, weeks) ?? null;
}
export const known = (db: Database, metric: string) => metric in METRICS || (metric.startsWith("milestone:") && !!db.query("SELECT 1 FROM milestones WHERE id = ?").get(metric.slice(10)));

// The last 4 closed weeks collected inside the quarter. No quarter: the last 4 closed weeks.
export function quarterWeeks(db: Database, quarter: string | null, now: string) {
  const all = (db.query("SELECT DISTINCT week FROM events WHERE week IS NOT NULL ORDER BY 1").all() as any[]).map((r) => r.week as string);
  const closed = all.filter((w) => w < now);
  if (!quarter) return closed.slice(-4);
  const [y, q] = quarter.split("-Q").map(Number), from = Date.UTC(y, (q - 1) * 3, 1), to = Date.UTC(y, q * 3, 1);
  return closed.filter((w) => { const m = dayOf(w, 0); return m >= from && m < to; }).slice(-4);
}

// 0 at the start, 1 at the target, either direction. null until both numbers and a value exist.
export function progress(start: number | null, target: number | null, value: number | null) {
  if (start == null || target == null || value == null || start === target) return null;
  return Math.max(0, Math.min(1, +((value - start) / (target - start)).toFixed(2)));
}
