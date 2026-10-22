// Threads: events that belong together, and the labels on them.
import type { Database } from "bun:sqlite";

// An event's group, strongest first: yours; Linear's project; a dedicated #internal-* channel
// as a topic; Claude's placement, unless you undid it (your row with no group).
export const PLACED = `coalesce(
  (SELECT a.project_id FROM assignments a WHERE a.event_id = events.id AND a.source = 'human'),
  events.project_id,
  CASE WHEN events.source = 'slack' AND events.title LIKE '#internal-%' THEN 'topic:' || substr(events.title, 2) END,
  (SELECT a.project_id FROM assignments a WHERE a.event_id = events.id AND a.source = 'claude'
     AND NOT EXISTS (SELECT 1 FROM assignments h WHERE h.event_id = events.id AND h.source = 'human')))`;
// A merged project counts as the one you merged it into; a deleted one counts as no project.
export const PROJECT = `CASE WHEN ${PLACED} IN (SELECT id FROM project_deletions) THEN NULL
  ELSE coalesce((SELECT m.into_id FROM project_merges m WHERE m.from_id = ${PLACED}), ${PLACED}) END`;
// Projects you can still pick: not merged into another, not deleted.
export const LIVE =
  "id NOT IN (SELECT from_id FROM project_merges) AND id NOT IN (SELECT id FROM project_deletions)";

// Work threads. Strong links join events: a PR and its issues, a review and its PR, a doc and
// itself. Then threads with the same main Linear project merge (yours or Claude's placement
// counts for events Linear leaves out); only the main project counts, so one PR that cites
// two projects cannot merge both. Slack messages and meetings are weak: they attach to the one
// thread they cite most, and never join two threads, because one "PTAL #1 #2 #3" would.
// Raw URLs do not join.
const WEAK = new Set(["slack", "calendar"]);
export function threads(db: Database, weeks: string[]) {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  const marks = weeks.map(() => "?").join(",");
  const events = db
    .query(`SELECT id, source, ${PROJECT} p FROM events WHERE week IN (${marks})`)
    .all(...weeks) as any[];
  const links = db
    .query(
      `SELECT from_id, to_ref FROM links JOIN events ON events.id = from_id
    WHERE week IN (${marks}) AND (to_ref LIKE 'github:%' OR to_ref LIKE 'linear:%' OR to_ref LIKE 'gdoc:%')`,
    )
    .all(...weeks) as any[];
  const weak = new Set(events.filter((e) => WEAK.has(e.source)).map((e) => e.id));
  for (const l of links) if (!weak.has(l.from_id)) parent.set(find(l.from_id), find(l.to_ref));

  const groups = new Map<string, string[]>();
  for (const e of events)
    if (!weak.has(e.id)) groups.set(find(e.id), [...(groups.get(find(e.id)) ?? []), e.id]);
  const project = new Map(events.filter((e) => e.p).map((e) => [e.id, e.p as string]));
  // An open issue lives in the latest week that saw it, so a PR can cite an issue that has
  // moved on to a later week. Its project still places the PR: W43 took three W42 PRs out of their thread.
  const inWeek = new Set(events.map((e) => e.id)),
    placed = db.query(`SELECT ${PROJECT} p FROM events WHERE id = ?`);
  const away = new Map<string, string[]>(); // group root → projects of issues cited from other weeks
  for (const l of links) {
    if (weak.has(l.from_id) || !l.to_ref.startsWith("linear:") || inWeek.has(l.to_ref)) continue;
    const p = (placed.get(l.to_ref) as any)?.p;
    if (p) away.set(find(l.from_id), [...(away.get(find(l.from_id)) ?? []), p]);
  }
  const out: string[][] = [];
  const byProject = new Map<string, string[]>();
  const home = new Map<string, string[]>(); // group root → its thread
  for (const [root, ids] of groups) {
    const n = new Map<string, number>();
    for (const p of [
      ...ids.filter((id) => project.has(id)).map((id) => project.get(id)!),
      ...(away.get(root) ?? []),
    ])
      n.set(p, (n.get(p) ?? 0) + 1);
    // Most issues wins; a tie goes to the smaller id so the result does not depend on order.
    const main = [...n].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0];
    let t: string[];
    if (main) {
      if (!byProject.has(main)) byProject.set(main, []);
      t = byProject.get(main)!;
      t.push(...ids);
    } else {
      t = [...ids];
      out.push(t);
    }
    home.set(root, t);
  }

  const cites = new Map<string, string[]>();
  for (const l of links)
    if (weak.has(l.from_id)) cites.set(l.from_id, [...(cites.get(l.from_id) ?? []), l.to_ref]);
  for (const id of weak) {
    const hit = new Map<string[], number>();
    for (const r of cites.get(id) ?? []) {
      const t = home.get(find(r));
      if (t) hit.set(t, (hit.get(t) ?? 0) + 1);
    }
    // Most cited wins; a tie goes to the bigger thread.
    const best = [...hit].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0];
    if (best) best.push(id);
    else if (project.has(id)) {
      if (!byProject.has(project.get(id)!)) byProject.set(project.get(id)!, []);
      byProject.get(project.get(id)!)!.push(id);
    } else out.push([id]);
  }
  return [...out, ...byProject.values()].sort((a, b) => b.length - a.length);
}

