// Claude places threads Linear does not put in a project, so they group with that project's work.
// Usage: bun jobs/assign.ts emit 2026-W42 | claude -p "/assign-projects 2026-W42" ...
//        bun jobs/assign.ts save 2026-W42 data/raw/2026-W42/assign.run.json
import type { Database } from "bun:sqlite";
import { open } from "../core/db";
import { LIVE, reviewThreads } from "../core/threads";
import { modelOf, promptVersion, readJson, weekOutput } from "./claude";

const liveProjects = (db: Database) =>
  db.query(`SELECT id, name, kind FROM projects WHERE ${LIVE} ORDER BY name`).all() as any[];

// Each project's own issue titles, from every week: its vocabulary. "billing-worker" is
// in a Billing issue, so a PR about it can be placed by evidence, not by guess.
function issueTitles(db: Database, projectId: string) {
  const rows = db
    .query(
      `SELECT DISTINCT title FROM events WHERE project_id = ? AND kind LIKE 'issue_%'
        ORDER BY occurred_at DESC LIMIT 40`,
    )
    .all(projectId) as any[];
  return rows.map((row) => row.title);
}

export function unplaced(db: Database, week: string) {
  return {
    week,
    projects: liveProjects(db).map((project) => ({
      ...project,
      issues: issueTitles(db, project.id),
    })),
    threads: reviewThreads(db, week)
      .filter((thread) => !thread.projects.length)
      .map(({ key, events }) => ({ key, events })),
  };
}

export function saveAssignments(db: Database, week: string, run: any, promptVersion: string) {
  const out = weekOutput(run, week, "assign");
  const eventsByKey = new Map(
    unplaced(db, week).threads.map((thread) => [
      thread.key,
      thread.events.map((event: any) => event.id),
    ]),
  );
  const knownProjects = new Set(liveProjects(db).map((project) => project.id));
  const model = modelOf(run);
  const put =
    db.query(`INSERT INTO assignments (event_id, project_id, source, model, prompt_version, why, at) VALUES (?, ?, 'claude', ?, ?, ?, ?)
    ON CONFLICT DO UPDATE SET project_id=excluded.project_id, model=excluded.model, prompt_version=excluded.prompt_version, why=excluded.why, at=excluded.at`);
  const at = new Date().toISOString();
  let placed = 0;
  let skipped = 0;
  db.transaction(() => {
    for (const assignment of out.assignments) {
      // An unknown key or project id would place nothing, or place it wrong.
      const unknownProject =
        assignment.project_id !== null && !knownProjects.has(assignment.project_id);
      if (!eventsByKey.has(assignment.key) || unknownProject) {
        skipped++;
        continue;
      }
      for (const eventId of eventsByKey.get(assignment.key)!)
        put.run(eventId, assignment.project_id, model, promptVersion, assignment.why, at);
      if (assignment.project_id) placed++;
    }
  })();
  return { threads: eventsByKey.size, placed, skipped };
}

if (import.meta.main) {
  const [command, week, file] = process.argv.slice(2);
  const db = open();
  if (command === "emit") console.log(JSON.stringify(unplaced(db, week)));
  else if (command === "save") {
    const version = promptVersion("assign-projects");
    console.log(saveAssignments(db, week, readJson(file), version));
  } else throw new Error("usage: bun jobs/assign.ts emit|save <week> [file]");
}
