import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestWeek, isoWeek, migrate } from "./ingest";

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
    issues: [{ id: "ACME-41", title: "Add DELETE", url: "https://linear.app/i", status_type: "completed",
      completed_at: "2026-10-14T07:57:35Z", project_name: "Exports", milestone_name: "Safe delete",
      attachment_urls: ["https://github.com/acme/api/pull/101"] }],
  }));
  writeFileSync(join(dir, "github.run.json"), wrap({
    week: "2026-W42", reviews_given: 10, review_comments_received: [], prs_open: [],
    prs_merged: [{ repo: "acme/api", number: 101, title: "feat: delete", url: "https://github.com/acme/api/pull/101",
      at: "2026-10-14T07:50:00Z", linear_refs: ["ACME-41"] }],
  }));
  writeFileSync(join(dir, "github.expected"), "2\n");

  const db = new Database(":memory:", { strict: true });
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  const first = ingestWeek(db, dir, "2026-W42");
  ingestWeek(db, dir, "2026-W42");

  expect(first).toEqual({ linear: "ok", github: "count_mismatch" });
  expect(db.query("SELECT count(*) n FROM events").get()).toEqual({ n: 3 });
  expect(db.query("SELECT project_id, milestone_id, week FROM events WHERE id = 'linear:ACME-41'").get())
    .toEqual({ project_id: "P-ACME-1", milestone_id: "m1", week: "2026-W42" });
  expect(db.query("SELECT to_ref FROM links WHERE from_id = 'linear:ACME-41'").all()).toEqual([{ to_ref: "github:acme/api#101" }]);
});
