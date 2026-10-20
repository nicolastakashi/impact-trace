import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { migrate, threads } from "./ingest";
import { saveAssignments, unplaced } from "./assign";
import { labelsOf, reviewThreads, saveSuggestions } from "./review";

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
    ["discard", "evidence", "mode", "pillar", "summary", "title"].map((field) => ({ field, model: "claude-x", prompt_version: "v1" })));
});

test("an assignment places a thread in a project, and yours overrides Claude's", () => {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  db.query("INSERT INTO projects (id, name, updated_at) VALUES ('P1', 'Billing', 'now')").run();
  const ev = db.query("INSERT INTO events (id, source, kind, week, title, project_id, payload, run_id) VALUES (?, 'x', ?, '2026-W42', ?, ?, '{}', 'r')");
  ev.run("linear:A-1", "issue_completed", "Billing invoice entity", "P1");
  ev.run("github:x/docs#1", "pr_merged", "docs: billing", null);
  const run = { is_error: false, modelUsage: { "claude-x": {} }, structured_output: { week: "2026-W42",
    assignments: [{ key: "2026-W42:github:x/docs#1", project_id: "P1", why: "\"billing\"" }] } };

  expect(unplaced(db, "2026-W42").threads.map((t) => t.key)).toEqual(["2026-W42:github:x/docs#1"]);
  expect(saveAssignments(db, "2026-W42", run, "v1")).toEqual({ threads: 1, placed: 1, skipped: 0 });
  const [t] = reviewThreads(db, "2026-W42");
  expect(t.events.map((e) => e.id).sort()).toEqual(["github:x/docs#1", "linear:A-1"]);
  expect(t.projects).toEqual([{ id: "P1", name: "Billing", by: "linear" }]);

  // You undo it: the docs PR is alone again.
  db.query("INSERT INTO assignments (event_id, project_id, source, at) VALUES ('github:x/docs#1', NULL, 'human', 'now')").run();
  expect(threads(db, ["2026-W42"]).length).toBe(2);
});

test("group precedence: yours, then Linear, then a dedicated channel, then Claude", () => {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  for (const [id, name, kind] of [["P1", "Exports", "linear"], ["topic:internal-acme", "Acme", "topic"], ["topic:mine", "Mine", "topic"]])
    db.query("INSERT INTO projects (id, name, kind, updated_at) VALUES (?, ?, ?, 'now')").run(id, name, kind);
  const ev = db.query("INSERT INTO events (id, source, kind, week, title, project_id, payload, run_id) VALUES (?, ?, ?, '2026-W42', ?, ?, '{}', 'r')");
  ev.run("linear:A-1", "linear", "issue_completed", "Delete", "P1");
  ev.run("slack:C/1", "slack", "slack_mention", "#internal-acme", null);
  ev.run("github:x/y#1", "github", "pr_merged", "fix", null);
  const as = db.query("INSERT INTO assignments (event_id, project_id, source, at) VALUES (?, ?, ?, 'now')");
  as.run("slack:C/1", "P1", "claude");
  as.run("github:x/y#1", "P1", "claude");
  const groupOf = (id: string) => reviewThreads(db, "2026-W42").find((t) => t.events.some((e) => e.id === id))?.projects[0];

  expect(groupOf("slack:C/1")).toEqual({ id: "topic:internal-acme", name: "Acme", by: "channel" });
  expect(groupOf("github:x/y#1")).toEqual({ id: "P1", name: "Exports", by: "linear" });
  as.run("linear:A-1", "topic:mine", "human");
  as.run("github:x/y#1", "topic:mine", "human");
  expect(groupOf("github:x/y#1")).toEqual({ id: "topic:mine", name: "Mine", by: "human" });
});

test("a merged project counts as the one it was merged into", () => {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  for (const [id, name, kind] of [["P1", "Billing", "linear"], ["topic:pl", "Billing worker", "topic"]])
    db.query("INSERT INTO projects (id, name, kind, updated_at) VALUES (?, ?, ?, 'now')").run(id, name, kind);
  const ev = db.query("INSERT INTO events (id, source, kind, week, title, project_id, payload, run_id) VALUES (?, 'x', ?, '2026-W42', ?, ?, '{}', 'r')");
  ev.run("linear:A-1", "issue_completed", "Billing invoice entity", "P1");
  ev.run("github:x/api#1", "pr_merged", "feat: billing invoice entity", null);
  ev.run("github:x/worker#1", "pr_merged", "feat: worker", null);
  db.query("INSERT INTO links VALUES ('github:x/api#1', 'linear:A-1', 'mentions')").run();
  db.query("INSERT INTO assignments (event_id, project_id, source, at) VALUES ('github:x/worker#1', 'topic:pl', 'human', 'now')").run();
  expect(reviewThreads(db, "2026-W42").length).toBe(2);

  db.query("INSERT INTO project_merges VALUES ('topic:pl', 'P1', 'now')").run();
  const [t, ...rest] = reviewThreads(db, "2026-W42");
  expect(rest).toEqual([]);
  expect(t.projects.map((p) => p.id)).toEqual(["P1"]);
});

test("labels follow a thread when its first event changes", () => {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  db.query("INSERT INTO labels (thread_key, week, field, value, source, events, at) VALUES ('2026-W42:github:x/y#1', '2026-W42', 'title', 'Old', 'claude', '[]', 'now')").run();
  db.query("INSERT INTO labels (thread_key, week, field, value, source, events, at) VALUES ('2026-W42:github:x/y#1', '2026-W42', 'without_me', 'slower', 'human', '[]', 'now')").run();
  db.query("INSERT INTO labels (thread_key, week, field, value, source, events, at) VALUES ('2026-W42:calendar:e', '2026-W42', 'title', 'New', 'claude', '[]', 'now')").run();
  // A meeting joined, so the key is now the meeting's.
  const l = labelsOf(db, { key: "2026-W42:calendar:e", events: [{ id: "calendar:e" }, { id: "github:x/y#1" }] });
  expect(l.map((r) => [r.field, r.source, r.value])).toEqual([["title", "claude", "New"], ["without_me", "human", "slower"]]);
});

test("a deleted project leaves its threads with no project, even from Linear", () => {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  db.query("INSERT INTO projects (id, name, updated_at) VALUES ('P1', 'Old', 'now')").run();
  const ev = db.query("INSERT INTO events (id, source, kind, week, title, project_id, payload, run_id) VALUES (?, 'x', ?, '2026-W42', ?, ?, '{}', 'r')");
  ev.run("linear:A-1", "issue_completed", "a", "P1");
  ev.run("github:x/y#1", "pr_merged", "b", null);
  db.query("INSERT INTO links VALUES ('github:x/y#1', 'linear:A-1', 'mentions')").run();
  db.query("INSERT INTO project_deletions VALUES ('P1', 'now')").run();
  expect(reviewThreads(db, "2026-W42")[0].projects).toEqual([]);
});
