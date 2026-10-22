// Threads: events that belong together, and the labels on them.
import type { Database } from "bun:sqlite";
import { placeholders } from "./db";

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

// The list under a key, created empty the first time.
export function listOf<K, V>(map: Map<K, V[]>, key: K) {
  if (!map.has(key)) map.set(key, []);
  return map.get(key)!;
}

// Groups of ids joined by links (union-find). find gives a group's root id.
function unionFind() {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const next = parent.get(id) ?? id;
    if (next === id) return id;
    const root = find(next);
    parent.set(id, root);
    return root;
  };
  const join = (a: string, b: string) => parent.set(find(a), find(b));
  return { find, join };
}

// Most issues wins; a tie goes to the smaller id so the result does not depend on order.
function mainProject(projectIds: string[]) {
  const counts = new Map<string, number>();
  for (const id of projectIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return ranked[0]?.[0];
}

// Most cited wins; a tie goes to the bigger thread.
function mostCited(threadsCited: string[][]) {
  const hits = new Map<string[], number>();
  for (const thread of threadsCited) hits.set(thread, (hits.get(thread) ?? 0) + 1);
  const ranked = [...hits].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  return ranked[0]?.[0];
}

// Work threads. Strong links join events: a PR and its issues, a review and its PR, a doc and
// itself. Then threads with the same main Linear project merge (yours or Claude's placement
// counts for events Linear leaves out); only the main project counts, so one PR that cites
// two projects cannot merge both. Slack messages and meetings are weak: they attach to the one
// thread they cite most, and never join two threads, because one "PTAL #1 #2 #3" would.
// Raw URLs do not join.
const WEAK = new Set(["slack", "calendar"]);
type Link = { from_id: string; to_ref: string };

export function threads(db: Database, weeks: string[]) {
  const { find, join } = unionFind();
  const events = db
    .query(`SELECT id, source, ${PROJECT} p FROM events WHERE week IN (${placeholders(weeks)})`)
    .all(...weeks) as any[];
  const links = db
    .query(
      `SELECT from_id, to_ref FROM links JOIN events ON events.id = from_id
    WHERE week IN (${placeholders(weeks)}) AND (to_ref LIKE 'github:%' OR to_ref LIKE 'linear:%' OR to_ref LIKE 'gdoc:%')`,
    )
    .all(...weeks) as Link[];
  const weak = new Set(events.filter((e) => WEAK.has(e.source)).map((e) => e.id as string));
  const strongLinks = links.filter((link) => !weak.has(link.from_id));
  for (const link of strongLinks) join(link.from_id, link.to_ref);

  const groups = new Map<string, string[]>(); // group root → its event ids
  for (const e of events) if (!weak.has(e.id)) listOf(groups, find(e.id)).push(e.id);
  const projectOf = new Map(events.filter((e) => e.p).map((e) => [e.id, e.p as string]));
  const away = issueProjectsFromOtherWeeks(db, events, strongLinks, find);

  const loose: string[][] = []; // threads with no project
  const byProject = new Map<string, string[]>();
  const home = new Map<string, string[]>(); // group root → its thread
  for (const [root, ids] of groups) {
    const main = mainProject([
      ...ids.filter((id) => projectOf.has(id)).map((id) => projectOf.get(id)!),
      ...(away.get(root) ?? []),
    ]);
    let thread: string[];
    if (main) {
      thread = listOf(byProject, main);
      thread.push(...ids);
    } else {
      thread = [...ids];
      loose.push(thread);
    }
    home.set(root, thread);
  }

  const cites = new Map<string, string[]>(); // weak event → refs it links to
  for (const link of links)
    if (weak.has(link.from_id)) listOf(cites, link.from_id).push(link.to_ref);
  for (const id of weak) {
    const cited = (cites.get(id) ?? []).map((ref) => home.get(find(ref))).filter((t) => t);
    const best = mostCited(cited as string[][]);
    if (best) best.push(id);
    else if (projectOf.has(id)) listOf(byProject, projectOf.get(id)!).push(id);
    else loose.push([id]);
  }
  return [...loose, ...byProject.values()].sort((a, b) => b.length - a.length);
}

// An open issue lives in the latest week that saw it, so a PR can cite an issue that has
// moved on to a later week. Its project still places the PR: W43 took three W42 PRs out of their thread.
// Returns group root → projects of issues cited from other weeks.
function issueProjectsFromOtherWeeks(
  db: Database,
  events: { id: string }[],
  strongLinks: Link[],
  find: (id: string) => string,
) {
  const inWeek = new Set(events.map((e) => e.id));
  const placed = db.query(`SELECT ${PROJECT} p FROM events WHERE id = ?`);
  const away = new Map<string, string[]>();
  for (const link of strongLinks) {
    if (!link.to_ref.startsWith("linear:") || inWeek.has(link.to_ref)) continue;
    const project = (placed.get(link.to_ref) as any)?.p;
    if (project) listOf(away, find(link.from_id)).push(project);
  }
  return away;
}

// Alone, these say something; a lone Slack message or meeting rarely does.
const SOLO = new Set(["slack_mention", "doc_created", "pr_merged"]);

// Who placed an event in its project, firmest first.
const FIRM = ["human", "linear", "channel", "claude"];

export function reviewThreads(db: Database, week: string) {
  const eventById = db.query(`SELECT id, kind, title, url, author, payload, ${PROJECT} pid,
    CASE WHEN EXISTS (SELECT 1 FROM assignments WHERE event_id = events.id AND source = 'human' AND project_id IS NOT NULL) THEN 'human'
      WHEN project_id IS NOT NULL THEN 'linear'
      WHEN source = 'slack' AND title LIKE '#internal-%' THEN 'channel'
      ELSE 'claude' END by FROM events WHERE id = ?`);
  const projectName = db.query("SELECT name FROM projects WHERE id = ?");
  // by: who placed it. A thread placed by Claude can be undone in review.
  // The firmest source wins: Claude only shows when it alone placed the thread there.
  const projectsOf = (events: any[]) => {
    const firmestFirst = events
      .filter((e) => e.pid)
      .sort((a, b) => FIRM.indexOf(b.by) - FIRM.indexOf(a.by));
    const byId = new Map(
      firmestFirst.map((e) => [
        e.pid,
        { id: e.pid, name: (projectName.get(e.pid) as any)?.name, by: e.by },
      ]),
    );
    return [...byId.values()];
  };
  return threads(db, [week]).flatMap((ids) => {
    const events = ids.map((id) => eventById.get(id) as any);
    if (ids.length === 1 && !SOLO.has(events[0].kind)) return [];
    return [
      {
        key: `${week}:${[...ids].sort()[0]}`,
        projects: projectsOf(events),
        events: events.map(({ payload, pid, by, ...e }) => ({
          ...e,
          text: JSON.parse(payload).text?.slice(0, 400),
        })),
      },
    ];
  });
}

type Label = { thread_key: string; field: string; value: string; source: string };

// A thread's key is its first event, so a regroup or a merge can change it. Labels follow the
// thread: a field missing under the new key comes from an old key whose first event is in it.
export function labelsOf(db: Database, thread: { key: string; events: { id: string }[] }) {
  const week = thread.key.slice(0, 8);
  const oldKeys = thread.events.map((e) => `${week}:${e.id}`).filter((k) => k !== thread.key);
  const keys = [thread.key, ...oldKeys];
  const rows = db
    .query(
      `SELECT thread_key, field, value, source FROM labels WHERE thread_key IN (${placeholders(keys)})`,
    )
    .all(...keys) as Label[];
  // The first key with a field and source wins.
  const seen = new Set<string>();
  const labels: Label[] = [];
  for (const key of keys)
    for (const row of rows) {
      if (row.thread_key !== key || seen.has(row.field + row.source)) continue;
      seen.add(row.field + row.source);
      labels.push(row);
    }
  return labels;
}

const labelFrom = (labels: Label[], field: string, source: string) =>
  labels.find((r) => r.field === field && r.source === source);
// A label's value: yours, else Claude's.
export const labelValue = (labels: Label[], field: string) =>
  (labelFrom(labels, field, "human") ?? labelFrom(labels, field, "claude"))?.value;
// Your keep (no) or discard (yes); undefined while you have not decided.
export const discardOf = (labels: Label[]) => labelFrom(labels, "discard", "human")?.value;
export const setByYou = (labels: Label[], field: string) =>
  labelFrom(labels, field, "human") !== undefined;
