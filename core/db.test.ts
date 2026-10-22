import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { migrate } from "./db";

// 017 renames columns and metric ids in your real database: every row must survive.
test("017 keeps every row and moves the metric ids to glossary words", () => {
  const db = new Database(":memory:");
  const directory = join(import.meta.dir, "../db/migrations");
  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files.slice(0, 16)) db.exec(readFileSync(join(directory, file), "utf8"));
  db.exec("PRAGMA user_version = 16");

  db.exec(`INSERT INTO goals (id, title, kind, krs, at) VALUES (1, 'Exports GA', 'team', NULL, 'now');
    INSERT INTO key_results (goal_id, pos, text, metric, at) VALUES
      (1, 0, 'More praise', 'recognition', 'now'), (1, 1, 'Faster merges', 'lead_time_h', 'now'), (1, 2, 'Docs live', NULL, 'now');
    INSERT INTO goal_drafts (title, kind, type, why, based_on, krs, at) VALUES
      ('Draft', 'team', 'aspirational', 'why', '[]', '[{"text":"a","metric":"recognition"},{"text":"b","metric":"lead_time_h"}]', 'now');
    INSERT INTO feedback (week, output, at) VALUES ('2026-W42', '{}', 'now');
    INSERT INTO feedback_verdicts VALUES ('2026-W42', 'experiment', 'accept', NULL, 'now');
    INSERT INTO events (id, source, kind, week, payload) VALUES ('slack:1', 'slack', 'slack_message', '2026-W42', '{}');
    INSERT INTO links VALUES ('slack:1', 'github:acme/api#1', 'mentions');`);
  migrate(db);

  expect(db.query("SELECT position, metric FROM key_results ORDER BY position").all()).toEqual([
    { position: 0, metric: "praise" },
    { position: 1, metric: "lead_time_hours" },
    { position: 2, metric: null },
  ]);
  const draft = db.query("SELECT key_results FROM goal_drafts").get() as any;
  expect(JSON.parse(draft.key_results).map((keyResult: any) => keyResult.metric)).toEqual([
    "praise",
    "lead_time_hours",
  ]);
  expect(db.query("SELECT piece, verdict FROM feedback_verdicts").all()).toEqual([
    { piece: "experiment", verdict: "accept" },
  ]);
  expect(db.query("SELECT relation FROM links").all()).toEqual([{ relation: "mentions" }]);
  const goalColumns = (db.query("PRAGMA table_info(goals)").all() as any[]).map(
    (column) => column.name,
  );
  expect(goalColumns).not.toContain("krs");
  expect(db.query("SELECT count(*) total FROM goals").get()).toEqual({ total: 1 });
});
