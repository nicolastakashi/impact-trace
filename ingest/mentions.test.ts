import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { migrate } from "./ingest";
import { mentions, saveMentions } from "./mentions";

test("praise is kept only with its words in the message", () => {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  const ev = db.query(`INSERT INTO events (id, source, kind, week, occurred_at, title, url, author, project_id, milestone_id, payload, run_id)
    VALUES (?, 'slack', 'slack_mention', '2026-W42', '2026-10-14T09:00:00Z', '#eng', null, ?, null, null, ?, 'r')`);
  ev.run("slack:1", "Ana", JSON.stringify({ text: "Huge thanks <@U1|Riley Chen> for\nthe exports fix!" }));
  ev.run("slack:2", "Bo", JSON.stringify({ text: "<@U1|Riley Chen> can you review?" }));
  ev.run("slack:3", "Cy", JSON.stringify({ text: "nice work @Riley" }));
  expect(mentions(db, "2026-W42").mentions[0].text).toBe("Huge thanks @Riley Chen for the exports fix!");
  const run = { structured_output: { week: "2026-W42", mentions: [
    { id: "slack:1", kind: "praise", about: "exports fix", quote: "huge thanks @Riley Chen for the exports fix" },
    { id: "slack:2", kind: "ask", about: "review", quote: null },
    { id: "slack:3", kind: "praise", about: "work", quote: "great work" },
    { id: "slack:9", kind: "ask", about: "x", quote: null }] } };
  expect(saveMentions(db, "2026-W42", run, "v1")).toEqual({ mentions: 3, saved: 3, unknown: 1, unquoted: 1, missing: 0 });
  expect(db.query("SELECT event_id, kind, quote FROM mention_kinds ORDER BY 1").all()).toEqual([
    { event_id: "slack:1", kind: "praise", quote: "huge thanks @Riley Chen for the exports fix" },
    { event_id: "slack:2", kind: "ask", quote: null },
    // A quote Claude made up: kept as information, never shown as praise.
    { event_id: "slack:3", kind: "info", quote: null }]);
});
