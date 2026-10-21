// Serve the app and its data. Usage: bun app/server.ts  →  http://localhost:4317
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG, LIVE, open, PLACED, plain } from "../ingest/ingest";
import { labelsOf, reviewThreads } from "../ingest/review";
import { CATEGORIES } from "../ingest/feedback";
import { direct, goalsOf, links, viaProject } from "../ingest/goals";

let db = open();
const page = join(import.meta.dir, "index.html");
// North and Trace read /data.js: built from your decisions, or the fictional sample before you have any.
const sample = join(import.meta.dir, "sample-data.js");

function projects(weeks: string[]) {
  const ix = new Map(weeks.map((w, i) => [w, i]));
  const done = new Map<string | null, number[]>();
  for (const r of db.query("SELECT project_id, week, count(*) n FROM events WHERE kind = 'issue_completed' GROUP BY 1, 2").all() as any[]) {
    if (!ix.has(r.week)) continue;
    if (!done.has(r.project_id)) done.set(r.project_id, weeks.map(() => 0));
    done.get(r.project_id)![ix.get(r.week)!] = r.n;
  }
  const open = new Map((db.query("SELECT project_id, count(*) n FROM events WHERE kind = 'issue_open' GROUP BY 1").all() as any[]).map((r) => [r.project_id, r.n]));
  const ms = db.query("SELECT name, progress, target_date FROM milestones WHERE project_id = ? ORDER BY name");
  const zero = weeks.map(() => 0);
  return {
    weeks,
    projects: (db.query("SELECT id, name, url, lead, status FROM projects").all() as any[]).map((p) => ({
      ...p, done: done.get(p.id) ?? zero, open: open.get(p.id) ?? 0, ms: ms.all(p.id),
    })),
    none: { done: done.get(null) ?? zero, open: open.get(null) ?? 0 },
    collected_at: (db.query("SELECT max(ingested_at) t FROM runs WHERE status = 'ok'").get() as any).t,
  };
}

const WEEK = /^\d{4}-W\d{2}$/;
const FIELDS = { title: null, summary: null, mode: ["clarify", "prevent", "solve", "build", "elevate", "external"], pillar: ["big", "exec", "level"], without_me: ["wouldnt", "slower", "same"], discard: ["yes", "no"] } as Record<string, string[] | null>;

// Threads you have not decided yet, per week. Review opens on the latest week that has some.
function pending() {
  const weeks = (db.query("SELECT DISTINCT week FROM labels ORDER BY 1 DESC").all() as any[]).map((r) => r.week);
  const done = (t: any) => labelsOf(db, t).some((r) => r.field === "discard" && r.source === "human");
  return Object.fromEntries(weeks.map((w) => [w, reviewThreads(db, w).filter((t) => !done(t)).length]));
}

function review(week: string) {
  const L = goalLinks();
  const by = (rows: any[], source: string) => Object.fromEntries(rows.filter((r) => r.source === source).map((r) => [r.field, r.value]));
  return {
    week,
    weeks: (db.query("SELECT DISTINCT week FROM labels ORDER BY 1 DESC").all() as any[]).map((r) => r.week),
    threads: reviewThreads(db, week).map((t) => { const l = labelsOf(db, t);
      return { ...t, claude: by(l, "claude"), human: by(l, "human"), goals: { direct: direct(L, t), project: viaProject(L, t) } }; }),
    goals: db.query("SELECT id, title, kind FROM goals ORDER BY kind = 'personal', id").all(),
    groups: db.query(`SELECT id, name, kind FROM projects WHERE ${LIVE} ORDER BY name`).all(),
    pending: pending(),
  };
}

