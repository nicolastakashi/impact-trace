import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { migrate } from "../core/db";
import { saveDrafts } from "./drafts";

const NOW = new Date("2026-10-21T12:00:00Z");
const freshDb = () => {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  db.query(
    "INSERT INTO runs VALUES ('r', '2026-W42', 'github', 0, 0, null, null, 'ok', 'x')",
  ).run();
  for (const [week, count] of [
    ["2026-W41", 6],
    ["2026-W42", 4],
  ] as const)
    db.query(
      `INSERT INTO events (id, source, kind, week, occurred_at, title, url, author, project_id, milestone_id, payload, run_id)
    VALUES (?, 'github', 'review_requests', ?, null, null, null, null, null, null, ?, 'r')`,
    ).run(`rr${week}`, week, JSON.stringify({ direct: count, team: 0 }));
  return db;
};
const input = {
  facts: { threads: [{ title: "Review guide for the platform team", runbooks: 0 }] },
};
const draftGoal = (overrides: any) => ({
  title: "Teams review each other",
  kind: "team",
  type: "aspirational",
  why: "Most review requests name you.",
  based_on: ["Review guide for the platform team"],
  key_results: [
    {
      text: "Requests that name me drop to 2 a week",
      metric: "asked_direct",
      start: 99,
      target: 2,
    },
  ],
  ...overrides,
});
const run = (objectives: any[]) => ({
  is_error: false,
  total_cost_usd: 0.1,
  structured_output: { objectives },
});

test("code sets a measured start, keeps a typed one, and drops what is not in your data", () => {
  const db = freshDb();
  const result = saveDrafts(
    db,
    run([
      draftGoal({
        key_results: [
          draftGoal({}).key_results[0],
          { text: "Two runbooks by others", metric: null, start: 0, target: 2 },
          { text: "Averaged by Claude", metric: null, start: 2.75, target: 1 },
          { text: "Praise this quarter", metric: "recognition", start: 3, target: 4 },
          { text: "Bad", metric: "nope", start: 0, target: 1 },
        ],
      }),
      draftGoal({
        title: "Pings",
        key_results: [
          draftGoal({}).key_results[0],
          { text: "Fewer pings (avg 2.75)", metric: null, start: null, target: 1 },
        ],
      }),
      draftGoal({ title: "Invented", based_on: ["a thread that does not exist"] }),
      draftGoal({ title: "Made up", why: "You review 37 PRs a week." }),
    ]),
    input,
    "v1",
    NOW,
  );
  expect(result.saved).toBe(2);
  expect(result.dropped).toEqual([
    "Teams review each other / Bad: bad key result",
    "Pings / Fewer pings (avg 2.75): numbers not in your data: 2.75",
    "Invented: nothing it is based on is in your data",
    "Made up: numbers not in your data: 37",
  ]);
  const keyResults = JSON.parse((db.query("SELECT krs FROM goal_drafts").get() as any).krs);
  // W41 and W42 are the closed weeks: (6 + 4) / 2, not Claude's 99.
  expect(
    keyResults.map((keyResult: any) => [keyResult.metric, keyResult.start, keyResult.target]),
  ).toEqual([
    ["asked_direct", 5, 2],
    [null, 0, 2],
    [null, null, 1],
    ["recognition", 0, 4],
  ]);
  expect((db.query("SELECT quarter FROM goal_drafts").get() as any).quarter).toBe("2026-Q4");
});

test("a new run replaces unused drafts, and a failed run keeps them", () => {
  const db = freshDb();
  saveDrafts(db, run([draftGoal({}), draftGoal({ title: "Second" })]), input, "v1", NOW);
  saveDrafts(db, run([draftGoal({ title: "Only" })]), input, "v1", NOW);
  expect(db.query("SELECT title FROM goal_drafts").all()).toEqual([{ title: "Only" }]);
  expect(() => saveDrafts(db, { is_error: true, result: "boom" }, input, "v1", NOW)).toThrow(
    "boom",
  );
  expect(db.query("SELECT count(*) n FROM goal_drafts").get()).toEqual({ n: 1 });
});
