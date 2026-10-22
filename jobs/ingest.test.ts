import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dayOf, isoWeek, migrate } from "../core/db";
import { ingestWeek, referenceOf, referencesIn } from "./ingest";
import { threads } from "../core/threads";

const ME = { name: "Riley Chen", github: "rchen", orgs: ["acme"], level: "Senior Engineer" };

test("isoWeek handles year edges", () => {
  expect(isoWeek("2026-10-12T09:00:00Z")).toBe("2026-W42");
  expect(isoWeek("2026-10-18T23:00:00Z")).toBe("2026-W42");
  expect(isoWeek("2026-01-01")).toBe("2026-W01");
  expect(isoWeek("2027-01-01")).toBe("2026-W53");
});

test("ingest resolves links, is idempotent and flags dropped rows", () => {
  const directory = mkdtempSync(join(tmpdir(), "it-"));
  const wrap = (output: object) =>
    JSON.stringify({
      is_error: false,
      session_id: "s1",
      total_cost_usd: 0.01,
      num_turns: 3,
      structured_output: output,
    });
  writeFileSync(
    join(directory, "linear.run.json"),
    wrap({
      week: "2026-W42",
      pages_read: 1,
      projects: [
        {
          id: "P-ACME-1",
          name: "Exports",
          url: "https://linear.app/p",
          status: "Completed",
          lead: null,
          milestones: [{ id: "m1", name: "Safe delete", progress: 92.31, target_date: null }],
        },
      ],
      issues: [
        {
          id: "ACME-41",
          title: "Add DELETE",
          url: "https://linear.app/i",
          status_type: "completed",
          completed_at: "2026-10-14T07:57:35Z",
          project_name: "Exports",
          milestone_name: "Safe delete",
        },
        {
          id: "ACME-40",
          title: "Keep origin",
          url: "https://linear.app/j",
          status_type: "completed",
          completed_at: "2026-10-14T12:40:28Z",
          project_name: "Exports",
          milestone_name: null,
        },
        {
          id: "ACME-1",
          title: "Older",
          url: "https://linear.app/k",
          status_type: "completed",
          completed_at: "2026-08-19T15:31:35Z",
          project_name: null,
          milestone_name: null,
        },
      ],
      attachments: [{ id: "ACME-41", urls: ["https://github.com/acme/api/pull/101"] }],
    }),
  );
  writeFileSync(
    join(directory, "github.run.json"),
    wrap({
      week: "2026-W42",
      reviews_given: 10,
      review_comments_received: [],
      prs_open: [],
      prs_merged: [
        {
          repo: "acme/api",
          number: 101,
          title: "feat: delete",
          url: "https://github.com/acme/api/pull/101",
          at: "2026-10-14T07:50:00Z",
          linear_refs: ["ACME-41", "WEST-1", "UTF-8"],
        },
      ],
    }),
  );
  writeFileSync(join(directory, "github.expected"), "2\n");
  // Reviews by when you submitted them: two on one PR count once, other weeks and your own PRs do not count.
  const rv = (number: number, submitted_at: string | null, author = "blair") => ({
    repo: "acme/api",
    number,
    author,
    state: "COMMENTED",
    submitted_at,
  });
  writeFileSync(
    join(directory, "reviews.run.json"),
    wrap({
      from: "2026-10-05",
      prs_read: 4,
      reviews: [
        rv(7, "2026-10-13T09:00:00Z"),
        rv(7, "2026-10-14T09:00:00Z"),
        rv(8, "2026-10-16T09:00:00Z"),
        rv(9, "2026-10-08T09:00:00Z"),
        rv(10, null),
        rv(11, "2026-10-13T09:00:00Z", "rchen"),
      ],
    }),
  );
  writeFileSync(join(directory, "reviews.expected"), "4\n");
  // A Wednesday call that returned a Monday row: dropped, and the run is flagged.
  writeFileSync(
    join(directory, "slack_own_5.run.json"),
    wrap({
      week: "2026-W42",
      self_user_id: "U1",
      pages_read: 1,
      exhausted: true,
      messages: [
        {
          pass: "own",
          channel_id: "C9",
          channel_name: "#dev",
          ts: String(Date.UTC(2026, 9, 12, 9) / 1000),
          permalink: "https://s/9",
          author_id: "U1",
          author_name: "Me",
          text: "monday",
        },
      ],
    }),
  );
  // Six pages read but one page of rows: Claude dropped the rest.
  writeFileSync(
    join(directory, "slack_own_4.run.json"),
    wrap({ week: "2026-W42", self_user_id: "U1", pages_read: 6, exhausted: true, messages: [] }),
  );
  // The old one-call-per-week file: no day, so only the week filter applies.
  writeFileSync(
    join(directory, "slack_own.run.json"),
    wrap({
      week: "2026-W42",
      self_user_id: "U1",
      pages_read: 1,
      exhausted: true,
      messages: [
        {
          pass: "own",
          channel_id: "C1",
          channel_name: "#dev",
          ts: "1791833652.842769",
          permalink: "https://s/1",
          author_id: "U1",
          author_name: "Me",
          text: "PTAL <https://github.com/acme/api/pull/101|#101>, closes ACME-41",
        },
        {
          pass: "mention",
          channel_id: "C2",
          channel_name: "#kudos",
          ts: "1791900000.000100",
          permalink: "https://s/2",
          author_id: "U2",
          author_name: "Riley",
          text: "thanks <@U1|Me>",
        },
        {
          pass: "mention",
          channel_id: "C2",
          channel_name: "#kudos",
          ts: "1791900000.000200",
          permalink: "https://s/4",
          author_id: "U3",
          author_name: "Blair",
          text: "this should unblock them",
        },
        {
          pass: "mention",
          channel_id: "C1",
          channel_name: "#dev",
          ts: "1791833652.842769",
          permalink: "https://s/1",
          author_id: "U1",
          author_name: "Me",
          text: "dup",
        },
        {
          pass: "own",
          channel_id: "C3",
          channel_name: "#old",
          ts: "1700000000.000001",
          permalink: "https://s/3",
          author_id: "U1",
          author_name: "Me",
          text: "out of window",
        },
      ],
    }),
  );

  const calendarEvent = (id: string, overrides: object) => ({
    id,
    summary: id,
    start: "2026-10-13T10:00:00+02:00",
    end: "2026-10-13T10:30:00+02:00",
    event_type: "DEFAULT",
    status: "confirmed",
    organizer: "a@x",
    my_response: "accepted",
    attendees: ["a@x", "me@x"],
    recurring: false,
    html_link: "https://c/" + id,
    urls: [],
    ...overrides,
  });
  writeFileSync(
    join(directory, "calendar.run.json"),
    wrap({
      week: "2026-W42",
      pages_read: 1,
      exhausted: true,
      events: [
        calendarEvent("sync", {
          urls: [
            "https://docs.google.com/document/d/D1/edit",
            "https://linear.app/acme/team/X/all",
          ],
        }),
        calendarEvent("declined", { my_response: "declined" }),
        calendarEvent("focus", { event_type: "FOCUS_TIME", attendees: [] }),
        calendarEvent("solo", { attendees: ["me@x"] }),
      ],
    }),
  );

  const file = (id: string, mime: string, created: string) => ({
    id,
    title: id,
    mime_type: `application/vnd.google-apps.${mime}`,
    created_time: created,
    modified_time: "2026-10-15T10:00:00Z",
    url: `https://docs.google.com/${mime}/d/${id}/edit`,
  });
  writeFileSync(
    join(directory, "drive.run.json"),
    wrap({
      week: "2026-W42",
      pages_read: 1,
      exhausted: true,
      files: [
        file("D1", "document", "2026-09-01T10:00:00Z"),
        file("D2", "document", "2026-10-13T10:00:00Z"),
        file("F1", "folder", "2026-10-13T10:00:00Z"),
      ],
    }),
  );

  const db = new Database(":memory:", { strict: true });
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  const first = ingestWeek(db, directory, "2026-W42", ME);
  ingestWeek(db, directory, "2026-W42", ME);

  // ACME-40 is in the window but Claude did not pick it: flagged, and still ingested from the raw rows.
  // The reviews source wins over the old count in the github file (10).
  expect(
    JSON.parse(
      (db.query("SELECT payload FROM events WHERE kind = 'reviews_given'").get() as any).payload,
    ),
  ).toEqual({ count: 2, submissions: 3 });
  expect(first).toEqual({
    linear: "count_mismatch",
    github: "count_mismatch",
    reviews: "ok",
    slack_own: "ok",
    slack_own_4: "count_mismatch",
    slack_own_5: "count_mismatch",
    calendar: "ok",
    drive: "ok",
  });
  expect(
    db.query("SELECT group_concat(id) ids FROM events WHERE kind = 'issue_completed'").get(),
  ).toEqual({ ids: "linear:ACME-41,linear:ACME-40" });
  expect(db.query("SELECT count(*) n FROM events").get()).toEqual({ n: 9 });
  expect(
    db
      .query("SELECT kind, count(*) n FROM events WHERE source = 'slack' GROUP BY 1 ORDER BY 1")
      .all(),
  ).toEqual([
    { kind: "slack_mention", n: 1 },
    { kind: "slack_message", n: 1 },
  ]);
  expect(
    db
      .query("SELECT to_ref FROM links WHERE from_id = 'slack:C1/1791833652.842769' ORDER BY 1")
      .all(),
  ).toEqual([{ to_ref: "github:acme/api#101" }, { to_ref: "linear:ACME-41" }]);
  expect(
    db
      .query(
        "SELECT e.id, l.to_ref FROM events e JOIN links l ON l.from_id = e.id WHERE e.source = 'calendar'",
      )
      .all(),
  ).toEqual([{ id: "calendar:sync", to_ref: "gdoc:D1" }]);
  expect(
    db
      .query(
        "SELECT kind, l.to_ref FROM events e JOIN links l ON l.from_id = e.id WHERE e.source = 'drive' ORDER BY 1",
      )
      .all(),
  ).toEqual([
    { kind: "doc_created", to_ref: "gdoc:D2" },
    { kind: "doc_edited", to_ref: "gdoc:D1" },
  ]);
  // The PR, its issue and the Slack message share refs; ACME-40 joins through the Exports project.
  // The meeting joins D1, its notes doc.
  expect(threads(db, ["2026-W42"])[0].sort()).toEqual([
    "github:acme/api#101",
    "linear:ACME-40",
    "linear:ACME-41",
    "slack:C1/1791833652.842769",
  ]);
  expect(
    threads(db, ["2026-W42"])
      .find((thread) => thread.includes("calendar:sync"))

      ?.sort(),
  ).toEqual(["calendar:sync", "drive:D1:2026-W42"]);
  expect(
    db.query("SELECT project_id, milestone_id, week FROM events WHERE id = 'linear:ACME-41'").get(),
  ).toEqual({ project_id: "P-ACME-1", milestone_id: "m1", week: "2026-W42" });
  expect(db.query("SELECT to_ref FROM links WHERE from_id = 'linear:ACME-41'").all()).toEqual([
    { to_ref: "github:acme/api#101" },
  ]);
  // eu-west-1 and UTF-8 are not issues: only known team keys link.
  expect(db.query("SELECT to_ref FROM links WHERE from_id = 'github:acme/api#101'").all()).toEqual([
    { to_ref: "linear:ACME-41" },
  ]);
});

