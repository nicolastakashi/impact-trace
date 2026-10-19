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

function review(week: string) {
  const rows = db.query("SELECT thread_key, field, value, source FROM labels WHERE week = ?").all(week) as any[];
  const by = (key: string, source: string) => Object.fromEntries(rows.filter((r) => r.thread_key === key && r.source === source).map((r) => [r.field, r.value]));
  return {
    week,
    weeks: (db.query("SELECT DISTINCT week FROM labels ORDER BY 1 DESC").all() as any[]).map((r) => r.week),
    threads: reviewThreads(db, week).map((t) => ({ ...t, claude: by(t.key, "claude"), human: by(t.key, "human") })),
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

const server = Bun.serve({
  port: 4317,
  // Your Dash0 data and a write endpoint: never reachable from the network.
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response(Bun.file(page));
    if (url.pathname === "/review") return new Response(Bun.file(reviewPage));
    if (url.pathname === "/api/review") {
      const week = url.searchParams.get("week") ?? (db.query("SELECT max(week) w FROM labels").get() as any).w;
      return WEEK.test(week ?? "") ? Response.json(review(week)) : Response.json({ week: null, weeks: [], threads: [] });
    }
    // A JSON content type forces a CORS preflight, so other sites cannot post here.
    const json = req.method === "POST" && req.headers.get("content-type") === "application/json";
    if (url.pathname === "/api/labels" && json) return decide(await req.json().catch(() => null));
    if (url.pathname === "/api/unassign" && json) return unassign(await req.json().catch(() => null));
    if (url.pathname === "/data.js") return new Response(Bun.file(existsSync(local) ? local : sample), { headers: { "content-type": "text/javascript" } });
    if (url.pathname === "/api/projects") {
      const weeks = (url.searchParams.get("weeks") ?? "").split(",").filter((w) => /^\d{4}-W\d{2}$/.test(w));
      return Response.json(projects(weeks));
    }
    return new Response("Not found", { status: 404 });
  },
});
console.log(`impact-trace on ${server.url}`);
