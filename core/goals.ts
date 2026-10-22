// Which goals a thread serves: through a project you linked, or because you linked the thread.
import type { Database } from "bun:sqlite";

export function links(db: Database) {
  const by = (sql: string) => { const m = new Map<string, number[]>();
    for (const r of db.query(sql).all() as any[]) m.set(r.k, [...(m.get(r.k) ?? []), r.g]); return m; };
  // A link to a project you later merged follows it into the other one.
  return { project: by("SELECT goal_id g, coalesce(m.into_id, gp.project_id) k FROM goal_projects gp LEFT JOIN project_merges m ON m.from_id = gp.project_id"),
    event: by("SELECT goal_id g, event_id k FROM goal_events") };
}
type Links = ReturnType<typeof links>;
type Thread = { projects: { id: string }[]; events: { id: string }[] };
export const viaProject = (L: Links, t: Thread) => [...new Set(t.projects.flatMap((p) => L.project.get(p.id) ?? []))];
export const direct = (L: Links, t: Thread) => [...new Set(t.events.flatMap((e) => L.event.get(e.id) ?? []))];
export const goalsOf = (L: Links, t: Thread) => [...new Set([...viaProject(L, t), ...direct(L, t)])];
