// Which goals a thread serves: through a project you linked, or because you linked the thread.
import type { Database } from "bun:sqlite";
import { listOf } from "./threads";

// Goal ids per key, from rows of (goal_id, key).
function goalIdsBy(db: Database, sql: string) {
  const goalIds = new Map<string, number[]>();
  for (const row of db.query(sql).all() as any[]) listOf(goalIds, row.key).push(row.goal_id);
  return goalIds;
}

export function links(db: Database) {
  // A link to a project you later merged follows it into the other one.
  return {
    project: goalIdsBy(
      db,
      "SELECT goal_id, coalesce(m.into_id, gp.project_id) key FROM goal_projects gp LEFT JOIN project_merges m ON m.from_id = gp.project_id",
    ),
    event: goalIdsBy(db, "SELECT goal_id, event_id key FROM goal_events"),
  };
}
type Links = ReturnType<typeof links>;
type Thread = { projects: { id: string }[]; events: { id: string }[] };
const unique = (ids: number[]) => [...new Set(ids)];

export const viaProject = (goalLinks: Links, thread: Thread) =>
  unique(thread.projects.flatMap((project) => goalLinks.project.get(project.id) ?? []));
export const direct = (goalLinks: Links, thread: Thread) =>
  unique(thread.events.flatMap((event) => goalLinks.event.get(event.id) ?? []));
export const goalsOf = (goalLinks: Links, thread: Thread) =>
  unique([...viaProject(goalLinks, thread), ...direct(goalLinks, thread)]);
