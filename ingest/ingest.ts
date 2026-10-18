// Ingest one week of collector output from data/raw/<week>/ into SQLite.
// Usage: bun ingest/ingest.ts 2026-W42
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
type Status = "ok" | "count_mismatch" | "error";

export function open(path = join(ROOT, "data/impact.db")) {
  const db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

export function migrate(db: Database) {
  const dir = join(ROOT, "db/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const { user_version } = db.query("PRAGMA user_version").get() as { user_version: number };
  files.slice(user_version).forEach((f, i) =>
    db.transaction(() => {
      db.exec(readFileSync(join(dir, f), "utf8"));
      db.exec(`PRAGMA user_version = ${user_version + i + 1}`);
    })(),
  );
}

// ponytail: week of the UTC date; a Sunday-night Berlin timestamp lands in the next week.
export function isoWeek(iso: string) {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)); // Thursday of that week
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  const w = 1 + Math.floor((d.getTime() - jan1) / 864e5 / 7);
  return `${d.getUTCFullYear()}-W${String(w).padStart(2, "0")}`;
}

const prRef = (url: string) => {
  const m = url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  return m ? `github:${m[1]}#${m[2]}` : url;
};

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function ingestWeek(db: Database, dir: string, week: string) {
  const result: Record<string, Status> = {};
  const now = new Date().toISOString();
  const event = db.query(`INSERT INTO events (id, source, kind, week, occurred_at, title, url, author, project_id, milestone_id, payload, run_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, week=excluded.week, occurred_at=excluded.occurred_at, title=excluded.title,
      url=excluded.url, author=excluded.author, project_id=excluded.project_id, milestone_id=excluded.milestone_id,
      payload=excluded.payload, run_id=excluded.run_id`);
  const link = db.query("INSERT OR IGNORE INTO links (from_id, to_ref, rel) VALUES (?, ?, ?)");

  for (const source of ["linear", "github"]) {
    const file = join(dir, `${source}.run.json`);
    if (!existsSync(file)) continue;
    const run = JSON.parse(readFileSync(file, "utf8"));
    const runId = `${week}:${source}:${run.session_id ?? "unknown"}`;
    const out = run.structured_output;
    const expFile = join(dir, `${source}.expected`);
    const expected = existsSync(expFile) ? Number(readFileSync(expFile, "utf8").trim()) : null;

    let got: number | null = null;
    let status: Status = "error";
    if (!run.is_error && out) {
      // Trust boundary: the shape was enforced by --json-schema, so check only what it cannot.
      check(out.week === week, `${source}: collected ${out.week}, expected ${week}`);
      got = source === "linear" ? out.issues.filter((i: any) => i.status_type === "completed").length : out.prs_merged.length;
      status = expected == null || expected === got ? "ok" : "count_mismatch";
    }
    result[source] = status;

    db.transaction(() => {
      db.query(`INSERT INTO runs (id, week, source, cost_usd, num_turns, expected, got, status, ingested_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET expected=excluded.expected, got=excluded.got, status=excluded.status, ingested_at=excluded.ingested_at`)
        .run(runId, week, source, run.total_cost_usd ?? null, run.num_turns ?? null, expected, got, status, now);
      if (status === "error") return;
      if (source === "linear") ingestLinear(db, out, week, runId, now, event, link);
      else ingestGithub(out, week, runId, event, link);
    })();
  }
  return result;
}

function ingestLinear(db: Database, out: any, week: string, runId: string, now: string, event: any, link: any) {
  const projectId = new Map<string, string>();
  const milestoneId = new Map<string, string>();
  for (const p of out.projects) {
    db.query(`INSERT INTO projects (id, name, url, lead, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, url=excluded.url, lead=excluded.lead, status=excluded.status, updated_at=excluded.updated_at`)
      .run(p.id, p.name, p.url, p.lead, p.status, now);
    projectId.set(p.name, p.id);
    for (const m of p.milestones) {
      db.query(`INSERT INTO milestones (id, project_id, name, progress, target_date, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, progress=excluded.progress, target_date=excluded.target_date, updated_at=excluded.updated_at`)
        .run(m.id, p.id, m.name, m.progress, m.target_date, now);
      milestoneId.set(`${p.id}/${m.name}`, m.id);
    }
  }
  for (const i of out.issues) {
    const done = i.status_type === "completed";
    check(!done || i.completed_at, `linear: ${i.id} is completed without completed_at`);
    const pid = i.project_name ? projectId.get(i.project_name) ?? null : null;
    if (i.project_name && !pid) console.warn(`linear: ${i.id} names project "${i.project_name}", which was not collected`);
    const mid = pid && i.milestone_name ? milestoneId.get(`${pid}/${i.milestone_name}`) ?? null : null;
    const id = `linear:${i.id}`;
    event.run(id, "linear", done ? "issue_completed" : "issue_open", done ? isoWeek(i.completed_at) : week,
      i.completed_at, i.title, i.url, null, pid, mid, JSON.stringify(i), runId);
    for (const u of i.attachment_urls) link.run(id, prRef(u), "attachment");
  }
}

function ingestGithub(out: any, week: string, runId: string, event: any, link: any) {
  for (const [kind, prs] of [["pr_merged", out.prs_merged], ["pr_open", out.prs_open]] as const) {
    for (const p of prs) {
      const id = `github:${p.repo}#${p.number}`;
      event.run(id, "github", kind, kind === "pr_merged" ? isoWeek(p.at) : week, p.at, p.title, p.url, "nicolastakashi", null, null, JSON.stringify(p), runId);
      for (const r of p.linear_refs) link.run(id, `linear:${r}`, "mentions");
    }
  }
  event.run(`github:reviews_given:${week}`, "github", "reviews_given", week, null, null, null, "nicolastakashi", null, null,
    JSON.stringify({ count: out.reviews_given }), runId);
  for (const c of out.review_comments_received) {
    const id = `github:${c.url}`;
    event.run(id, "github", "review_comment", week, null, null, c.url, c.author, null, null, JSON.stringify(c), runId);
    link.run(id, `github:${c.repo}#${c.number}`, "on");
  }
}

if (import.meta.main) {
  const week = process.argv[2];
  check(/^\d{4}-W\d{2}$/.test(week ?? ""), "usage: bun ingest/ingest.ts 2026-W42");
  const res = ingestWeek(open(), join(ROOT, "data/raw", week), week);
  for (const [s, st] of Object.entries(res)) console.log(`${st === "ok" ? "✓" : "✗"} ${s} ${week}: ${st}`);
  if (Object.values(res).some((s) => s !== "ok")) process.exit(2);
}