test("threads merge by main project, and a bridge between projects does not merge them", () => {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  const insertEvent = db.query(
    "INSERT INTO events (id, source, kind, week, project_id, payload, run_id) VALUES (?, 'x', 'k', '2026-W42', ?, '{}', 'r')",
  );
  for (const [id, projectId] of [
    ["linear:A-1", "P1"],
    ["linear:A-2", "P1"],
    ["linear:B-1", "P2"],
    ["linear:B-2", "P2"],
    ["github:x/y#1", null],
    ["github:x/y#2", null],
  ])
    insertEvent.run(id, projectId);
  const link = db.query("INSERT INTO links VALUES (?, ?, 'mentions')");
  link.run("github:x/y#1", "linear:A-1");
  link.run("github:x/y#1", "linear:A-2");
  // PR 2 cites one issue of each project: a bridge.
  link.run("github:x/y#2", "linear:A-2");
  link.run("github:x/y#2", "linear:B-1");
  const weekThreads = threads(db, ["2026-W42"]).map((thread) => thread.sort());
  expect(weekThreads).toEqual([
    ["github:x/y#1", "github:x/y#2", "linear:A-1", "linear:A-2", "linear:B-1"],
    ["linear:B-2"],
  ]);
});

test("a PR keeps its project when the issue it cites moved to a later week", () => {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  const insertEvent = db.query(
    "INSERT INTO events (id, source, kind, week, project_id, payload, run_id) VALUES (?, 'x', 'k', ?, ?, '{}', 'r')",
  );
  insertEvent.run("linear:A-1", "2026-W42", "P1");
  insertEvent.run("linear:A-9", "2026-W43", "P1"); // still open, so next week's run moved it
  insertEvent.run("github:x/y#1", "2026-W42", null);
  insertEvent.run("github:x/y#2", "2026-W42", null);
  const link = db.query("INSERT INTO links VALUES (?, ?, 'mentions')");
  link.run("github:x/y#1", "linear:A-1");
  link.run("github:x/y#2", "linear:A-9");
  expect(threads(db, ["2026-W42"]).map((thread) => thread.sort())).toEqual([
    ["github:x/y#1", "github:x/y#2", "linear:A-1"],
  ]);
});

