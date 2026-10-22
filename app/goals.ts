// Goals. A thread serves a goal through a project you linked, or because you linked the thread.
import { labelsOf, reviewThreads } from "../core/threads";
import { current, known, METRICS, progress } from "../core/metrics";
import { direct, goalsOf } from "../core/goals";
import { isoWeek } from "../core/db";
import { LIVE } from "../core/threads";
import { db, discard, goalLinks, labeled, pick, thread } from "./data";

const QUARTER = /^\d{4}-Q[1-4]$/;
export function goalList() {
  const weeks = labeled(), L = goalLinks();
  const busy = new Map<string, number>(); // threads per project, so you can start a goal from your busiest work
  const projects = db.query("SELECT p.id, p.name FROM goal_projects gp JOIN projects p ON p.id = gp.project_id WHERE gp.goal_id = ? ORDER BY p.name");
  const krs = db.query("SELECT id, text, metric, start, target, current FROM key_results WHERE goal_id = ? ORDER BY pos");
  const checkins = db.query("SELECT week, confidence FROM goal_checkins WHERE goal_id = ? ORDER BY week");
  const gs = new Map((db.query("SELECT id, title, description, kind, type, quarter FROM goals ORDER BY kind = 'personal', id").all() as any[])
    .map((g) => { const now = isoWeek(new Date().toISOString());
      // An auto key result reads its metric (a rate or the quarter's total); a manual one is what you typed.
      const k = (krs.all(g.id) as any[]).map((r) => { const value = r.metric ? current(db, r.metric, g.quarter, now) : r.current; return { ...r, value, progress: progress(r.start, r.target, value) }; });
      return [g.id, { ...g, krs: k, checkins: checkins.all(g.id), projects: projects.all(g.id), weeks: {} as Record<string, any[]> }]; }));
  for (const week of weeks) for (const t of reviewThreads(db, week)) {
    const l = labelsOf(db, t), d = discard(l);
    if (d === "yes") continue;
    const v = pick(l);
    const mine = direct(L, t);
    if (t.projects[0]) busy.set(t.projects[0].id, (busy.get(t.projects[0].id) ?? 0) + 1);
    for (const id of goalsOf(L, t)) (gs.get(id)!.weeks[week] ??= []).push({ key: t.key, title: v("title"), decided: !!d, direct: mine.includes(id) });
  }
  // What a key result can measure: the app's metrics, and milestones of the projects a goal serves.
  const milestones = db.query(`SELECT m.id, m.name, m.progress, p.name project FROM milestones m JOIN projects p ON p.id = m.project_id WHERE p.id IN (SELECT id FROM projects WHERE ${LIVE}) ORDER BY p.name, m.name`).all();
  return { week: isoWeek(new Date().toISOString()), metrics: Object.entries(METRICS).map(([key, m]) => ({ key, label: m.label, unit: m.unit, better: m.better, agg: m.agg })), milestones,
    // Claude's drafts wait here until you use or dismiss them. A metric start is code's (jobs/drafts.ts).
    drafts: (db.query("SELECT id, title, kind, type, quarter, why, based_on, krs FROM goal_drafts ORDER BY id").all() as any[])
      .map((r) => ({ ...r, based_on: JSON.parse(r.based_on), krs: JSON.parse(r.krs) })),
    weeks, goals: [...gs.values()], projects: (db.query(`SELECT id, name, kind FROM projects WHERE ${LIVE} ORDER BY name`).all() as any[]).map((p) => ({ ...p, threads: busy.get(p.id) ?? 0 })) };
}
// Create, edit or delete one goal. Deleting it removes its links, never a project or a thread.
export function saveGoal(b: any) {
  const id = b?.id == null ? null : Number(b.id);
  if (id != null && !db.query("SELECT 1 FROM goals WHERE id = ?").get(id)) return new Response("Unknown goal", { status: 400 });
  if (b?.delete) { db.query("DELETE FROM goals WHERE id = ?").run(id); return Response.json({ ok: true }); }
  const title = typeof b?.title === "string" ? b.title.trim() : "";
  const quarter = b?.quarter ? String(b.quarter) : null;
  if (!title || title.length > 120) return new Response("A goal needs a title, up to 120 characters", { status: 400 });
  const description = typeof b?.description === "string" && b.description.trim() ? b.description.trim() : null;
  if (description && description.length > 600) return new Response("The description fits in 600 characters", { status: 400 });
  if (!["team", "personal"].includes(b?.kind)) return new Response("Pick team or personal", { status: 400 });
  if (quarter && !QUARTER.test(quarter)) return new Response("Quarter looks like 2026-Q4", { status: 400 });
  const type = b?.type ?? "aspirational";
  if (!["committed", "aspirational"].includes(type)) return new Response("Pick committed or aspirational", { status: 400 });
  // Key results arrive whole: the list you see replaces the stored one.
  const list = Array.isArray(b?.krs) ? b.krs : [];
  if (list.length > 5) return new Response("Five key results at most: more than that is a task list", { status: 400 });
  const num = (v: any) => v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : NaN;
  const rows = list.map((k: any) => ({ text: typeof k?.text === "string" ? k.text.trim() : "", metric: k?.metric || null, start: num(k?.start), target: num(k?.target), current: k?.metric ? null : num(k?.current) }));
  for (const k of rows) {
    if (!k.text || k.text.length > 200) return new Response("Each key result needs a text, up to 200 characters", { status: 400 });
    if ([k.start, k.target, k.current].some(Number.isNaN)) return new Response(`"${k.text}": start, target and now must be numbers`, { status: 400 });
    if (k.metric && !known(db, k.metric)) return new Response(`"${k.text}": unknown measure`, { status: 400 });
  }
  const at = new Date().toISOString();
  const put = db.query("INSERT INTO key_results (goal_id, pos, text, metric, start, target, current, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  let gid = id;
  db.transaction(() => {
    if (gid == null) gid = Number(db.query("INSERT INTO goals (title, description, kind, type, quarter, at) VALUES (?, ?, ?, ?, ?, ?)").run(title, description, b.kind, type, quarter, at).lastInsertRowid);
    else db.query("UPDATE goals SET title = ?, description = ?, kind = ?, type = ?, quarter = ?, krs = NULL, at = ? WHERE id = ?").run(title, description, b.kind, type, quarter, at, gid);
    db.query("DELETE FROM key_results WHERE goal_id = ?").run(gid);
    rows.forEach((k: any, i: number) => put.run(gid, i, k.text, k.metric, k.start, k.target, k.current, at));
    // A draft you used is now this goal.
    if (b.draft_id != null) db.query("DELETE FROM goal_drafts WHERE id = ?").run(Number(b.draft_id));
  })();
  return Response.json({ ok: true, id: gid });
}
// How sure you are this week, 1 to 10. Only this week: a check-in is what you knew then.
export function checkin(b: any) {
  const c = Number(b?.confidence), week = isoWeek(new Date().toISOString());
  if (!db.query("SELECT 1 FROM goals WHERE id = ?").get(Number(b?.goal_id))) return new Response("Unknown goal", { status: 400 });
  if (!Number.isInteger(c) || c < 1 || c > 10) return new Response("Confidence is 1 to 10", { status: 400 });
  db.query(`INSERT INTO goal_checkins (goal_id, week, confidence, at) VALUES (?, ?, ?, ?)
    ON CONFLICT DO UPDATE SET confidence = excluded.confidence, at = excluded.at`).run(Number(b.goal_id), week, c, new Date().toISOString());
  return Response.json({ ok: true, week });
}
// Link or unlink a project, or one thread, to a goal.
export function linkGoal(b: any) {
  if (!db.query("SELECT 1 FROM goals WHERE id = ?").get(Number(b?.goal_id))) return new Response("Unknown goal", { status: 400 });
  const g = Number(b.goal_id), on = b.on === true;
  if (typeof b.project_id === "string") {
    if (!db.query(`SELECT 1 FROM projects WHERE id = ? AND ${LIVE}`).get(b.project_id)) return new Response("Unknown project", { status: 400 });
    db.query(on ? "INSERT OR IGNORE INTO goal_projects VALUES (?, ?)" : "DELETE FROM goal_projects WHERE goal_id = ? AND project_id = ?").run(g, b.project_id);
    return Response.json({ ok: true });
  }
  const t = thread(b);
  if (!t) return new Response("Unknown thread for that week", { status: 400 });
  const q = db.query(on ? "INSERT OR IGNORE INTO goal_events VALUES (?, ?)" : "DELETE FROM goal_events WHERE goal_id = ? AND event_id = ?");
  db.transaction(() => { for (const e of t.events) q.run(g, e.id); })();
  return Response.json({ ok: true });
}
export function dismissDraft(b: any) {
  return db.query("DELETE FROM goal_drafts WHERE id = ?").run(Number(b?.id)).changes ? Response.json({ ok: true }) : new Response("Unknown draft", { status: 400 });
}
