// Review: your decisions on Claude's labels, the gold set.
import { labelsOf, reviewThreads, setByYou } from "../core/threads";
import { direct, viaProject } from "../core/goals";
import { badRequest, db, goalLinks, labeled, liveProjects, threadOf } from "./data";

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
  const decided = (thread: any) => setByYou(labelsOf(db, thread), "discard");
  return Object.fromEntries(
    weeks.map((week) => [
      week,
      reviewThreads(db, week).filter((thread) => !decided(thread)).length,
    ]),
  );
}

// { field: value } of the labels one source set.
const labelsFrom = (rows: any[], source: string) =>
  Object.fromEntries(
    rows.filter((row) => row.source === source).map((row) => [row.field, row.value]),
  );

export function review(week: string) {
  const links = goalLinks();
  return {
    week,
    weeks: labeled().reverse(),
    threads: reviewThreads(db, week).map((thread) => {
      const labels = labelsOf(db, thread);
      return {
        ...thread,
        claude: labelsFrom(labels, "claude"),
        human: labelsFrom(labels, "human"),
        goals: { direct: direct(links, thread), project: viaProject(links, thread) },
      };
    }),
    goals: db.query("SELECT id, title, kind FROM goals ORDER BY kind = 'personal', id").all(),
    projects: liveProjects(),
    pending: pending(),
  };
}

// Only known fields, and for a field with choices only those.
function badLabel(field: string, value: unknown) {
  if (!(field in FIELDS)) return true;
  if (typeof value !== "string" || !value.trim() || value.length > 1000) return true;
  const allowed = FIELDS[field];
  return !!allowed && !allowed.includes(value);
}

// Your decision on one thread. Only known fields and values: this is the gold set.
// discard = yes means the thread is not impact at all (a routine ticket): skip it downstream.
export function decide(body: any) {
  const thread = threadOf(body);
  if (!thread) return badRequest("Unknown thread for that week");
  const entries = Object.entries(body.labels ?? {}) as [string, string][];
  for (const [field, value] of entries)
    if (badLabel(field, value)) return badRequest(`Bad value for ${field}`);
  const put =
    db.query(`INSERT INTO labels (thread_key, week, field, value, source, events, at) VALUES (?, ?, ?, ?, 'human', ?, ?)
    ON CONFLICT DO UPDATE SET value=excluded.value, events=excluded.events, at=excluded.at`);
  const at = new Date().toISOString();
  const eventIds = JSON.stringify(thread.events.map((event) => event.id));
  db.transaction(() => {
    for (const [field, value] of entries)
      put.run(thread.key, body.week, field, value.trim(), eventIds, at);
  })();
  return Response.json({ ok: true });
}

// You undo Claude's project for one thread: its events go back to no project.
export function unassign(body: any) {
  const thread = threadOf(body);
  if (!thread) return badRequest("Unknown thread for that week");
  const put = db.query(`INSERT INTO assignments (event_id, project_id, source, at)
    SELECT event_id, NULL, 'human', ? FROM assignments a JOIN events e ON e.id = a.event_id
    WHERE a.event_id = ? AND a.source = 'claude' AND e.project_id IS NULL
    ON CONFLICT DO UPDATE SET project_id = NULL, at = excluded.at`);
  const at = new Date().toISOString();
  db.transaction(() => {
    for (const event of thread.events) put.run(at, event.id);
  })();
  return Response.json({ ok: true });
}