// Your decision on one thread. Only known fields and values: this is the gold set.
// discard = yes means the thread is not impact at all (a routine ticket): skip it downstream.
function decide(body: any) {
  const t = WEEK.test(body?.week) && reviewThreads(db, body.week).find((x) => x.key === body.key);
  if (!t) return new Response("Unknown thread for that week", { status: 400 });
  const entries = Object.entries(body.labels ?? {}) as [string, string][];
  for (const [f, v] of entries) {
    const allowed = FIELDS[f];
    if (f in FIELDS === false || typeof v !== "string" || !v.trim() || v.length > 1000 || (allowed && !allowed.includes(v)))
      return new Response(`Bad value for ${f}`, { status: 400 });
  }
  const put = db.query(`INSERT INTO labels (thread_key, week, field, value, source, events, at) VALUES (?, ?, ?, ?, 'human', ?, ?)
    ON CONFLICT DO UPDATE SET value=excluded.value, events=excluded.events, at=excluded.at`);
  const at = new Date().toISOString(), ids = JSON.stringify(t.events.map((e) => e.id));
  db.transaction(() => { for (const [f, v] of entries) put.run(t.key, body.week, f, v.trim(), ids, at); })();
  return Response.json({ ok: true });
}

// You undo Claude's project for one thread: its events go back to no project.
function unassign(body: any) {
  const t = WEEK.test(body?.week) && reviewThreads(db, body.week).find((x) => x.key === body.key);
  if (!t) return new Response("Unknown thread for that week", { status: 400 });
  const put = db.query(`INSERT INTO assignments (event_id, project_id, source, at)
    SELECT event_id, NULL, 'human', ? FROM assignments a JOIN events e ON e.id = a.event_id
    WHERE a.event_id = ? AND a.source = 'claude' AND e.project_id IS NULL
    ON CONFLICT DO UPDATE SET project_id = NULL, at = excluded.at`);
  const at = new Date().toISOString();
  db.transaction(() => { for (const e of t.events) put.run(at, e.id); })();
  return Response.json({ ok: true });
}

// You put one thread in a group: an existing one by id, or a new topic by name. Your choice
// beats Linear and Claude for every event in the thread.
function group(body: any) {
  const t = WEEK.test(body?.week) && reviewThreads(db, body.week).find((x) => x.key === body.key);
  if (!t) return new Response("Unknown thread for that week", { status: 400 });
  let id = typeof body.group_id === "string" ? body.group_id : null;
  if (id && !db.query("SELECT 1 FROM projects WHERE id = ?").get(id)) return new Response("Unknown group", { status: 400 });
  if (!id) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 80) return new Response("A new group needs a name", { status: 400 });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const existing = db.query("SELECT id FROM projects WHERE lower(name) = lower(?)").get(name) as any;
    id = existing?.id ?? `topic:${slug}`;
    // Creating a topic with a deleted one's name brings it back.
    db.query("DELETE FROM project_deletions WHERE id = ?").run(id);
    if (!existing) db.query("INSERT INTO projects (id, name, kind, updated_at) VALUES (?, ?, 'topic', ?)").run(id, name, new Date().toISOString());
  }
  const put = db.query(`INSERT INTO assignments (event_id, project_id, source, at) VALUES (?, ?, 'human', ?)
    ON CONFLICT DO UPDATE SET project_id = excluded.project_id, at = excluded.at`);
  const at = new Date().toISOString();
  db.transaction(() => { for (const e of t.events) put.run(e.id, id, at); })();
  return Response.json({ ok: true, group_id: id });
}

