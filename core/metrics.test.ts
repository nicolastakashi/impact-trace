import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { migrate } from "./db";
import { current, measure, progress, quarterWeeks } from "./metrics";

const freshDb = () => {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  return db;
};
const addEvent = (d: Database, id: string, kind: string, week: string, payload: any) =>
  d
    .query(
      `INSERT INTO events (id, source, kind, week, occurred_at, title, url, author, project_id, milestone_id, payload, run_id)
  VALUES (?, 'github', ?, ?, null, null, null, null, null, null, ?, 'r')`,
    )
    .run(id, kind, week, JSON.stringify(payload));

test("progress runs from start to target, both ways, and stops at the ends", () => {
  expect(progress(10, 20, 15)).toBe(0.5);
  expect(progress(40, 10, 25)).toBe(0.5); // lead time going down
  expect(progress(10, 20, 30)).toBe(1);
  expect(progress(10, 20, 5)).toBe(0);
  expect(progress(null, 20, 5)).toBeNull();
});

test("quarter weeks are the last 4 closed weeks that start in it", () => {
  const d = freshDb();
  for (const w of [
    "2026-W34",
    "2026-W36",
    "2026-W37",
    "2026-W39",
    "2026-W40",
    "2026-W42",
    "2026-W43",
  ])
    addEvent(d, `e${w}`, "pr_merged", w, {});
  // W40 starts on Monday 28 September, so it is Q3; W41 would be the first of Q4. W43 is still open.
  expect(quarterWeeks(d, "2026-Q4", "2026-W43")).toEqual(["2026-W42"]);
  expect(quarterWeeks(d, "2026-Q3", "2026-W43")).toEqual([
    "2026-W36",
    "2026-W37",
    "2026-W39",
    "2026-W40",
  ]);
  expect(quarterWeeks(d, null, "2026-W43")).toEqual([
    "2026-W37",
    "2026-W39",
    "2026-W40",
    "2026-W42",
  ]);
});

test("metrics are a rate over the weeks asked for", () => {
  const d = freshDb();
  addEvent(d, "r1", "reviews_given", "2026-W42", { count: 6 });
  addEvent(d, "r2", "reviews_given", "2026-W43", { count: 3 });
  addEvent(d, "o1", "prs_opened", "2026-W42", { count: 4 });
  addEvent(d, "o2", "prs_opened", "2026-W43", { count: 2 });
  addEvent(d, "p1", "pr_merged", "2026-W43", {
    at: "2026-10-20T12:00:00Z",
    opened: "2026-10-20T00:00:00Z",
  });
  addEvent(d, "p2", "pr_merged", "2026-W43", {
    at: "2026-10-21T00:00:00Z",
    opened: "2026-10-20T00:00:00Z",
  });
  expect(measure(d, "reviews_given", ["2026-W42", "2026-W43"])).toBe(4.5); // a week
  expect(measure(d, "give_vs_take", ["2026-W42", "2026-W43"])).toBe(1.5);
  expect(measure(d, "lead_time_h", ["2026-W43"])).toBe(18);
  expect(measure(d, "give_vs_take", [])).toBeNull();
  expect(measure(d, "nope", ["2026-W43"])).toBeNull();
});

test("key results written as text become key results", () => {
  const d = new Database(":memory:", { strict: true });
  // Stop before 014, write an old goal, then run the rest.
  const dir = join(import.meta.dir, "../db/migrations");
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files.slice(0, 13)) d.exec(readFileSync(join(dir, file), "utf8"));
  d.exec("PRAGMA user_version = 13");
  d.query("INSERT INTO goals (title, kind, krs, at) VALUES ('Exports GA', 'team', ?, 'now')").run(
    "3 customers on it\n\n  docs live  \n",
  );
  migrate(d);
  expect(d.query("SELECT pos, text, metric FROM key_results ORDER BY pos").all()).toEqual([
    { pos: 1, text: "3 customers on it", metric: null },
    { pos: 3, text: "docs live", metric: null },
  ]);
  expect((d.query("SELECT type FROM goals").get() as any).type).toBe("aspirational");
});

test("a rare event is the quarter's total so far, this week too; a flow is a rate of closed weeks", () => {
  const d = freshDb();
  // W39 is Q3. W41–W43 are Q4, and W43 is this week, still open.
  for (const w of ["2026-W39", "2026-W41", "2026-W43"]) {
    addEvent(d, `m${w}`, "slack_mention", w, {});
    d.query(
      "INSERT INTO mention_kinds (event_id, kind, about, quote, model, prompt_version, at) VALUES (?, 'praise', null, null, 'm', 'v', 'x')",
    ).run(`m${w}`);
    addEvent(d, `r${w}`, "reviews_given", w, { count: 6 });
  }
  expect(current(d, "recognition", "2026-Q4", "2026-W43")).toBe(2);
  expect(current(d, "recognition", "2026-Q3", "2026-W43")).toBe(1);
  // W39 and W41 are the closed weeks, whatever the quarter.
  expect(current(d, "reviews_given", "2026-Q4", "2026-W43")).toBe(6);
  addEvent(d, "r2026-W42", "reviews_given", "2026-W42", { count: 0 });
  expect(current(d, "reviews_given", "2026-Q4", "2026-W43")).toBe(4);
});
