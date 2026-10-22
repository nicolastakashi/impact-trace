// Goals. A thread serves a goal through a project you linked, or because you linked the thread.
import { discardOf, labelsOf, labelValue, LIVE, reviewThreads } from "../core/threads";
import { current, known, METRICS, progress } from "../core/metrics";
import { direct, goalsOf } from "../core/goals";
import { isoWeek } from "../core/db";
import { badRequest, db, goalLinks, isLiveProject, labeled, liveProjects, threadOf } from "./data";

const QUARTER = /^\d{4}-Q[1-4]$/;
const thisWeek = () => isoWeek(new Date().toISOString());
const goalExists = (id: number) => !!db.query("SELECT 1 FROM goals WHERE id = ?").get(id);

// Every goal by id, with its key results, check-ins and projects. weeks fills in later.
function goalsById() {
  const projects = db.query(
    "SELECT p.id, p.name FROM goal_projects gp JOIN projects p ON p.id = gp.project_id WHERE gp.goal_id = ? ORDER BY p.name",
  );
  const keyResults = db.query(
    "SELECT id, text, metric, start, target, current FROM key_results WHERE goal_id = ? ORDER BY pos",
  );
  const checkins = db.query(
    "SELECT week, confidence FROM goal_checkins WHERE goal_id = ? ORDER BY week",
  );
  const goals = db
    .query(
      "SELECT id, title, description, kind, type, quarter FROM goals ORDER BY kind = 'personal', id",
    )
    .all() as any[];
  const now = thisWeek();
  return new Map(
    goals.map((goal) => {
      // An auto key result reads its metric (a rate or the quarter's total); a manual one is what you typed.
      const measured = (keyResults.all(goal.id) as any[]).map((keyResult) => {
        const value = keyResult.metric
          ? current(db, keyResult.metric, goal.quarter, now)
          : keyResult.current;
        return {
          ...keyResult,
          value,
          progress: progress(keyResult.start, keyResult.target, value),
        };
      });
      return [
        goal.id,
        {
          ...goal,
          keyResults: measured,
          checkins: checkins.all(goal.id),
          projects: projects.all(goal.id),
          weeks: {} as Record<string, any[]>,
        },
      ];
    }),
  );
}

export function goalList() {
  const weeks = labeled();
  const links = goalLinks();
  const goals = goalsById();
  const busy = new Map<string, number>(); // threads per project, so you can start a goal from your busiest work
  for (const week of weeks)
    for (const thread of reviewThreads(db, week)) {
      const labels = labelsOf(db, thread);
      const discard = discardOf(labels);
      if (discard === "yes") continue;
      const linkedDirectly = direct(links, thread);
      const project = thread.projects[0];
      if (project) busy.set(project.id, (busy.get(project.id) ?? 0) + 1);
      for (const id of goalsOf(links, thread))
        (goals.get(id)!.weeks[week] ??= []).push({
          key: thread.key,
          title: labelValue(labels, "title"),
          decided: !!discard,
          direct: linkedDirectly.includes(id),
        });
    }
  // What a key result can measure: the app's metrics, and milestones of the projects a goal serves.
  const milestones = db
    .query(
      `SELECT m.id, m.name, m.progress, p.name project FROM milestones m JOIN projects p ON p.id = m.project_id WHERE p.id IN (SELECT id FROM projects WHERE ${LIVE}) ORDER BY p.name, m.name`,
    )
    .all();
  return {
    week: thisWeek(),
    metrics: Object.entries(METRICS).map(([key, metric]) => ({
      key,
      label: metric.label,
      unit: metric.unit,
      better: metric.better,
      aggregation: metric.aggregation,
    })),
    milestones,
    // Claude's drafts wait here until you use or dismiss them. A metric start is code's (jobs/drafts.ts).
    drafts: (
      db
        .query(
          "SELECT id, title, kind, type, quarter, why, based_on, krs FROM goal_drafts ORDER BY id",
        )
        .all() as any[]
    ).map(({ krs: keyResults, ...draft }) => ({
      ...draft,
      based_on: JSON.parse(draft.based_on),
      keyResults: JSON.parse(keyResults),
    })),
    weeks,
    goals: [...goals.values()],
    projects: liveProjects().map((project) => ({ ...project, threads: busy.get(project.id) ?? 0 })),
  };
}

// Empty is no number; anything else that is not a number is NaN, so the check below catches it.
const numberOrNull = (value: any) => {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : NaN;
};

// The key results a request sends, or the message that says what is wrong with them.
function readKeyResults(list: any[]) {
  if (list.length > 5)
    return { error: "Five key results at most: more than that is a task list" } as const;
  const rows = list.map((sent: any) => ({
    text: typeof sent?.text === "string" ? sent.text.trim() : "",
    metric: sent?.metric || null,
    start: numberOrNull(sent?.start),
    target: numberOrNull(sent?.target),
    current: sent?.metric ? null : numberOrNull(sent?.current),
  }));
  for (const keyResult of rows) {
    if (!keyResult.text || keyResult.text.length > 200)
      return { error: "Each key result needs a text, up to 200 characters" } as const;
    if ([keyResult.start, keyResult.target, keyResult.current].some(Number.isNaN))
      return { error: `"${keyResult.text}": start, target and now must be numbers` } as const;
    if (keyResult.metric && !known(db, keyResult.metric))
      return { error: `"${keyResult.text}": unknown measure` } as const;
  }
  return { rows };
}