// You say two projects are one piece of work. Undo with unmerge; nothing else is rewritten.
function merge(body: any) {
  const known = db.query(`SELECT 1 FROM projects WHERE id = ? AND ${LIVE}`);
  const { from, into } = body ?? {};
  if (typeof from !== "string" || typeof into !== "string" || from === into || !known.get(from) || !known.get(into))
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
function del(body: any) {
  const id = String(body?.id ?? "");
  if (!db.query(`SELECT 1 FROM projects WHERE id = ? AND ${LIVE}`).get(id)) return new Response("Unknown project", { status: 400 });
  db.transaction(() => {
    db.query("DELETE FROM project_merges WHERE into_id = ?").run(id);
    db.query("INSERT INTO project_deletions VALUES (?, ?)").run(id, new Date().toISOString());
  })();
  return Response.json({ ok: true });
}
function restore(body: any) {
  const n = db.query("DELETE FROM project_deletions WHERE id = ?").run(String(body?.id ?? "")).changes;
  return n ? Response.json({ ok: true }) : new Response("Not deleted", { status: 400 });
}
function unmerge(body: any) {
  const n = db.query("DELETE FROM project_merges WHERE from_id = ?").run(String(body?.from ?? "")).changes;
  return n ? Response.json({ ok: true }) : new Response("Not merged", { status: 400 });
}

// Goals. A thread serves a goal through a project you linked, or because you linked the thread.
const QUARTER = /^\d{4}-Q[1-4]$/;
const goalLinks = () => links(db);

function goalList() {
  const weeks = (db.query("SELECT DISTINCT week FROM labels ORDER BY 1").all() as any[]).map((r) => r.week), L = goalLinks();
  const busy = new Map<string, number>(); // threads per project, so you can start a goal from your busiest work
  const projects = db.query("SELECT p.id, p.name FROM goal_projects gp JOIN projects p ON p.id = gp.project_id WHERE gp.goal_id = ? ORDER BY p.name");
  const gs = new Map((db.query("SELECT id, title, kind, quarter, krs FROM goals ORDER BY kind = 'personal', id").all() as any[])
    .map((g) => [g.id, { ...g, projects: projects.all(g.id), weeks: {} as Record<string, any[]> }]));
  for (const week of weeks) for (const t of reviewThreads(db, week)) {
    const l = labelsOf(db, t), d = l.find((r) => r.field === "discard" && r.source === "human")?.value;
    if (d === "yes") continue;
    const v = (f: string) => (l.find((r) => r.field === f && r.source === "human") ?? l.find((r) => r.field === f && r.source === "claude"))?.value;
    const mine = direct(L, t);
    if (t.projects[0]) busy.set(t.projects[0].id, (busy.get(t.projects[0].id) ?? 0) + 1);
    for (const id of goalsOf(L, t)) (gs.get(id)!.weeks[week] ??= []).push({ key: t.key, title: v("title"), decided: !!d, direct: mine.includes(id) });
  }
  return { weeks, goals: [...gs.values()], projects: (db.query(`SELECT id, name, kind FROM projects WHERE ${LIVE} ORDER BY name`).all() as any[]).map((p) => ({ ...p, threads: busy.get(p.id) ?? 0 })) };
}
// Create, edit or delete one goal. Deleting it removes its links, never a project or a thread.
function saveGoal(b: any) {
  const id = b?.id == null ? null : Number(b.id);
  if (id != null && !db.query("SELECT 1 FROM goals WHERE id = ?").get(id)) return new Response("Unknown goal", { status: 400 });
  if (b?.delete) { db.query("DELETE FROM goals WHERE id = ?").run(id); return Response.json({ ok: true }); }
  const title = typeof b?.title === "string" ? b.title.trim() : "", krs = typeof b?.krs === "string" ? b.krs.trim() : "";
  const quarter = b?.quarter ? String(b.quarter) : null;
  if (!title || title.length > 120) return new Response("A goal needs a title, up to 120 characters", { status: 400 });
  if (!["team", "personal"].includes(b?.kind)) return new Response("Pick team or personal", { status: 400 });
  if (quarter && !QUARTER.test(quarter)) return new Response("Quarter looks like 2026-Q4", { status: 400 });
  if (krs.length > 2000) return new Response("Key results are too long", { status: 400 });
  const at = new Date().toISOString();
  if (id == null) return Response.json({ ok: true, id: Number(db.query("INSERT INTO goals (title, kind, quarter, krs, at) VALUES (?, ?, ?, ?, ?)").run(title, b.kind, quarter, krs || null, at).lastInsertRowid) });
  db.query("UPDATE goals SET title = ?, kind = ?, quarter = ?, krs = ?, at = ? WHERE id = ?").run(title, b.kind, quarter, krs || null, at, id);
  return Response.json({ ok: true, id });
}
// Link or unlink a project, or one thread, to a goal.
function linkGoal(b: any) {
  if (!db.query("SELECT 1 FROM goals WHERE id = ?").get(Number(b?.goal_id))) return new Response("Unknown goal", { status: 400 });
  const g = Number(b.goal_id), on = b.on === true;
  if (typeof b.project_id === "string") {
    if (!db.query(`SELECT 1 FROM projects WHERE id = ? AND ${LIVE}`).get(b.project_id)) return new Response("Unknown project", { status: 400 });
    db.query(on ? "INSERT OR IGNORE INTO goal_projects VALUES (?, ?)" : "DELETE FROM goal_projects WHERE goal_id = ? AND project_id = ?").run(g, b.project_id);
    return Response.json({ ok: true });
  }
  const t = WEEK.test(b?.week) && reviewThreads(db, b.week).find((x) => x.key === b.key);
  if (!t) return new Response("Unknown thread for that week", { status: 400 });
  const q = db.query(on ? "INSERT OR IGNORE INTO goal_events VALUES (?, ?)" : "DELETE FROM goal_events WHERE goal_id = ? AND event_id = ?");
  db.transaction(() => { for (const e of t.events) q.run(g, e.id); })();
  return Response.json({ ok: true });
}

// Every group, week by week: the threads in it, with Claude's title or yours.
function groups() {
  const weeks = (db.query("SELECT DISTINCT week FROM labels ORDER BY 1").all() as any[]).map((r) => r.week);
  const all = db.query(`SELECT id, name, kind FROM projects WHERE ${LIVE} ORDER BY name`).all() as any[];
  const merged = db.query("SELECT p.id, p.name FROM project_merges m JOIN projects p ON p.id = m.from_id WHERE m.into_id = ? ORDER BY p.name");
  const by = new Map(all.map((g) => [g.id, { ...g, merged: merged.all(g.id), weeks: {} as Record<string, any[]> }]));
  for (const week of weeks) for (const t of reviewThreads(db, week)) {
    const g = t.projects[0] && by.get(t.projects[0].id);
    if (!g) continue;
    const l = labelsOf(db, t);
    const v = (f: string) => (l.find((r) => r.field === f && r.source === "human") ?? l.find((r) => r.field === f && r.source === "claude"))?.value;
    const d = l.find((r) => r.field === "discard" && r.source === "human")?.value;
    if (d === "yes") continue;
    (g.weeks[week] ??= []).push({ key: t.key, title: v("title"), summary: v("summary"), events: t.events.length, decided: !!d });
  }
  return { weeks, groups: [...by.values()].filter((g) => Object.keys(g.weeks).length || g.kind === "topic"),
    deleted: db.query("SELECT p.id, p.name, p.kind FROM project_deletions d JOIN projects p ON p.id = d.id ORDER BY d.at DESC").all() };
}

// One project, all of it: where its events come from (itself and what you merged in),
// and every thread week by week with its events. Discarded threads come flagged.
function project(id: string) {
  const p = db.query("SELECT id, name, kind, url, lead, status FROM projects WHERE id = ?").get(id) as any;
  if (!p) return new Response("Unknown project", { status: 404 });
  const into = db.query("SELECT into_id FROM project_merges WHERE from_id = ?").get(id) as any;
  if (into) return Response.json({ into: into.into_id });
  const sources = [p, ...db.query("SELECT p.id, p.name, p.kind, p.url FROM project_merges m JOIN projects p ON p.id = m.from_id WHERE m.into_id = ? ORDER BY p.name").all(id) as any[]];
  const src = db.query(`SELECT ${PLACED} s FROM events WHERE id = ?`);
  const weeks = (db.query("SELECT DISTINCT week FROM labels ORDER BY 1").all() as any[]).map((r) => r.week);
  const threads = weeks.flatMap((week) => reviewThreads(db, week).filter((t) => t.projects.some((x) => x.id === id)).map((t) => {
    const l = labelsOf(db, t);
    const v = (f: string) => (l.find((r) => r.field === f && r.source === "human") ?? l.find((r) => r.field === f && r.source === "claude"))?.value;
    const d = l.find((r) => r.field === "discard" && r.source === "human")?.value;
    return { week, key: t.key, title: v("title"), summary: v("summary"), decided: !!d, discarded: d === "yes",
      events: t.events.map((e) => ({ id: e.id, kind: e.kind, title: e.title, url: e.url, source: (src.get(e.id) as any)?.s })) };
  }));
  return Response.json({ project: p, goals: db.query("SELECT id, title, kind, EXISTS (SELECT 1 FROM goal_projects WHERE goal_id = goals.id AND project_id = ?) on_ FROM goals ORDER BY kind = 'personal', id").all(id), deleted: !!db.query("SELECT 1 FROM project_deletions WHERE id = ?").get(id), sources, weeks, threads, ms: db.query("SELECT name, progress FROM milestones WHERE project_id = ? ORDER BY name").all(id),
    open: (db.query("SELECT count(*) n FROM events WHERE kind = 'issue_open' AND project_id = ?").get(id) as any).n });
}

// North and Trace: the threads you kept in review, the last 8 weeks. Same shape as sample-data.js.
const SRC: Record<string, string> = { github: "GitHub", linear: "Linear", slack: "Slack", calendar: "Calendar", drive: "Docs" };
const COLORS = ["var(--g1)", "var(--g2)", "var(--g3)", "var(--g4)", "var(--g5)"];
function north() {
  const weeks = (db.query("SELECT DISTINCT week FROM labels ORDER BY 1 DESC LIMIT 8").all() as any[]).map((r) => r.week).reverse();
  const meta = db.query("SELECT author, occurred_at, payload FROM events WHERE id = ?");
  const items: any[] = [], rec: any[] = [], L = goalLinks(), inItem = new Map<string, string>();
  weeks.forEach((week, w) => {
    for (const t of reviewThreads(db, week)) {
      const l = labelsOf(db, t);
      const v = (f: string) => (l.find((r) => r.field === f && r.source === "human") ?? l.find((r) => r.field === f && r.source === "claude"))?.value;
      if (l.find((r) => r.field === "discard" && r.source === "human")?.value !== "no") continue;
      const it: any = { id: t.key, w, s: t.projects[0]?.id ?? "none", title: v("title") ?? t.events[0].title, summary: v("summary"),
        mode: v("mode"), pillar: v("pillar"), wm: v("without_me"), g: goalsOf(L, t).map((id) => `g${id}`),
        // Who set each label: facts for another session must say when a value is only Claude's guess.
        by: Object.fromEntries(["title", "mode", "pillar", "without_me"].map((f) => [f, l.some((r) => r.field === f && r.source === "human") ? "you" : "claude"])),
        links: t.events.filter((e) => e.url).map((e) => [SRC[e.id.split(":")[0]] ?? "Other", e.title ?? e.kind, e.url]),
        // Span events for Trace: [kind, when or null, title, url]. Review comments and open issues have no time.
        ev: t.events.map((e) => [e.kind, (meta.get(e.id) as any)?.occurred_at || null, e.title ?? "", e.url ?? null]) };
      // Praise in review: a comment marked praise. Slack praise comes from every mention, below.
      for (const e of t.events) {
        inItem.set(e.id, t.key);
        if (e.kind !== "review_comment") continue;
        const m = meta.get(e.id) as any, text = JSON.parse(m.payload).body ?? "";
        if (/^praise\b/i.test(text.trim())) rec.push({ w, who: m.author ?? "", where: "PR review", t: plain(text).slice(0, 280), when: (m.occurred_at ?? "").slice(0, 10), item: t.key });
      }
      items.push(it);
    }
  });
  if (!items.length) return null;
  // Every mention of you that Claude sorted, kept thread or not: a shoutout in #cheers is rarely in one.
  const sorted = (kind: string) => db.query(`SELECT e.id, e.week, e.author, e.title, e.occurred_at, e.payload, k.about, k.quote FROM mention_kinds k
    JOIN events e ON e.id = k.event_id WHERE k.kind = ? AND e.week IN (${weeks.map(() => "?").join(",")}) ORDER BY e.occurred_at`).all(kind, ...weeks) as any[];
  for (const m of sorted("praise")) { const p = JSON.parse(m.payload);
    rec.push({ w: weeks.indexOf(m.week), who: m.author ?? "", where: m.title, t: plain(p.text ?? "").slice(0, 280), q: m.quote, about: m.about, url: p.permalink ?? null,
      when: (m.occurred_at ?? "").slice(0, 10), item: inItem.get(m.id) }); }
  rec.sort((a, b) => a.when.localeCompare(b.when));
  for (const [i, r] of rec.entries()) { const it = items.find((x) => x.id === r.item); if (it) it.rec ??= i; }
  // Who comes to you: people who asked you for something, most first.
  const asks = new Map<string, any>();
  for (const m of sorted("ask")) { const a = asks.get(m.author) ?? { who: m.author, n: 0, per: weeks.map(() => 0), about: [] };
    a.n++; a.per[weeks.indexOf(m.week)]++; a.about.unshift(m.about); asks.set(m.author, a); }
  const all = projects(weeks).projects as any[];
  const count = (s: string) => items.filter((i) => i.s === s).length;
  const used = [...new Set(items.map((i) => i.s))].filter((s) => s !== "none");
  const P: any = { none: { name: "No project", url: null, lead: null, status: "—", ms: [] } };
  for (const id of used) { const a = all.find((x) => x.id === id); P[id] = { name: a?.name ?? id, url: a?.url ?? null, lead: a?.lead ?? null, status: a?.status ?? "", ms: a?.ms ?? [] }; }
  // The rings are your goals, most served first. Before you write any, the three projects with
  // the most threads stand in, and North says so.
  const served = (id: string) => items.filter((i) => i.g.includes(id)).length;
  let goals = (db.query("SELECT id, title, kind FROM goals").all() as any[]).map((g) => ({ id: `g${g.id}`, short: g.title, title: g.title, kind: g.kind }));
  const from = goals.length ? "goals" : "projects";
  if (!goals.length) {
    goals = used.sort((a, b) => count(b) - count(a)).slice(0, 3).map((id) => ({ id, short: P[id].name, title: P[id].name, kind: "team" }));
    for (const i of items) i.g = goals.some((g) => g.id === i.s) ? [i.s] : [];
  }
  goals.sort((a, b) => served(b.id) - served(a.id));
  // null when a week was collected before that number existed, so it never reads as zero.
  const weekly = (kind: string, field = "count") => weeks.map((w) => (db.query("SELECT json_extract(payload, '$.' || ?) n FROM events WHERE kind = ? AND week = ?").get(field, kind, w) as any)?.n ?? (field === "count" ? 0 : null));
  const reviews = weekly("reviews_given");
  const last = items.filter((i) => i.w === weeks.length - 1);
  const big = [...last.filter((i) => i.wm === "wouldnt" && i.rec != null), ...last.filter((i) => i.rec != null), ...last, ...items.slice().reverse()][0];
  const o: any = {}, js = (k: string, v: any) => { o[k] = v; };
  // Numbers: everything collected, not only kept threads. Times go out raw: the browser
  // knows your time zone, the container does not.
  const per = (k: string) => weeks.map((w) => (db.query("SELECT occurred_at t, payload p FROM events WHERE kind = ? AND week = ?").all(k, w) as any[]).map((r) => ({ t: r.t, ...JSON.parse(r.p) })));
  const msgs = per("slack_message"), ments = per("slack_mention");
  // Lead time: median hours from opened to merged. Median, because one PR open for a month would drag a mean.
  const median = (xs: number[]) => { const s = xs.sort((a, b) => a - b), h = s.length >> 1; return s.length ? +(s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2).toFixed(1) : 0; };
  const prs = per("pr_merged");
  const hours = (m: any) => String(m.start).includes("T") ? (Date.parse(m.end) - Date.parse(m.start)) / 36e5 : 0;
  [js("WEEKS", weeks.map((w) => w.slice(5))), js("REVIEWS", reviews), js("PERIOD", `${weeks[0]} – ${weeks.at(-1)}`),
    js("GOALS", goals.map((g, i) => ({ ...g, color: COLORS[i % COLORS.length] }))), js("GOALS_FROM", from),
    js("NUMS", { slack: msgs.map((m) => m.length), channels: msgs.map((m) => new Set(m.map((x) => x.channel_name)).size), slackAt: msgs.map((m) => m.map((x) => x.t)),
      meetings: per("meeting").map((m) => +m.reduce((a, x) => a + hours(x), 0).toFixed(1)), reach: ments.map((m) => new Set(m.map((x) => x.author_name)).size), merged: prs.map((m) => m.length), opened: weekly("prs_opened"),
      asked_direct: weekly("review_requests", "direct"), asked_team: weekly("review_requests", "team"),
      lead: prs.map((m) => median(m.filter((p) => p.opened).map((p) => (Date.parse(p.at) - Date.parse(p.opened)) / 36e5))) }),
    js("PROJECTS", P), js("REC", rec), js("ASKS", [...asks.values()].sort((a, b) => b.n - a.n).slice(0, 6).map((a) => ({ ...a, about: [...new Set(a.about)].slice(0, 3) }))), js("ITEMS", items), js("HIGHLIGHT", { item: big.id, when: big.rec != null ? rec[big.rec].when : "" }),
    // Feedback, newest week first: what the code verified, never the raw Claude output.
    js("FEEDBACK", (db.query("SELECT week, output FROM feedback ORDER BY week DESC").all() as any[]).map((r) => ({ ...JSON.parse(r.output),
      verdicts: Object.fromEntries((db.query("SELECT item, verdict, why FROM feedback_verdicts WHERE week = ?").all(r.week) as any[]).map((v) => [v.item, { v: v.verdict, why: v.why }])) }))),
    // One story screen per week: its threads, then its first praise.
    js("PHASES", weeks.flatMap((wk, w) => { const r = rec.findIndex((x) => x.w === w);
      return items.some((i) => i.w === w) ? [{ k: wk.slice(5), h: `${items.filter((i) => i.w === w).length} threads kept`, from: w, to: w }, ...(r >= 0 ? [{ k: wk.slice(5), rec: r }] : [])] : []; })),
  ];
  return o;
}

// Accept or reject one piece of feedback; verdict null takes it back.
function verdict(b: any) {
  const row = db.query("SELECT output FROM feedback WHERE week = ?").get(String(b?.week ?? "")) as any;
  if (!row) return new Response("No feedback for that week", { status: 400 });
  const o = JSON.parse(row.output), item = String(b?.item ?? "");
  const items = ["experiment", ...(o.strength ? ["strength"] : []), ...o.patterns.map((p: any) => `pattern:${p.name}`)];
  if (!items.includes(item)) return new Response("Unknown feedback item", { status: 400 });
  if (b.verdict === null) { db.query("DELETE FROM feedback_verdicts WHERE week = ? AND item = ?").run(b.week, item); return Response.json({ ok: true }); }
  if (b.verdict !== "accept" && b.verdict !== "reject") return new Response("Verdict is accept or reject", { status: 400 });
  const why = b.why == null ? null : String(b.why).trim().slice(0, 400) || null;
  db.query(`INSERT INTO feedback_verdicts VALUES (?, ?, ?, ?, ?) ON CONFLICT (week, item) DO UPDATE SET verdict = excluded.verdict, why = excluded.why, at = excluded.at`)
    .run(b.week, item, b.verdict, why, new Date().toISOString());
  return Response.json({ ok: true });
}

// Setup: who you are, so the collectors search for you. ?guess=1 fills the form from the CLIs you already use.
const sh = (...cmd: string[]) => { try { const p = Bun.spawnSync(cmd, { stderr: "ignore" }); return p.success ? p.stdout.toString().trim() : ""; } catch { return ""; } };
function setup(guess: boolean) {
  const config = existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, "utf8")) : null;
  if (!guess) return Response.json({ config });
  const [github = "", name = ""] = sh("gh", "api", "user", "--jq", '.login + "\t" + (.name // "")').split("\t");
  // In the container the tools live on the host, where run.sh runs: this side cannot see them.
  const host = !!process.env.COLLECT_ON_HOST;
  return Response.json({ config, checks: { host, gh: host ? null : !!github, claude: host ? null : !!sh("claude", "--version") },
    guess: { github, name: name || sh("git", "config", "user.name"), orgs: sh("gh", "api", "user/orgs", "--jq", ".[].login").split("\n").filter(Boolean) } });
}
const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
function saveSetup(b: any) {
  const c = { name: String(b?.name ?? "").trim(), github: String(b?.github ?? "").trim(), level: String(b?.level ?? "").trim(),
    orgs: (Array.isArray(b?.orgs) ? b.orgs : []).map((o: any) => String(o).trim()).filter(Boolean) };
  // These go into search queries and shell arguments: keep them to what names look like.
  if (!c.name || c.name.length > 80 || /["\n\\]/.test(c.name)) return new Response("Your name, as people write it in Slack", { status: 400 });
  if (!LOGIN.test(c.github)) return new Response("A GitHub login: letters, digits and dashes", { status: 400 });
  if (!c.orgs.every((o: string) => LOGIN.test(o))) return new Response("GitHub orgs: letters, digits and dashes", { status: 400 });
  if (!c.level || c.level.length > 60) return new Response("Your level, for example Senior Engineer", { status: 400 });
  writeFileSync(CONFIG, JSON.stringify(c, null, 2) + "\n");
  return Response.json({ ok: true });
}

const server = Bun.serve({
  // PORT lets a second copy, with its own data/, run next to yours.
  port: Number(process.env.PORT ?? 4317),
  // Your work data and a write endpoint: never reachable from the network. In the container
  // HOST is 0.0.0.0 and compose publishes the port on 127.0.0.1 only.
  hostname: process.env.HOST ?? "127.0.0.1",
  async fetch(req) {
    // Collection writes from the host. Over Docker's file share an open connection can keep reading
    // old pages, so each request reads with a fresh one.
    db.close(); db = open();
    const url = new URL(req.url);
    // No cache: after an update or a new review, the next load shows it.
    if (url.pathname === "/") return new Response(Bun.file(page), { headers: { "cache-control": "no-cache" } });
    // Old addresses: review and groups now live inside the one page.
    if (url.pathname === "/review" || url.pathname === "/groups") return new Response(null, { status: 302, headers: { location: `/#${url.pathname === "/groups" ? "/projects" : url.pathname}${url.search}` } });
    if (url.pathname === "/api/setup" && req.method === "GET") return setup(url.searchParams.has("guess"));
    if (url.pathname === "/api/groups") return Response.json(groups());
    if (url.pathname === "/api/pending") return Response.json(pending());
    if (url.pathname === "/api/project") return project(url.searchParams.get("id") ?? "");
    if (url.pathname === "/api/review") {
      const left = Object.entries(pending()).find(([, n]) => n > 0);
      const week = url.searchParams.get("week") ?? left?.[0] ?? (db.query("SELECT max(week) w FROM labels").get() as any).w;
      return WEEK.test(week ?? "") ? Response.json(review(week)) : Response.json({ week: null, weeks: [], threads: [] });
    }
    // A JSON content type forces a CORS preflight, so other sites cannot post here.
    const json = req.method === "POST" && req.headers.get("content-type") === "application/json";
    if (url.pathname === "/api/setup" && json) return saveSetup(await req.json().catch(() => null));
    if (url.pathname === "/api/labels" && json) return decide(await req.json().catch(() => null));
    if (url.pathname === "/api/unassign" && json) return unassign(await req.json().catch(() => null));
    if (url.pathname === "/api/group" && json) return group(await req.json().catch(() => null));
    if (url.pathname === "/api/merge" && json) return merge(await req.json().catch(() => null));
    if (url.pathname === "/api/delete" && json) return del(await req.json().catch(() => null));
    if (url.pathname === "/api/restore" && json) return restore(await req.json().catch(() => null));
    if (url.pathname === "/api/feedback" && json) return verdict(await req.json().catch(() => null));
    if (url.pathname === "/api/goal" && json) return saveGoal(await req.json().catch(() => null));
    if (url.pathname === "/api/goal-link" && json) return linkGoal(await req.json().catch(() => null));
    if (url.pathname === "/api/unmerge" && json) return unmerge(await req.json().catch(() => null));
    // The feedback categories and their sources come with the data, the example too.
    // Same data as North, as JSON, for ingest/facts.ts. No sample: facts are only ever yours.
    if (url.pathname === "/api/facts") { const d = north(); return d ? Response.json(d) : new Response("No kept threads yet", { status: 404 }); }
    if (url.pathname === "/data.js") { const n = north(), d = n ? Object.entries(n).map(([k, v]) => `const ${k} = ${JSON.stringify(v)};`).join("\n") : await Bun.file(sample).text(); return new Response(`const FB_CATS = ${JSON.stringify(CATEGORIES)};\n${d}`, { headers: { "content-type": "text/javascript", "cache-control": "no-cache" } }); }
    if (url.pathname === "/api/goals") return Response.json(goalList());
    if (url.pathname === "/api/projects") {
      const weeks = (url.searchParams.get("weeks") ?? "").split(",").filter((w) => /^\d{4}-W\d{2}$/.test(w));
      return Response.json(projects(weeks));
    }
    return new Response("Not found", { status: 404 });
  },
});
console.log(`impact-trace on ${server.url}`);
