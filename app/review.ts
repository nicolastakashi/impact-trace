// Review: your decisions on Claude's labels, the gold set.
import { labelsOf, reviewThreads } from "../core/threads";
import { direct, viaProject } from "../core/goals";
import { LIVE } from "../core/threads";
import { db, goalLinks, labeled, thread } from "./data";

const FIELDS = {
  title: null,
  summary: null,
  mode: ["clarify", "prevent", "solve", "build", "elevate", "external"],
  pillar: ["big", "exec", "level"],
  without_me: ["wouldnt", "slower", "same"],
  discard: ["yes", "no"],
} as Record<string, string[] | null>;

// Threads you have not decided yet, per week. Review opens on the latest week that has some.
export function pending() {
  const weeks = labeled().reverse();
  const done = (t: any) =>
    labelsOf(db, t).some((r) => r.field === "discard" && r.source === "human");
  return Object.fromEntries(
    weeks.map((w) => [w, reviewThreads(db, w).filter((t) => !done(t)).length]),
  );
}

export function review(week: string) {
  const L = goalLinks();
  const by = (rows: any[], source: string) =>
    Object.fromEntries(rows.filter((r) => r.source === source).map((r) => [r.field, r.value]));
  return {
    week,
    weeks: labeled().reverse(),
    threads: reviewThreads(db, week).map((t) => {
      const l = labelsOf(db, t);
      return {
        ...t,
        claude: by(l, "claude"),
        human: by(l, "human"),
        goals: { direct: direct(L, t), project: viaProject(L, t) },
      };
    }),
    goals: db.query("SELECT id, title, kind FROM goals ORDER BY kind = 'personal', id").all(),
    groups: db.query(`SELECT id, name, kind FROM projects WHERE ${LIVE} ORDER BY name`).all(),
    pending: pending(),
  };
}

// Your decision on one thread. Only known fields and values: this is the gold set.
// discard = yes means the thread is not impact at all (a routine ticket): skip it downstream.
export function decide(body: any) {
  const t = thread(body);
  if (!t) return new Response("Unknown thread for that week", { status: 400 });
  const entries = Object.entries(body.labels ?? {}) as [string, string][];
  for (const [f, v] of entries) {
    const allowed = FIELDS[f];
    if (
      f in FIELDS === false ||
      typeof v !== "string" ||
      !v.trim() ||
      v.length > 1000 ||
      (allowed && !allowed.includes(v))
    )
      return new Response(`Bad value for ${f}`, { status: 400 });
  }
  const put =
    db.query(`INSERT INTO labels (thread_key, week, field, value, source, events, at) VALUES (?, ?, ?, ?, 'human', ?, ?)
    ON CONFLICT DO UPDATE SET value=excluded.value, events=excluded.events, at=excluded.at`);
  const at = new Date().toISOString(),
    ids = JSON.stringify(t.events.map((e) => e.id));
  db.transaction(() => {
    for (const [f, v] of entries) put.run(t.key, body.week, f, v.trim(), ids, at);
  })();
  return Response.json({ ok: true });
}

// You undo Claude's project for one thread: its events go back to no project.
export function unassign(body: any) {
  const t = thread(body);
  if (!t) return new Response("Unknown thread for that week", { status: 400 });
  const put = db.query(`INSERT INTO assignments (event_id, project_id, source, at)
    SELECT event_id, NULL, 'human', ? FROM assignments a JOIN events e ON e.id = a.event_id
    WHERE a.event_id = ? AND a.source = 'claude' AND e.project_id IS NULL
    ON CONFLICT DO UPDATE SET project_id = NULL, at = excluded.at`);
  const at = new Date().toISOString();
  db.transaction(() => {
    for (const e of t.events) put.run(at, e.id);
  })();
  return Response.json({ ok: true });
}
