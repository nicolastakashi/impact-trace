import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { migrate, threads } from "./ingest";
import { saveAssignments, unplaced } from "./assign";
import { reviewThreads, saveSuggestions } from "./review";

test("review keeps threads that say something and saves only known keys", () => {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  const ev = db.query("INSERT INTO events (id, source, kind, week, title, payload, run_id) VALUES (?, 'x', ?, '2026-W42', ?, ?, 'r')");
  ev.run("github:acme/api#1", "pr_merged", "feat: a", "{}");
  ev.run("slack:C/1", "slack_message", "#dev", JSON.stringify({ text: "PTAL" }));
  ev.run("slack:C/2", "slack_message", "#dev", JSON.stringify({ text: "lunch?" }));
  db.query("INSERT INTO links VALUES ('slack:C/1', 'github:acme/api#1', 'mentions')").run();

  const t = reviewThreads(db, "2026-W42");
  // The lone "lunch?" message is left out.
  expect(t.map((x) => x.key)).toEqual(["2026-W42:github:acme/api#1"]);
  expect(t[0].events.find((e) => e.id === "slack:C/1")?.text).toBe("PTAL");

  const label = { title: "A", summary: "Shipped A.", mode: "build", pillar: "exec", routine: true, evidence: [] };
  const run = { is_error: false, modelUsage: { "claude-x": {} }, structured_output: { week: "2026-W42",
    labels: [{ key: t[0].key, ...label }, { key: "2026-W42:made-up", ...label }] } };
  expect(saveSuggestions(db, "2026-W42", run, "v1")).toEqual({ saved: 1, unknown: 1, missing: 0 });
  expect(db.query("SELECT field, model, prompt_version FROM labels ORDER BY 1").all()).toEqual(
    ["evidence", "mode", "pillar", "summary", "title", "without_me"].map((field) => ({ field, model: "claude-x", prompt_version: "v1" })));
});

test("an assignment places a thread in a project, and yours overrides Claude's", () => {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  db.query("INSERT INTO projects (id, name, updated_at) VALUES ('P1', 'Private Locations', 'now')").run();
  const ev = db.query("INSERT INTO events (id, source, kind, week, title, project_id, payload, run_id) VALUES (?, 'x', ?, '2026-W42', ?, ?, '{}', 'r')");
  ev.run("linear:A-1", "issue_completed", "Private location entity", "P1");
  ev.run("github:x/docs#1", "pr_merged", "docs: private locations", null);
  const run = { is_error: false, modelUsage: { "claude-x": {} }, structured_output: { week: "2026-W42",
    assignments: [{ key: "2026-W42:github:x/docs#1", project_id: "P1", why: "\"private locations\"" }] } };

  expect(unplaced(db, "2026-W42").threads.map((t) => t.key)).toEqual(["2026-W42:github:x/docs#1"]);
  expect(saveAssignments(db, "2026-W42", run, "v1")).toEqual({ threads: 1, placed: 1, skipped: 0 });
  const [t] = reviewThreads(db, "2026-W42");
  expect(t.events.map((e) => e.id).sort()).toEqual(["github:x/docs#1", "linear:A-1"]);
  expect(t.projects).toEqual([{ id: "P1", name: "Private Locations", by: "linear" }]);

  // You undo it: the docs PR is alone again.
  db.query("INSERT INTO assignments (event_id, project_id, source, at) VALUES ('github:x/docs#1', NULL, 'human', 'now')").run();
  expect(threads(db, ["2026-W42"]).length).toBe(2);
});
