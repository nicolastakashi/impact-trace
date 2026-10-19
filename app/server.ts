// Serve the app and its data. Usage: bun app/server.ts  →  http://localhost:4317
import { existsSync } from "node:fs";
import { join } from "node:path";
import { open } from "../ingest/ingest";
import { reviewThreads } from "../ingest/review";

const db = open();
const page = join(import.meta.dir, "index.html");
const reviewPage = join(import.meta.dir, "review.html");
// Real data stays in the git-ignored data/ folder; the repo ships only fictional samples.
const local = join(import.meta.dir, "../data/prototype-data.js");
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
const FIELDS = { title: null, summary: null, mode: ["clarify", "prevent", "solve", "build", "elevate", "external"], pillar: ["big", "exec", "level"], without_me: ["wouldnt", "slower", "same", "discard"] } as Record<string, string[] | null>;

// Threads you have not decided yet, per week. Review opens on the latest week that has some.
function pending() {
  const weeks = (db.query("SELECT DISTINCT week FROM labels ORDER BY 1 DESC").all() as any[]).map((r) => r.week);
  const done = db.query("SELECT 1 FROM labels WHERE thread_key = ? AND field = 'without_me' AND source = 'human'");
  return Object.fromEntries(weeks.map((w) => [w, reviewThreads(db, w).filter((t) => !done.get(t.key)).length]));
}

function review(week: string) {
  const rows = db.query("SELECT thread_key, field, value, source FROM labels WHERE week = ?").all(week) as any[];
  const by = (key: string, source: string) => Object.fromEntries(rows.filter((r) => r.thread_key === key && r.source === source).map((r) => [r.field, r.value]));
  return {
    week,
    weeks: (db.query("SELECT DISTINCT week FROM labels ORDER BY 1 DESC").all() as any[]).map((r) => r.week),
    threads: reviewThreads(db, week).map((t) => ({ ...t, claude: by(t.key, "claude"), human: by(t.key, "human") })),
    groups: db.query("SELECT id, name, kind FROM projects ORDER BY name").all(),
    pending: pending(),
  };
}

// Your decision on one thread. Only known fields and values: this is the gold set.
// without_me = discard means the thread is not impact at all (a routine ticket): skip it downstream.
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
    if (!existing) db.query("INSERT INTO projects (id, name, kind, updated_at) VALUES (?, ?, 'topic', ?)").run(id, name, new Date().toISOString());
  }
  const put = db.query(`INSERT INTO assignments (event_id, project_id, source, at) VALUES (?, ?, 'human', ?)
    ON CONFLICT DO UPDATE SET project_id = excluded.project_id, at = excluded.at`);
  const at = new Date().toISOString();
  db.transaction(() => { for (const e of t.events) put.run(e.id, id, at); })();
  return Response.json({ ok: true, group_id: id });
}

// Every group, week by week: the threads in it, with Claude's title or yours.
function groups() {
  const weeks = (db.query("SELECT DISTINCT week FROM labels ORDER BY 1").all() as any[]).map((r) => r.week);
  const label = db.query("SELECT field, value, source FROM labels WHERE thread_key = ? AND field IN ('title', 'summary', 'without_me')");
  const all = db.query("SELECT id, name, kind FROM projects ORDER BY name").all() as any[];
  const by = new Map(all.map((g) => [g.id, { ...g, weeks: {} as Record<string, any[]> }]));
  for (const week of weeks) for (const t of reviewThreads(db, week)) {
    const g = t.projects[0] && by.get(t.projects[0].id);
    if (!g) continue;
    const l = label.all(t.key) as any[];
    const v = (f: string) => (l.find((r) => r.field === f && r.source === "human") ?? l.find((r) => r.field === f && r.source === "claude"))?.value;
    if (v("without_me") === "discard" && l.some((r) => r.field === "without_me" && r.source === "human")) continue;
    (g.weeks[week] ??= []).push({ key: t.key, title: v("title"), summary: v("summary"), events: t.events.length, decided: l.some((r) => r.source === "human" && r.field === "without_me") });
  }
  return { weeks, groups: [...by.values()].filter((g) => Object.keys(g.weeks).length || g.kind === "topic") };
}

const server = Bun.serve({
  port: 4317,
  // Your Dash0 data and a write endpoint: never reachable from the network.
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response(Bun.file(page));
    if (url.pathname === "/review") return new Response(Bun.file(reviewPage));
    if (url.pathname === "/groups") return new Response(Bun.file(join(import.meta.dir, "groups.html")));
    if (url.pathname === "/api/groups") return Response.json(groups());
    if (url.pathname === "/api/pending") return Response.json(pending());
    if (url.pathname === "/api/review") {
      const left = Object.entries(pending()).find(([, n]) => n > 0);
      const week = url.searchParams.get("week") ?? left?.[0] ?? (db.query("SELECT max(week) w FROM labels").get() as any).w;
      return WEEK.test(week ?? "") ? Response.json(review(week)) : Response.json({ week: null, weeks: [], threads: [] });
    }
    // A JSON content type forces a CORS preflight, so other sites cannot post here.
    const json = req.method === "POST" && req.headers.get("content-type") === "application/json";
    if (url.pathname === "/api/labels" && json) return decide(await req.json().catch(() => null));
    if (url.pathname === "/api/unassign" && json) return unassign(await req.json().catch(() => null));
    if (url.pathname === "/api/group" && json) return group(await req.json().catch(() => null));
    if (url.pathname === "/data.js") return new Response(Bun.file(existsSync(local) ? local : sample), { headers: { "content-type": "text/javascript" } });
    if (url.pathname === "/api/projects") {
      const weeks = (url.searchParams.get("weeks") ?? "").split(",").filter((w) => /^\d{4}-W\d{2}$/.test(w));
      return Response.json(projects(weeks));
    }
    return new Response("Not found", { status: 404 });
  },
});
console.log(`impact-trace on ${server.url}`);