test("a Slack message citing two unrelated PRs attaches to one and joins neither", () => {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  const insertEvent = db.query(
    "INSERT INTO events (id, source, kind, week, payload, run_id) VALUES (?, ?, 'k', '2026-W42', '{}', 'r')",
  );
  for (const [id, source] of [
    ["github:x/a#1", "github"],
    ["github:x/a#2", "github"],
    ["github:x/b#9", "github"],
    ["slack:C/1", "slack"],
  ])
    insertEvent.run(id, source);
  const link = db.query("INSERT INTO links VALUES (?, ?, 'mentions')");
  link.run("github:x/a#2", "github:x/a#1");
  link.run("slack:C/1", "github:x/a#1");
  link.run("slack:C/1", "github:x/b#9");
  const weekThreads = threads(db, ["2026-W42"]).map((thread) => thread.sort());
  // The message goes with the bigger thread it cites; b#9 stays alone.
  expect(weekThreads).toEqual([["github:x/a#1", "github:x/a#2", "slack:C/1"], ["github:x/b#9"]]);
});

test("references normalize across sources", () => {
  expect(referenceOf("https://github.com/acme/api/pull/101/files")).toBe("github:acme/api#101");
  expect(referenceOf("https://linear.app/acme/issue/ACME-41/some-title")).toBe("linear:ACME-41");
  expect(referenceOf("https://docs.google.com/document/d/abc_D-1/edit")).toBe("gdoc:abc_D-1");
  expect(
    referencesIn(
      "PTAL <https://github.com/acme/api/pull/7|#7> fixes ACME-3, not UTF-8",
      new Set(["ACME"]),
    ).sort(),
  ).toEqual(["github:acme/api#7", "linear:ACME-3"]);
});

