// Projects: Linear's and your topics, what you merged or deleted, and each one's threads.
import { discardOf, labelsOf, labelValue, reviewThreads } from "../core/threads";
import { LIVE, PLACED } from "../core/threads";
import { db, labeled, thread } from "./data";

export function projects(weeks: string[]) {
  const ix = new Map(weeks.map((w, i) => [w, i]));
  const done = new Map<string | null, number[]>();
  for (const r of db
    .query(
      "SELECT project_id, week, count(*) n FROM events WHERE kind = 'issue_completed' GROUP BY 1, 2",
    )
    .all() as any[]) {
    if (!ix.has(r.week)) continue;
    if (!done.has(r.project_id))
      done.set(
        r.project_id,
        weeks.map(() => 0),
      );
    done.get(r.project_id)![ix.get(r.week)!] = r.n;
  }
  const open = new Map(
    (
      db
        .query("SELECT project_id, count(*) n FROM events WHERE kind = 'issue_open' GROUP BY 1")
        .all() as any[]
    ).map((r) => [r.project_id, r.n]),
  );
  const ms = db.query(
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
        ms: ms.all(p.id),
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
  const t = thread(body);
  if (!t) return new Response("Unknown thread for that week", { status: 400 });
  let id = typeof body.group_id === "string" ? body.group_id : null;
  if (id && !db.query("SELECT 1 FROM projects WHERE id = ?").get(id))
    return new Response("Unknown group", { status: 400 });
  if (!id) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 80) return new Response("A new group needs a name", { status: 400 });
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const existing = db
      .query("SELECT id FROM projects WHERE lower(name) = lower(?)")
      .get(name) as any;
    id = existing?.id ?? `topic:${slug}`;
    // Creating a topic with a deleted one's name brings it back.
    db.query("DELETE FROM project_deletions WHERE id = ?").run(id);
    if (!existing)
      db.query("INSERT INTO projects (id, name, kind, updated_at) VALUES (?, ?, 'topic', ?)").run(
        id,
        name,
        new Date().toISOString(),
      );
  }
  const put =
    db.query(`INSERT INTO assignments (event_id, project_id, source, at) VALUES (?, ?, 'human', ?)
    ON CONFLICT DO UPDATE SET project_id = excluded.project_id, at = excluded.at`);
  const at = new Date().toISOString();
  db.transaction(() => {
    for (const e of t.events) put.run(e.id, id, at);
  })();
  return Response.json({ ok: true, group_id: id });
}

// You say two projects are one piece of work. Undo with unmerge; nothing else is rewritten.
export function merge(body: any) {
  const known = db.query(`SELECT 1 FROM projects WHERE id = ? AND ${LIVE}`);
  const { from, into } = body ?? {};
  if (
    typeof from !== "string" ||
    typeof into !== "string" ||
    from === into ||
    !known.get(from) ||
    !known.get(into)
  )
    return new Response("Pick two different projects", { status: 400 });
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
  if (!db.query(`SELECT 1 FROM projects WHERE id = ? AND ${LIVE}`).get(id))
    return new Response("Unknown project", { status: 400 });
  db.transaction(() => {
    db.query("DELETE FROM project_merges WHERE into_id = ?").run(id);
    db.query("INSERT INTO project_deletions VALUES (?, ?)").run(id, new Date().toISOString());
  })();
  return Response.json({ ok: true });
}
export function restore(body: any) {
  const n = db
    .query("DELETE FROM project_deletions WHERE id = ?")
    .run(String(body?.id ?? "")).changes;
  return n ? Response.json({ ok: true }) : new Response("Not deleted", { status: 400 });
}
export function unmerge(body: any) {
  const n = db
    .query("DELETE FROM project_merges WHERE from_id = ?")
    .run(String(body?.from ?? "")).changes;
  return n ? Response.json({ ok: true }) : new Response("Not merged", { status: 400 });
}

// Every group, week by week: the threads in it, with Claude's title or yours.
export function groups() {
  const weeks = labeled();
  const all = db
    .query(`SELECT id, name, kind FROM projects WHERE ${LIVE} ORDER BY name`)
    .all() as any[];
  const merged = db.query(
    "SELECT p.id, p.name FROM project_merges m JOIN projects p ON p.id = m.from_id WHERE m.into_id = ? ORDER BY p.name",
  );
  const by = new Map(
    all.map((g) => [g.id, { ...g, merged: merged.all(g.id), weeks: {} as Record<string, any[]> }]),
  );
  for (const week of weeks)
    for (const t of reviewThreads(db, week)) {
      const g = t.projects[0] && by.get(t.projects[0].id);
      if (!g) continue;
      const l = labelsOf(db, t);
      const d = discardOf(l);
      if (d === "yes") continue;
      (g.weeks[week] ??= []).push({
        key: t.key,
        title: labelValue(l, "title"),
        summary: labelValue(l, "summary"),
        events: t.events.length,
        decided: !!d,
      });
    }
  return {
    weeks,
    groups: [...by.values()].filter((g) => Object.keys(g.weeks).length || g.kind === "topic"),
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
  const src = db.query(`SELECT ${PLACED} s FROM events WHERE id = ?`);
  const weeks = labeled();
  const threads = weeks.flatMap((week) =>
    reviewThreads(db, week)
      .filter((t) => t.projects.some((x) => x.id === id))
      .map((t) => {
        const l = labelsOf(db, t);
        const d = discardOf(l);
        return {
          week,
          key: t.key,
          title: labelValue(l, "title"),
          summary: labelValue(l, "summary"),
          decided: !!d,
          discarded: d === "yes",
          events: t.events.map((e) => ({
            id: e.id,
            kind: e.kind,
            title: e.title,
            url: e.url,
            source: (src.get(e.id) as any)?.s,
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
