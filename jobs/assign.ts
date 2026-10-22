// Claude places threads Linear does not put in a project, so they group with that project's work.
// Usage: bun jobs/assign.ts emit 2026-W42 | claude -p "/assign-projects 2026-W42" ...
//        bun jobs/assign.ts save 2026-W42 data/raw/2026-W42/assign.run.json
import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LIVE } from "../core/threads";
import { open, ROOT } from "../core/db";
import { reviewThreads } from "../core/threads";

export function unplaced(db: Database, week: string) {
  return {
    week,
    // Each project's own issue titles, from every week: its vocabulary. "billing-worker" is
    // in a Billing issue, so a PR about it can be placed by evidence, not by guess.
    projects: (
      db.query(`SELECT id, name, kind FROM projects WHERE ${LIVE} ORDER BY name`).all() as any[]
    ).map((p) => ({
      ...p,
      issues: (
        db
          .query(
            `SELECT DISTINCT title FROM events WHERE project_id = ? AND kind LIKE 'issue_%'
        ORDER BY occurred_at DESC LIMIT 40`,
          )
          .all(p.id) as any[]
      ).map((r) => r.title),
    })),
    threads: reviewThreads(db, week)
      .filter((t) => !t.projects.length)
      .map(({ key, events }) => ({ key, events })),
  };
}

export function saveAssignments(db: Database, week: string, run: any, promptVersion: string) {
  const out = run.structured_output;
  if (run.is_error || !out || out.week !== week)
    throw new Error(`assign ${week}: no usable output`);
  const byKey = new Map(
    unplaced(db, week).threads.map((t) => [t.key, t.events.map((e: any) => e.id)]),
  );
  const known = new Set(
    (db.query(`SELECT id FROM projects WHERE ${LIVE}`).all() as any[]).map((p) => p.id),
  );
  const model = Object.keys(run.modelUsage ?? {})[0] ?? null;
  const put =
    db.query(`INSERT INTO assignments (event_id, project_id, source, model, prompt_version, why, at) VALUES (?, ?, 'claude', ?, ?, ?, ?)
    ON CONFLICT DO UPDATE SET project_id=excluded.project_id, model=excluded.model, prompt_version=excluded.prompt_version, why=excluded.why, at=excluded.at`);
  const at = new Date().toISOString();
  let placed = 0,
    skipped = 0;
  db.transaction(() => {
    for (const a of out.assignments) {
      // An unknown key or project id would place nothing, or place it wrong.
      if (!byKey.has(a.key) || (a.project_id !== null && !known.has(a.project_id))) {
        skipped++;
        continue;
      }
      for (const id of byKey.get(a.key)!)
        put.run(id, a.project_id, model, promptVersion, a.why, at);
      if (a.project_id) placed++;
    }
  })();
  return { threads: byKey.size, placed, skipped };
}

if (import.meta.main) {
  const [cmd, week, file] = process.argv.slice(2);
  const db = open();
  if (cmd === "emit") console.log(JSON.stringify(unplaced(db, week)));
  else if (cmd === "save") {
    const skill = readFileSync(join(ROOT, ".claude/skills/assign-projects/SKILL.md"));
    const version = createHash("sha256").update(skill).digest("hex").slice(0, 8);
    console.log(saveAssignments(db, week, JSON.parse(readFileSync(file, "utf8")), version));
  } else throw new Error("usage: bun jobs/assign.ts emit|save <week> [file]");
}