// Alone, these say something; a lone Slack message or meeting rarely does.
const SOLO = new Set(["slack_mention", "doc_created", "pr_merged"]);

const FIRM = ["human", "linear", "channel", "claude"];

export function reviewThreads(db: Database, week: string) {
  const get = db.query(`SELECT id, kind, title, url, author, payload, ${PROJECT} pid,
    CASE WHEN EXISTS (SELECT 1 FROM assignments WHERE event_id = events.id AND source = 'human' AND project_id IS NOT NULL) THEN 'human'
      WHEN project_id IS NOT NULL THEN 'linear'
      WHEN source = 'slack' AND title LIKE '#internal-%' THEN 'channel'
      ELSE 'claude' END by FROM events WHERE id = ?`);
  const name = db.query("SELECT name FROM projects WHERE id = ?");
  return threads(db, [week]).flatMap((ids) => {
    const events = ids.map((id) => get.get(id) as any);
    if (ids.length === 1 && !SOLO.has(events[0].kind)) return [];
    return [
      {
        key: `${week}:${[...ids].sort()[0]}`,
        // by: who placed it. A thread placed by Claude can be undone in review.
        // The firmest source wins: Claude only shows when it alone placed the thread there.
        projects: [
          ...new Map(
            events
              .filter((e) => e.pid)
              .sort((a, b) => FIRM.indexOf(b.by) - FIRM.indexOf(a.by))
              .map((e) => [e.pid, { id: e.pid, name: (name.get(e.pid) as any)?.name, by: e.by }]),
          ).values(),
        ],
        events: events.map(({ payload, pid, by, ...e }) => ({
          ...e,
          text: JSON.parse(payload).text?.slice(0, 400),
        })),
      },
    ];
  });
}

// A thread's key is its first event, so a regroup or a merge can change it. Labels follow the
// thread: a field missing under the new key comes from an old key whose first event is in it.
export function labelsOf(db: Database, t: { key: string; events: { id: string }[] }) {
  const week = t.key.slice(0, 8);
  const keys = [t.key, ...t.events.map((e) => `${week}:${e.id}`).filter((k) => k !== t.key)];
  const rows = db
    .query(
      `SELECT thread_key, field, value, source FROM labels WHERE thread_key IN (${keys.map(() => "?").join()})`,
    )
    .all(...keys) as any[];
  const seen = new Set<string>();
  return keys
    .flatMap((k) => rows.filter((r) => r.thread_key === k))
    .filter((r) => !seen.has(r.field + r.source) && seen.add(r.field + r.source));
}
