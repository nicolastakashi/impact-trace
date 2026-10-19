// Threads worth a label, and Claude's suggested labels for them.
// Usage: bun ingest/review.ts emit 2026-W42 | claude -p "/suggest-labels 2026-W42" ...
//        bun ingest/review.ts save 2026-W42 data/raw/2026-W42/labels.run.json
import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config, open, PROJECT, ROOT, threads } from "./ingest";

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
    return [{
      key: `${week}:${[...ids].sort()[0]}`,
      // by: who placed it. A thread placed by Claude can be undone in review.
      // The firmest source wins: Claude only shows when it alone placed the thread there.
      projects: [...new Map(events.filter((e) => e.pid).sort((a, b) => FIRM.indexOf(b.by) - FIRM.indexOf(a.by))
        .map((e) => [e.pid, { id: e.pid, name: (name.get(e.pid) as any)?.name, by: e.by }])).values()],
      events: events.map(({ payload, pid, by, ...e }) => ({ ...e, text: JSON.parse(payload).text?.slice(0, 400) })),
    }];
  });
}

// A thread's key is its first event, so a regroup or a merge can change it. Labels follow the
// thread: a field missing under the new key comes from an old key whose first event is in it.
export function labelsOf(db: Database, t: { key: string; events: { id: string }[] }) {
  const week = t.key.slice(0, 8);
  const keys = [t.key, ...t.events.map((e) => `${week}:${e.id}`).filter((k) => k !== t.key)];
  const rows = db.query(`SELECT thread_key, field, value, source FROM labels WHERE thread_key IN (${keys.map(() => "?").join()})`).all(...keys) as any[];
  const seen = new Set<string>();
  return keys.flatMap((k) => rows.filter((r) => r.thread_key === k)).filter((r) => !seen.has(r.field + r.source) && seen.add(r.field + r.source));
}

// Your past decisions, as examples of what is routine for you and what is not.
export function examples(db: Database) {
  const rows = db.query(`SELECT h.value = 'yes' gone, coalesce((SELECT value FROM labels t WHERE t.thread_key = h.thread_key AND t.field = 'title'
      ORDER BY t.source = 'human' DESC LIMIT 1), '') title
    FROM labels h WHERE h.source = 'human' AND h.field = 'discard' ORDER BY h.at DESC`).all() as any[];
  const titles = (keep: boolean) => [...new Set(rows.filter((r) => r.title && !!r.gone !== keep).map((r) => r.title))].slice(0, 40);
  return { routine: titles(false), kept: titles(true) };
}

export function saveSuggestions(db: Database, week: string, run: any, promptVersion: string) {
  const out = run.structured_output;
  if (run.is_error || !out || out.week !== week) throw new Error(`labels ${week}: no usable output`);
  const byKey = new Map(reviewThreads(db, week).map((t) => [t.key, t.events.map((e) => e.id)]));
  const model = Object.keys(run.modelUsage ?? {})[0] ?? null;
  const at = new Date().toISOString();
  const put = db.query(`INSERT INTO labels (thread_key, week, field, value, source, model, prompt_version, events, at)
    VALUES (?, ?, ?, ?, 'claude', ?, ?, ?, ?)
    ON CONFLICT DO UPDATE SET value=excluded.value, model=excluded.model, prompt_version=excluded.prompt_version, events=excluded.events, at=excluded.at`);
  // Claude only ever suggests discard = yes; keeping a thread is yours.
  const routine = db.query(`INSERT INTO labels (thread_key, week, field, value, source, model, prompt_version, events, at)
    VALUES (?, ?, 'discard', 'yes', 'claude', ?, ?, ?, ?) ON CONFLICT DO UPDATE SET model=excluded.model, prompt_version=excluded.prompt_version, events=excluded.events, at=excluded.at`);
  const notRoutine = db.query("DELETE FROM labels WHERE thread_key = ? AND field = 'discard' AND source = 'claude'");
  let unknown = 0;
  db.transaction(() => {
    for (const l of out.labels) {
      // A key Claude made up or changed would label nothing.
      if (!byKey.has(l.key)) { unknown++; continue; }
      // without_me is yours alone: the events rarely show the counterfactual.
      for (const f of ["title", "summary", "mode", "pillar", "evidence"])
        put.run(l.key, week, f, f === "evidence" ? JSON.stringify(l[f]) : l[f], model, promptVersion, JSON.stringify(byKey.get(l.key)), at);
      if (l.routine) routine.run(l.key, week, model, promptVersion, JSON.stringify(byKey.get(l.key)), at);
      else notRoutine.run(l.key);
    }
  })();
  return { saved: out.labels.length - unknown, unknown, missing: byKey.size - (out.labels.length - unknown) };
}

if (import.meta.main) {
  const [cmd, week, file] = process.argv.slice(2);
  const db = open();
  if (cmd === "emit") console.log(JSON.stringify({ level: config().level, examples: examples(db), threads: reviewThreads(db, week) }));
  else if (cmd === "save") {
    const skill = readFileSync(join(ROOT, ".claude/skills/suggest-labels/SKILL.md"));
    const version = createHash("sha256").update(skill).digest("hex").slice(0, 8);
    console.log(saveSuggestions(db, week, JSON.parse(readFileSync(file, "utf8")), version));
  } else throw new Error("usage: bun ingest/review.ts emit|save <week> [file]");
}