test("dayOf: Monday of an ISO week, at midnight UTC", () => {
  expect(new Date(dayOf("2026-W42", 0)).toISOString()).toBe("2026-10-12T00:00:00.000Z");
  expect(new Date(dayOf("2026-W53", 6)).toISOString()).toBe("2027-01-03T00:00:00.000Z");
  expect(new Date(dayOf("2027-W01", 0)).toISOString()).toBe("2027-01-04T00:00:00.000Z");
});

test("reviews given count people's PRs you reviewed in the week, not PRs updated in it", () => {
  const directory = mkdtempSync(join(tmpdir(), "rv-"));
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  const rv = (number: number, submitted_at: string, author = "blair") => ({
    repo: "acme/api",
    number,
    author,
    state: "APPROVED",
    submitted_at,
  });
  writeFileSync(
    join(directory, "reviews.run.json"),
    JSON.stringify({
      session_id: "s",
      structured_output: {
        from: "2026-10-05",
        prs_read: 3,
        reviews: [
          rv(7, "2026-10-13T09:00:00Z"),
          rv(7, "2026-10-14T09:00:00Z"),
          rv(8, "2026-10-16T09:00:00Z"),
          rv(9, "2026-10-08T09:00:00Z"),
          rv(10, "2026-10-15T09:00:00Z", "renovate[bot]"),
        ],
      },
    }),
  );
  writeFileSync(join(directory, "reviews.expected"), "5\n");
  // One PR from the search is missing from the rows: flagged.
  expect(ingestWeek(db, directory, "2026-W42", ME)).toEqual({ reviews: "count_mismatch" });
  expect(
    JSON.parse(
      (db.query("SELECT payload FROM events WHERE kind = 'reviews_given'").get() as any).payload,
    ),
  ).toEqual({ count: 2, submissions: 3 });
  // A run from after the week started cannot cover it.
  expect(() => ingestWeek(db, directory, "2026-W40", ME)).toThrow("after 2026-W40 starts");
});

