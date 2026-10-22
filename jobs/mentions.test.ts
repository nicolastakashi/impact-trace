import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { migrate } from "../core/db";
import { correct, mentions, saveMentions } from "./mentions";

test("praise is kept only with its words in the message", () => {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  const insertMention =
    db.query(`INSERT INTO events (id, source, kind, week, occurred_at, title, url, author, project_id, milestone_id, payload, run_id)
    VALUES (?, 'slack', 'slack_mention', '2026-W42', '2026-10-14T09:00:00Z', '#eng', null, ?, null, null, ?, 'r')`);
  insertMention.run(
    "slack:1",
    "Ana",
    JSON.stringify({ text: "Huge thanks <@U1|Riley Chen> for\nthe exports fix!" }),
  );
  insertMention.run("slack:2", "Bo", JSON.stringify({ text: "<@U1|Riley Chen> can you review?" }));
  insertMention.run("slack:3", "Cy", JSON.stringify({ text: "nice work @Riley" }));
  expect(mentions(db, "2026-W42").mentions[0].text).toBe(
    "Huge thanks @Riley Chen for the exports fix!",
  );
  const run = {
    structured_output: {
      week: "2026-W42",
      mentions: [
        {
          id: "slack:1",
          kind: "praise",
          about: "exports fix",
          quote: "huge thanks @Riley Chen for the exports fix",
        },
        { id: "slack:2", kind: "ask", about: "review", quote: null },
        { id: "slack:3", kind: "praise", about: "work", quote: "great work" },
        { id: "slack:9", kind: "ask", about: "x", quote: null },
      ],
    },
  };
  expect(saveMentions(db, "2026-W42", run, "v1")).toEqual({
    mentions: 3,
    saved: 3,
    unknown: 1,
    unquoted: 1,
    missing: 0,
  });
  expect(db.query("SELECT event_id, kind, quote FROM mention_kinds ORDER BY 1").all()).toEqual([
    { event_id: "slack:1", kind: "praise", quote: "huge thanks @Riley Chen for the exports fix" },
    { event_id: "slack:2", kind: "ask", quote: null },
    // A quote Claude made up: kept as information, never shown as praise.
    { event_id: "slack:3", kind: "info", quote: null },
  ]);
  // Your correction stays when Claude runs again, and goes to Claude as an example.
  expect(correct(db, "slack:1", "info")).toBe(true);
  expect(correct(db, "slack:1", "bogus")).toBe(false);
  expect(correct(db, "slack:404", "info")).toBe(false);
  saveMentions(db, "2026-W42", run, "v2");
  expect(
    db.query("SELECT kind, human_kind FROM mention_kinds WHERE event_id = 'slack:1'").get(),
  ).toEqual({ kind: "praise", human_kind: "info" });
  expect(mentions(db, "2026-W42").corrections).toEqual([
    { text: "Huge thanks @Riley Chen for the exports fix!", claude: "praise", you: "info" },
  ]);
});
