import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { migrate } from "./ingest";
import { verify } from "./feedback";

test("feedback keeps only quotes found in your messages and counts markers itself", () => {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  const ev = db.query("INSERT INTO events (id, source, kind, week, occurred_at, title, payload, run_id) VALUES (?, 'slack', 'slack_message', ?, ?, '#dev', ?, 'r')");
  ev.run("slack:C/1", "2026-W41", "2026-10-06T10:00:00Z", JSON.stringify({ text: "I'm shipping it Friday, any objection?" }));
  ev.run("slack:C/2", "2026-W42", "2026-10-13T10:00:00Z", JSON.stringify({ text: "Moving the gate today,  any objection?" }));
  ev.run("slack:C/3", "2026-W42", "2026-10-14T10:00:00Z", JSON.stringify({ text: "wdyt? Also, this is unobjectionable" }));
  const v = verify(db, "2026-W42", {
    patterns: [
      { name: "Sign-off", why: "", markers: ["Any objection", "wdyt"], evidence: [{ quote: "Moving the gate today, any objection?", instead: "" }, { quote: "shipping it Friday", instead: "" }] },
      // A made-up quote is dropped, and a pattern left with one quote goes with it.
      { name: "Made up", why: "", markers: ["sorry"], evidence: [{ quote: "sorry to bother you all", instead: "" }, { quote: "wdyt? Also", instead: "" }] },
    ],
    strength: { name: "S", why: "", evidence: [{ quote: "never said this at all" }] },
    experiment: { pattern: "Sign-off", do: "Say what you will do." },
  });
  expect(v.patterns.map((p: any) => p.name)).toEqual(["Sign-off"]);
  // Whitespace differences still match; "unobjectionable" does not count as "objection".
  expect(v.patterns[0].evidence.map((e: any) => e.week)).toEqual(["2026-W42", "2026-W41"]);
  expect(v.patterns[0].trend).toEqual([1, 2]);
  expect(v.experiment?.trend).toEqual([1, 2]);
  expect(v.strength).toBeNull();
  expect(v.dropped).toBe(2);
});
