// Serve the app and its data. Usage: bun app/server.ts  →  http://localhost:4317
import { existsSync } from "node:fs";
import { join } from "node:path";
import { open } from "../ingest/ingest";

const db = open();
const page = join(import.meta.dir, "index.html");
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

const server = Bun.serve({
  port: 4317,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response(Bun.file(page));
    if (url.pathname === "/data.js") return new Response(Bun.file(existsSync(local) ? local : sample), { headers: { "content-type": "text/javascript" } });
    if (url.pathname === "/api/projects") {
      const weeks = (url.searchParams.get("weeks") ?? "").split(",").filter((w) => /^\d{4}-W\d{2}$/.test(w));
      return Response.json(projects(weeks));
    }
    return new Response("Not found", { status: 404 });
  },
});
console.log(`impact-trace on ${server.url}`);
