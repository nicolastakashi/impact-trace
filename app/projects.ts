// Projects: Linear's and your topics, what you merged or deleted, and each one's threads.
import { discardOf, labelsOf, labelValue, PLACED, reviewThreads } from "../core/threads";
import { badRequest, db, isLiveProject, labeled, liveProjects, threadOf } from "./data";

// Issues completed per project, one count per week asked for. null is no project.
function completedPerWeek(weeks: string[]) {
  const weekIndex = new Map(weeks.map((week, i) => [week, i]));
  const done = new Map<string | null, number[]>();
  const rows = db
    .query(
      "SELECT project_id, week, count(*) n FROM events WHERE kind = 'issue_completed' GROUP BY 1, 2",
    )
    .all() as any[];
  for (const row of rows) {
    if (!weekIndex.has(row.week)) continue;
    if (!done.has(row.project_id))
      done.set(
        row.project_id,
        weeks.map(() => 0),
      );
    done.get(row.project_id)![weekIndex.get(row.week)!] = row.n;
  }
  return done;
}

export function projects(weeks: string[]) {
  const done = completedPerWeek(weeks);
  const open = new Map(
    (
      db
        .query("SELECT project_id, count(*) n FROM events WHERE kind = 'issue_open' GROUP BY 1")
        .all() as any[]
    ).map((row) => [row.project_id, row.n]),
  );
  const milestones = db.query(
    "SELECT name, progress, target_date FROM milestones WHERE project_id = ? ORDER BY name",
  );
  const zero = weeks.map(() => 0);
  return {
    weeks,
    projects: (db.query("SELECT id, name, url, lead, status FROM projects").all() as any[]).map(
      (p) => ({
        ...p,
        done: done.get(p.id) ?? zero,
        open: open.get(p.id) ?? 0,
        ms: milestones.all(p.id),
      }),
    ),
    none: { done: done.get(null) ?? zero, open: open.get(null) ?? 0 },
    collected_at: (db.query("SELECT max(ingested_at) t FROM runs WHERE status = 'ok'").get() as any)
      .t,
  };
}

// You put one thread in a group: an existing one by id, or a new topic by name. Your choice
// beats Linear and Claude for every event in the thread.
export function group(body: any) {
  const thread = threadOf(body);
  if (!thread) return badRequest("Unknown thread for that week");
  let id = typeof body.group_id === "string" ? body.group_id : null;
  if (id && !db.query("SELECT 1 FROM projects WHERE id = ?").get(id))
    return badRequest("Unknown group");
  if (!id) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 80) return badRequest("A new group needs a name");
    id = topicNamed(name);
  }
  const put =
    db.query(`INSERT INTO assignments (event_id, project_id, source, at) VALUES (?, ?, 'human', ?)
    ON CONFLICT DO UPDATE SET project_id = excluded.project_id, at = excluded.at`);
  const at = new Date().toISOString();
  db.transaction(() => {
    for (const e of thread.events) put.run(e.id, id, at);
  })();
  return Response.json({ ok: true, group_id: id });
}

// The project with this name, any case, or a new topic for it. Returns its id.
function topicNamed(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const existing = db
    .query("SELECT id FROM projects WHERE lower(name) = lower(?)")
    .get(name) as any;
  const id: string = existing?.id ?? `topic:${slug}`;
  // Creating a topic with a deleted one's name brings it back.
  db.query("DELETE FROM project_deletions WHERE id = ?").run(id);
  if (!existing)
    db.query("INSERT INTO projects (id, name, kind, updated_at) VALUES (?, ?, 'topic', ?)").run(
      id,
      name,
      new Date().toISOString(),
    );
  return id;
}

// You say two projects are one piece of work. Undo with unmerge; nothing else is rewritten.
export function merge(body: any) {
  const { from, into } = body ?? {};
  if (
    typeof from !== "string" ||
    typeof into !== "string" ||
    from === into ||
    !isLiveProject(from) ||
    !isLiveProject(into)
  )
    return badRequest("Pick two different projects");
  const at = new Date().toISOString();
  db.transaction(() => {
    // Projects already merged into `from` follow it, so there is never a chain.
    db.query("UPDATE project_merges SET into_id = ? WHERE into_id = ?").run(into, from);
    db.query("INSERT INTO project_merges VALUES (?, ?, ?)").run(from, into, at);
  })();
  return Response.json({ ok: true });
}
// Delete a project: its threads lose their project. Projects merged into it stand alone again.
export function del(body: any) {
  const id = String(body?.id ?? "");
  if (!isLiveProject(id)) return badRequest("Unknown project");
  db.transaction(() => {
    db.query("DELETE FROM project_merges WHERE into_id = ?").run(id);
    db.query("INSERT INTO project_deletions VALUES (?, ?)").run(id, new Date().toISOString());
  })();
  return Response.json({ ok: true });
}
export function restore(body: any) {
  const restored = db
    .query("DELETE FROM project_deletions WHERE id = ?")
    .run(String(body?.id ?? "")).changes;
  return restored ? Response.json({ ok: true }) : badRequest("Not deleted");
}
export function unmerge(body: any) {
  const unmerged = db
    .query("DELETE FROM project_merges WHERE from_id = ?")
    .run(String(body?.from ?? "")).changes;
  return unmerged ? Response.json({ ok: true }) : badRequest("Not merged");
}

