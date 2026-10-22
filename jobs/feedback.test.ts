import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { migrate } from "../core/db";
import { CATEGORIES, isoWeek, pendingMondays, verify } from "./feedback";

test("feedback keeps only quotes found in your messages and counts markers itself", () => {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  const ev = db.query("INSERT INTO events (id, source, kind, week, occurred_at, title, payload, run_id) VALUES (?, 'slack', 'slack_message', ?, ?, '#dev', ?, 'r')");
  ev.run("slack:C/1", "2026-W41", "2026-10-06T10:00:00Z", JSON.stringify({ text: "I'm shipping it Friday, any objection?" }));
  ev.run("slack:C/2", "2026-W42", "2026-10-13T10:00:00Z", JSON.stringify({ text: "Moving the gate today,  any objection?" }));
  ev.run("slack:C/3", "2026-W42", "2026-10-14T10:00:00Z", JSON.stringify({ text: "wdyt? Also, this is unobjectionable" }));
  const v = verify(db, "2026-W42", {
    patterns: [
      { category: "permission", why: "", markers: ["Any objection", "wdyt"], evidence: [{ quote: "Moving the gate today, any objection?", instead: "" }, { quote: "shipping it Friday", instead: "" }] },
      // A made-up quote is dropped, and a pattern left with one quote goes with it.
      // A category outside the catalog is dropped, even with real quotes.
      { category: "smaller-asks", why: "", markers: ["any objection"], evidence: [{ quote: "Moving the gate today, any objection?", instead: "" }, { quote: "shipping it Friday", instead: "" }] },
      { category: "fact-hedge", why: "", markers: ["sorry"], evidence: [{ quote: "sorry to bother you all", instead: "" }, { quote: "wdyt? Also", instead: "" }] },
    ],
    strength: { category: "intent", why: "", evidence: [{ quote: "never said this at all" }] },
    experiment: { pattern: "permission", do: "Say what you will do." },
  });
  expect(v.patterns.map((p: any) => p.name)).toEqual(["Asking permission on what you own"]);
  expect(v.experiment?.pattern).toBe("Asking permission on what you own");
  // Whitespace differences still match; "unobjectionable" does not count as "objection".
  expect(v.patterns[0].evidence.map((e: any) => e.week)).toEqual(["2026-W42", "2026-W41"]);
  expect(v.patterns[0].trend).toEqual([1, 2]);
  // The one counted message without a quote is listed, so 3 counted = 2 quotes + 1 match.
  expect(v.patterns[0].matches.map((m: any) => m.text)).toEqual(["wdyt? Also, this is unobjectionable"]);
  expect(v.experiment?.trend).toEqual([1, 2]);
  expect(v.strength).toBeNull();
  expect(v.dropped).toBe(4);
});

test("pending lists every ended week without feedback, so a missed Monday is closed later", () => {
  const tue = new Date(2026, 9, 27); // Tuesday of W44
  expect(isoWeek(new Date(2026, 9, 19))).toBe("2026-W43");
  expect(isoWeek(new Date(2027, 0, 1))).toBe("2026-W53");
  // Monday slept through: Tuesday closes W43.
  expect(pendingMondays(tue, ["2026-W42"])).toEqual(["2026-10-19"]);
  expect(pendingMondays(tue, ["2026-W42", "2026-W43"])).toEqual([]);
  // Two weeks off: both close, oldest first.
  expect(pendingMondays(new Date(2026, 10, 9), ["2026-W43"])).toEqual(["2026-10-26", "2026-11-02"]);
  // W44 failed, W45 went fine: W44 is still pending.
  expect(pendingMondays(new Date(2026, 10, 10), ["2026-W43", "2026-W45"])).toEqual(["2026-10-26"]);
  // No feedback yet: only last week.
  expect(pendingMondays(tue, [])).toEqual(["2026-10-19"]);
  // Across New Year, and never more than 8 weeks back.
  expect(pendingMondays(new Date(2027, 0, 5), ["2026-W52"])).toEqual(["2026-12-28"]);
  expect(pendingMondays(new Date(2027, 0, 5), ["2025-W01"])).toHaveLength(8);
});

test("every category has a source to show", () => {
  expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(CATEGORIES.length);
  for (const c of CATEGORIES) {
    expect(["pattern", "strength"]).toContain(c.kind);
    expect(c.refs.length).toBeGreaterThan(0);
    for (const r of c.refs) { expect(r.url).toMatch(/^https:\/\//); expect(r.q ?? r.says).toBeTruthy(); expect(r.who).toBeTruthy(); }
  }
});
