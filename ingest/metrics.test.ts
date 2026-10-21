import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { migrate } from "./ingest";
import { measure, progress, quarterWeeks } from "./metrics";

const db = () => { const d = new Database(":memory:", { strict: true }); migrate(d); return d; };
const ev = (d: Database, id: string, kind: string, week: string, payload: any) => d.query(`INSERT INTO events (id, source, kind, week, occurred_at, title, url, author, project_id, milestone_id, payload, run_id)
  VALUES (?, 'github', ?, ?, null, null, null, null, null, null, ?, 'r')`).run(id, kind, week, JSON.stringify(payload));

test("progress runs from start to target, both ways, and stops at the ends", () => {
  expect(progress(10, 20, 15)).toBe(0.5);
  expect(progress(40, 10, 25)).toBe(0.5); // lead time going down
  expect(progress(10, 20, 30)).toBe(1);
  expect(progress(10, 20, 5)).toBe(0);
  expect(progress(null, 20, 5)).toBeNull();
});

test("quarter weeks are the last 4 closed weeks that start in it", () => {
  const d = db();
  for (const w of ["2026-W34", "2026-W36", "2026-W37", "2026-W39", "2026-W40", "2026-W42", "2026-W43"]) ev(d, `e${w}`, "pr_merged", w, {});
  // W40 starts on Monday 28 September, so it is Q3; W41 would be the first of Q4. W43 is still open.
  expect(quarterWeeks(d, "2026-Q4", "2026-W43")).toEqual(["2026-W42"]);
  expect(quarterWeeks(d, "2026-Q3", "2026-W43")).toEqual(["2026-W36", "2026-W37", "2026-W39", "2026-W40"]);
  expect(quarterWeeks(d, null, "2026-W43")).toEqual(["2026-W37", "2026-W39", "2026-W40", "2026-W42"]);
});

test("metrics are a rate over the weeks asked for", () => {
  const d = db();
  ev(d, "r1", "reviews_given", "2026-W42", { count: 6 }); ev(d, "r2", "reviews_given", "2026-W43", { count: 3 });
  ev(d, "o1", "prs_opened", "2026-W42", { count: 4 }); ev(d, "o2", "prs_opened", "2026-W43", { count: 2 });
  ev(d, "p1", "pr_merged", "2026-W43", { at: "2026-10-20T12:00:00Z", opened: "2026-10-20T00:00:00Z" });
  ev(d, "p2", "pr_merged", "2026-W43", { at: "2026-10-21T00:00:00Z", opened: "2026-10-20T00:00:00Z" });
  expect(measure(d, "reviews_given", ["2026-W42", "2026-W43"])).toBe(4.5); // a week
  expect(measure(d, "give_vs_take", ["2026-W42", "2026-W43"])).toBe(1.5);
  expect(measure(d, "lead_time_h", ["2026-W43"])).toBe(18);
  expect(measure(d, "give_vs_take", [])).toBeNull();
  expect(measure(d, "nope", ["2026-W43"])).toBeNull();
});

test("key results written as text become key results", () => {
  const d = new Database(":memory:", { strict: true });
  // Stop before 014, write an old goal, then run the rest.
  const { readdirSync, readFileSync } = require("node:fs"), { join } = require("node:path");
  const dir = join(import.meta.dir, "../db/migrations"), files = readdirSync(dir).filter((f: string) => f.endsWith(".sql")).sort();
  for (const f of files.slice(0, 13)) d.exec(readFileSync(join(dir, f), "utf8"));
  d.exec("PRAGMA user_version = 13");
  d.query("INSERT INTO goals (title, kind, krs, at) VALUES ('Exports GA', 'team', ?, 'now')").run("3 customers on it\n\n  docs live  \n");
  migrate(d);
  expect(d.query("SELECT pos, text, metric FROM key_results ORDER BY pos").all()).toEqual([{ pos: 1, text: "3 customers on it", metric: null }, { pos: 3, text: "docs live", metric: null }]);
  expect((d.query("SELECT type FROM goals").get() as any).type).toBe("aspirational");
});