// Every group, week by week: the threads in it, with Claude's title or yours.
export function groups() {
  const weeks = labeled();
  const mergedInto = db.query(
    "SELECT p.id, p.name FROM project_merges m JOIN projects p ON p.id = m.from_id WHERE m.into_id = ? ORDER BY p.name",
  );
  const byId = new Map(
    liveProjects().map((g) => [
      g.id,
      { ...g, merged: mergedInto.all(g.id), weeks: {} as Record<string, any[]> },
    ]),
  );
  for (const week of weeks)
    for (const thread of reviewThreads(db, week)) {
      const group = thread.projects[0] && byId.get(thread.projects[0].id);
      if (!group) continue;
      const labels = labelsOf(db, thread);
      const discard = discardOf(labels);
      if (discard === "yes") continue;
      (group.weeks[week] ??= []).push({
        key: thread.key,
        title: labelValue(labels, "title"),
        summary: labelValue(labels, "summary"),
        events: thread.events.length,
        decided: !!discard,
      });
    }
  return {
    weeks,
    groups: [...byId.values()].filter((g) => Object.keys(g.weeks).length || g.kind === "topic"),
    deleted: db
      .query(
        "SELECT p.id, p.name, p.kind FROM project_deletions d JOIN projects p ON p.id = d.id ORDER BY d.at DESC",
      )
      .all(),
  };
}

// One project, all of it: where its events come from (itself and what you merged in),
// and every thread week by week with its events. Discarded threads come flagged.
export function project(id: string) {
  const p = db
    .query("SELECT id, name, kind, url, lead, status FROM projects WHERE id = ?")
    .get(id) as any;
  if (!p) return new Response("Unknown project", { status: 404 });
  const into = db.query("SELECT into_id FROM project_merges WHERE from_id = ?").get(id) as any;
  if (into) return Response.json({ into: into.into_id });
  const sources = [
    p,
    ...(db
      .query(
        "SELECT p.id, p.name, p.kind, p.url FROM project_merges m JOIN projects p ON p.id = m.from_id WHERE m.into_id = ? ORDER BY p.name",
      )
      .all(id) as any[]),
  ];
  const placedIn = db.query(`SELECT ${PLACED} s FROM events WHERE id = ?`);
  const weeks = labeled();
  const threads = weeks.flatMap((week) =>
    reviewThreads(db, week)
      .filter((thread) => thread.projects.some((x) => x.id === id))
      .map((thread) => {
        const labels = labelsOf(db, thread);
        const discard = discardOf(labels);
        return {
          week,
          key: thread.key,
          title: labelValue(labels, "title"),
          summary: labelValue(labels, "summary"),
          decided: !!discard,
          discarded: discard === "yes",
          events: thread.events.map((e) => ({
            id: e.id,
            kind: e.kind,
            title: e.title,
            url: e.url,
            source: (placedIn.get(e.id) as any)?.s,
          })),
        };
      }),
  );
  return Response.json({
    project: p,
    goals: db
      .query(
        "SELECT id, title, kind, EXISTS (SELECT 1 FROM goal_projects WHERE goal_id = goals.id AND project_id = ?) on_ FROM goals ORDER BY kind = 'personal', id",
      )
      .all(id),
    deleted: !!db.query("SELECT 1 FROM project_deletions WHERE id = ?").get(id),
    sources,
    weeks,
    threads,
    ms: db
      .query("SELECT name, progress FROM milestones WHERE project_id = ? ORDER BY name")
      .all(id),
    open: (
      db
        .query("SELECT count(*) n FROM events WHERE kind = 'issue_open' AND project_id = ?")
        .get(id) as any
    ).n,
  });
}