// Create, edit or delete one goal. Deleting it removes its links, never a project or a thread.
export function saveGoal(body: any) {
  const id = body?.id == null ? null : Number(body.id);
  if (id != null && !goalExists(id)) return badRequest("Unknown goal");
  if (body?.delete) {
    db.query("DELETE FROM goals WHERE id = ?").run(id);
    return Response.json({ ok: true });
  }
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const quarter = body?.quarter ? String(body.quarter) : null;
  if (!title || title.length > 120) return badRequest("A goal needs a title, up to 120 characters");
  const description =
    typeof body?.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;
  if (description && description.length > 600)
    return badRequest("The description fits in 600 characters");
  if (!["team", "personal"].includes(body?.kind)) return badRequest("Pick team or personal");
  if (quarter && !QUARTER.test(quarter)) return badRequest("Quarter looks like 2026-Q4");
  const type = body?.type ?? "aspirational";
  if (!["committed", "aspirational"].includes(type))
    return badRequest("Pick committed or aspirational");
  // Key results arrive whole: the list you see replaces the stored one.
  const keyResults = readKeyResults(Array.isArray(body?.keyResults) ? body.keyResults : []);
  if ("error" in keyResults) return badRequest(keyResults.error);

  const at = new Date().toISOString();
  const putKeyResult = db.query(
    "INSERT INTO key_results (goal_id, pos, text, metric, start, target, current, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  let goalId = id;
  db.transaction(() => {
    if (goalId == null)
      goalId = Number(
        db
          .query(
            "INSERT INTO goals (title, description, kind, type, quarter, at) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .run(title, description, body.kind, type, quarter, at).lastInsertRowid,
      );
    else
      db.query(
        "UPDATE goals SET title = ?, description = ?, kind = ?, type = ?, quarter = ?, krs = NULL, at = ? WHERE id = ?",
      ).run(title, description, body.kind, type, quarter, at, goalId);
    db.query("DELETE FROM key_results WHERE goal_id = ?").run(goalId);
    keyResults.rows.forEach((keyResult, position) =>
      putKeyResult.run(
        goalId,
        position,
        keyResult.text,
        keyResult.metric,
        keyResult.start,
        keyResult.target,
        keyResult.current,
        at,
      ),
    );
    // A draft you used is now this goal.
    if (body.draft_id != null)
      db.query("DELETE FROM goal_drafts WHERE id = ?").run(Number(body.draft_id));
  })();
  return Response.json({ ok: true, id: goalId });
}

// How sure you are this week, 1 to 10. Only this week: a check-in is what you knew then.
export function checkin(body: any) {
  const confidence = Number(body?.confidence);
  const week = thisWeek();
  if (!goalExists(Number(body?.goal_id))) return badRequest("Unknown goal");
  if (!Number.isInteger(confidence) || confidence < 1 || confidence > 10)
    return badRequest("Confidence is 1 to 10");
  db.query(
    `INSERT INTO goal_checkins (goal_id, week, confidence, at) VALUES (?, ?, ?, ?)
    ON CONFLICT DO UPDATE SET confidence = excluded.confidence, at = excluded.at`,
  ).run(Number(body.goal_id), week, confidence, new Date().toISOString());
  return Response.json({ ok: true, week });
}

// Link or unlink a project, or one thread, to a goal.
export function linkGoal(body: any) {
  if (!goalExists(Number(body?.goal_id))) return badRequest("Unknown goal");
  const goalId = Number(body.goal_id);
  const on = body.on === true;
  if (typeof body.project_id === "string") {
    if (!isLiveProject(body.project_id)) return badRequest("Unknown project");
    db.query(
      on
        ? "INSERT OR IGNORE INTO goal_projects VALUES (?, ?)"
        : "DELETE FROM goal_projects WHERE goal_id = ? AND project_id = ?",
    ).run(goalId, body.project_id);
    return Response.json({ ok: true });
  }
  const thread = threadOf(body);
  if (!thread) return badRequest("Unknown thread for that week");
  const link = db.query(
    on
      ? "INSERT OR IGNORE INTO goal_events VALUES (?, ?)"
      : "DELETE FROM goal_events WHERE goal_id = ? AND event_id = ?",
  );
  db.transaction(() => {
    for (const event of thread.events) link.run(goalId, event.id);
  })();
  return Response.json({ ok: true });
}

export function dismissDraft(body: any) {
  return db.query("DELETE FROM goal_drafts WHERE id = ?").run(Number(body?.id)).changes
    ? Response.json({ ok: true })
    : badRequest("Unknown draft");
}
