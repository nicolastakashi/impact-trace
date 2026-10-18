import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestWeek, isoWeek, migrate, refOf, refsIn, threads } from "./ingest";

test("isoWeek handles year edges", () => {
  expect(isoWeek("2026-10-12T09:00:00Z")).toBe("2026-W42");
  expect(isoWeek("2026-10-18T23:00:00Z")).toBe("2026-W42");
  expect(isoWeek("2026-01-01")).toBe("2026-W01");
  expect(isoWeek("2027-01-01")).toBe("2026-W53");
});

test("ingest resolves links, is idempotent and flags dropped rows", () => {
  const dir = mkdtempSync(join(tmpdir(), "it-"));
  const wrap = (o: object) => JSON.stringify({ is_error: false, session_id: "s1", total_cost_usd: 0.01, num_turns: 3, structured_output: o });
  writeFileSync(join(dir, "linear.run.json"), wrap({
    week: "2026-W42", pages_read: 1,
    projects: [{ id: "P-ACME-1", name: "Exports", url: "https://linear.app/p", status: "Completed", lead: null,
      milestones: [{ id: "m1", name: "Safe delete", progress: 92.31, target_date: null }] }],
    issues: [
      { id: "ACME-41", title: "Add DELETE", url: "https://linear.app/i", status_type: "completed",
        completed_at: "2026-10-14T07:57:35Z", project_name: "Exports", milestone_name: "Safe delete" },
      { id: "ACME-40", title: "Keep origin", url: "https://linear.app/j", status_type: "completed",
        completed_at: "2026-10-14T12:40:28Z", project_name: "Exports", milestone_name: null },
      { id: "ACME-1", title: "Older", url: "https://linear.app/k", status_type: "completed",
        completed_at: "2026-08-19T15:31:35Z", project_name: null, milestone_name: null },
    ],
    attachments: [{ id: "ACME-41", urls: ["https://github.com/acme/api/pull/101"] }],
  }));
  writeFileSync(join(dir, "github.run.json"), wrap({
    week: "2026-W42", reviews_given: 10, review_comments_received: [], prs_open: [],
    prs_merged: [{ repo: "acme/api", number: 101, title: "feat: delete", url: "https://github.com/acme/api/pull/101",
      at: "2026-10-14T07:50:00Z", linear_refs: ["ACME-41"] }],
  }));
  writeFileSync(join(dir, "github.expected"), "2\n");
  writeFileSync(join(dir, "slack_own_3.run.json"), wrap({
    week: "2026-W42", self_user_id: "U1", pages_read: 2, exhausted: true,
    messages: [
      { pass: "own", channel_id: "C1", channel_name: "#dev", ts: "1791833652.842769", permalink: "https://s/1", author_id: "U1", author_name: "Me",
        text: "PTAL <https://github.com/acme/api/pull/101|#101>, closes ACME-41" },
      { pass: "mention", channel_id: "C2", channel_name: "#kudos", ts: "1791900000.000100", permalink: "https://s/2", author_id: "U2", author_name: "Riley",
        text: "thanks <@U1|Me>" },
      { pass: "mention", channel_id: "C2", channel_name: "#kudos", ts: "1791900000.000200", permalink: "https://s/4", author_id: "U3", author_name: "Blair",
        text: "this should unblock them" },
      { pass: "mention", channel_id: "C1", channel_name: "#dev", ts: "1791833652.842769", permalink: "https://s/1", author_id: "U1", author_name: "Me", text: "dup" },
      { pass: "own", channel_id: "C3", channel_name: "#old", ts: "1700000000.000001", permalink: "https://s/3", author_id: "U1", author_name: "Me", text: "out of window" },
    ],
  }));

  const ev = (id: string, o: object) => ({ id, summary: id, start: "2026-10-13T10:00:00+02:00", end: "2026-10-13T10:30:00+02:00",
    event_type: "DEFAULT", status: "confirmed", organizer: "a@x", my_response: "accepted", attendees: ["a@x", "me@x"],
    recurring: false, html_link: "https://c/" + id, urls: [], ...o });
  writeFileSync(join(dir, "calendar.run.json"), wrap({
    week: "2026-W42", pages_read: 1, exhausted: true,
    events: [
      ev("sync", { urls: ["https://docs.google.com/document/d/D1/edit", "https://linear.app/acme/team/X/all"] }),
      ev("declined", { my_response: "declined" }),
      ev("focus", { event_type: "FOCUS_TIME", attendees: [] }),
      ev("solo", { attendees: ["me@x"] }),
    ],
  }));

  const file = (id: string, mime: string, created: string) => ({ id, title: id, mime_type: `application/vnd.google-apps.${mime}`,
    created_time: created, modified_time: "2026-10-15T10:00:00Z", url: `https://docs.google.com/${mime}/d/${id}/edit` });
  writeFileSync(join(dir, "drive.run.json"), wrap({
    week: "2026-W42", pages_read: 1, exhausted: true,
    files: [file("D1", "document", "2026-09-01T10:00:00Z"), file("D2", "document", "2026-10-13T10:00:00Z"), file("F1", "folder", "2026-10-13T10:00:00Z")],
  }));

  const db = new Database(":memory:", { strict: true });
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  const first = ingestWeek(db, dir, "2026-W42");
  ingestWeek(db, dir, "2026-W42");

  // ACME-40 is in the window but Claude did not pick it: flagged, and still ingested from the raw rows.
  expect(first).toEqual({ linear: "count_mismatch", github: "count_mismatch", slack_own_3: "ok", calendar: "ok", drive: "ok" });
  expect(db.query("SELECT group_concat(id) ids FROM events WHERE kind = 'issue_completed'").get()).toEqual({ ids: "linear:ACME-41,linear:ACME-40" });
  expect(db.query("SELECT count(*) n FROM events").get()).toEqual({ n: 9 });
  expect(db.query("SELECT kind, count(*) n FROM events WHERE source = 'slack' GROUP BY 1 ORDER BY 1").all())
    .toEqual([{ kind: "slack_mention", n: 1 }, { kind: "slack_message", n: 1 }]);
  expect(db.query("SELECT to_ref FROM links WHERE from_id = 'slack:C1/1791833652.842769' ORDER BY 1").all())
    .toEqual([{ to_ref: "github:acme/api#101" }, { to_ref: "linear:ACME-41" }]);
  expect(db.query("SELECT e.id, l.to_ref FROM events e JOIN links l ON l.from_id = e.id WHERE e.source = 'calendar'").all())
    .toEqual([{ id: "calendar:sync", to_ref: "gdoc:D1" }]);
  expect(db.query("SELECT kind, l.to_ref FROM events e JOIN links l ON l.from_id = e.id WHERE e.source = 'drive' ORDER BY 1").all())
    .toEqual([{ kind: "doc_created", to_ref: "gdoc:D2" }, { kind: "doc_edited", to_ref: "gdoc:D1" }]);
  // The PR, its issue and the Slack message share refs; the meeting joins D1, its notes doc.
  expect(threads(db, ["2026-W42"])[0].sort())
    .toEqual(["github:acme/api#101", "linear:ACME-41", "slack:C1/1791833652.842769"]);
  expect(threads(db, ["2026-W42"]).find((t) => t.includes("calendar:sync"))?.sort()).toEqual(["calendar:sync", "drive:D1:2026-W42"]);
  expect(db.query("SELECT project_id, milestone_id, week FROM events WHERE id = 'linear:ACME-41'").get())
    .toEqual({ project_id: "P-ACME-1", milestone_id: "m1", week: "2026-W42" });
  expect(db.query("SELECT to_ref FROM links WHERE from_id = 'linear:ACME-41'").all()).toEqual([{ to_ref: "github:acme/api#101" }]);
});

test("references normalize across sources", () => {
  expect(refOf("https://github.com/acme/api/pull/101/files")).toBe("github:acme/api#101");
  expect(refOf("https://linear.app/acme/issue/ACME-41/some-title")).toBe("linear:ACME-41");
  expect(refOf("https://docs.google.com/document/d/abc_D-1/edit")).toBe("gdoc:abc_D-1");
  expect(refsIn("PTAL <https://github.com/acme/api/pull/7|#7> fixes ACME-3, not UTF-8", new Set(["ACME"])).sort())
    .toEqual(["github:acme/api#7", "linear:ACME-3"]);
});
