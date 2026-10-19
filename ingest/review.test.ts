import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { migrate } from "./ingest";
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

  const label = { title: "A", summary: "Shipped A.", mode: "build", pillar: "exec", evidence: [] };
  const run = { is_error: false, modelUsage: { "claude-x": {} }, structured_output: { week: "2026-W42",
    labels: [{ key: t[0].key, ...label }, { key: "2026-W42:made-up", ...label }] } };
  expect(saveSuggestions(db, "2026-W42", run, "v1")).toEqual({ saved: 1, unknown: 1, missing: 0 });
  expect(db.query("SELECT field, model, prompt_version FROM labels ORDER BY 1").all()).toEqual(
    ["evidence", "mode", "pillar", "summary", "title"].map((field) => ({ field, model: "claude-x", prompt_version: "v1" })));
});