test("PRs opened are counted per week and checked against the search", () => {
  const directory = mkdtempSync(join(tmpdir(), "po-"));
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  const pr = (number: number) => ({
    repo: "acme/api",
    number,
    url: `https://github.com/acme/api/pull/${number}`,
  });
  const write = (opened: any[], expected: number) => {
    writeFileSync(
      join(directory, "github.run.json"),
      JSON.stringify({
        session_id: "s",
        structured_output: {
          week: "2026-W42",
          prs_merged: [],
          prs_open: [],
          prs_opened: opened,
          review_comments_received: [],
        },
      }),
    );
    writeFileSync(join(directory, "github.expected"), "0\n");
    writeFileSync(join(directory, "github_opened.expected"), `${expected}\n`);
  };
  write([pr(1), pr(2), pr(2)], 2);
  expect(ingestWeek(db, directory, "2026-W42", ME)).toEqual({ github: "ok" });
  expect(
    JSON.parse(
      (db.query("SELECT payload FROM events WHERE kind = 'prs_opened'").get() as any).payload,
    ),
  ).toEqual({ count: 2 });
  // Claude dropped a PR the search found: flagged.
  write([pr(1)], 2);
  expect(ingestWeek(db, directory, "2026-W42", ME)).toEqual({ github: "count_mismatch" });
});

test("review requests count PRs that asked you, and PRs that asked your teams, apart", () => {
  const directory = mkdtempSync(join(tmpdir(), "rq-"));
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  const rq = (at: string, reviewer: string) => ({ at, reviewer, requester: "blair" });
  writeFileSync(
    join(directory, "requests.run.json"),
    JSON.stringify({
      session_id: "s",
      structured_output: {
        from: "2026-10-05",
        prs: [
          {
            repo: "acme/api",
            number: 1,
            author: "blair",
            requests: [rq("2026-10-13T09:00:00Z", "rchen"), rq("2026-10-14T09:00:00Z", "rchen")],
          },
          {
            repo: "acme/api",
            number: 2,
            author: "blair",
            requests: [
              rq("2026-10-13T09:00:00Z", "team:acme/iac"),
              rq("2026-10-13T09:00:00Z", "team:acme/other"),
            ],
          },
          {
            repo: "acme/api",
            number: 3,
            author: "blair",
            requests: [rq("2026-10-06T09:00:00Z", "rchen")],
          },
          {
            repo: "acme/api",
            number: 4,
            author: "renovate[bot]",
            requests: [rq("2026-10-13T09:00:00Z", "team:acme/iac")],
          },
          { repo: "acme/api", number: 5, author: "blair", requests: [] },
        ],
      },
    }),
  );
  writeFileSync(join(directory, "requests.expected"), "5\n");
  writeFileSync(join(directory, "teams.txt"), "team:acme/iac\n");
  expect(ingestWeek(db, directory, "2026-W42", ME)).toEqual({ requests: "ok" });
  // #1 twice in the week counts once; #3 is W41; #2 only through your team; the bot PR is out.
  expect(
    JSON.parse(
      (db.query("SELECT payload FROM events WHERE kind = 'review_requests'").get() as any).payload,
    ),
  ).toEqual({ direct: 1, team: 1 });
});
