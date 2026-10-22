// Threads worth a label, and Claude's suggested labels for them.
// Usage: bun jobs/review.ts emit 2026-W42 | claude -p "/suggest-labels 2026-W42" ...
//        bun jobs/review.ts save 2026-W42 data/raw/2026-W42/labels.run.json
import type { Database } from "bun:sqlite";
import { config, open } from "../core/db";
import { reviewThreads } from "../core/threads";
import { modelOf, promptVersion, readJson, weekOutput } from "./claude";

// without_me is yours alone: the events rarely show the counterfactual.
const FIELDS = ["title", "summary", "mode", "pillar", "evidence"];

// Your past decisions, as examples of what is routine for you and what is not.
export function examples(db: Database) {
  const rows = db
    .query(
      `SELECT h.value = 'yes' gone, coalesce((SELECT value FROM labels t WHERE t.thread_key = h.thread_key AND t.field = 'title'
      ORDER BY t.source = 'human' DESC LIMIT 1), '') title
    FROM labels h WHERE h.source = 'human' AND h.field = 'discard' ORDER BY h.at DESC`,
    )
    .all() as any[];
  const titles = (kept: boolean) => {
    const decided = rows.filter((row) => row.title && !!row.gone !== kept);
    return [...new Set(decided.map((row) => row.title))].slice(0, 40);
  };
  return { routine: titles(false), kept: titles(true) };
}

export function saveSuggestions(db: Database, week: string, run: any, promptVersion: string) {
  const out = weekOutput(run, week, "labels");
  const eventsByKey = new Map(
    reviewThreads(db, week).map((thread) => [thread.key, thread.events.map((event) => event.id)]),
  );
  const model = modelOf(run);
  const at = new Date().toISOString();
  const put =
    db.query(`INSERT INTO labels (thread_key, week, field, value, source, model, prompt_version, events, at)
    VALUES (?, ?, ?, ?, 'claude', ?, ?, ?, ?)
    ON CONFLICT DO UPDATE SET value=excluded.value, model=excluded.model, prompt_version=excluded.prompt_version, events=excluded.events, at=excluded.at`);
  // Claude only ever suggests discard = yes; keeping a thread is yours.
  const routine =
    db.query(`INSERT INTO labels (thread_key, week, field, value, source, model, prompt_version, events, at)
    VALUES (?, ?, 'discard', 'yes', 'claude', ?, ?, ?, ?) ON CONFLICT DO UPDATE SET model=excluded.model, prompt_version=excluded.prompt_version, events=excluded.events, at=excluded.at`);
  const notRoutine = db.query(
    "DELETE FROM labels WHERE thread_key = ? AND field = 'discard' AND source = 'claude'",
  );
  let unknown = 0;
  db.transaction(() => {
    for (const label of out.labels) {
      // A key Claude made up or changed would label nothing.
      if (!eventsByKey.has(label.key)) {
        unknown++;
        continue;
      }
      const events = JSON.stringify(eventsByKey.get(label.key));
      for (const field of FIELDS) {
        const value = field === "evidence" ? JSON.stringify(label[field]) : label[field];
        put.run(label.key, week, field, value, model, promptVersion, events, at);
      }
      if (label.routine) routine.run(label.key, week, model, promptVersion, events, at);
      else notRoutine.run(label.key);
    }
  })();
  const saved = out.labels.length - unknown;
  return { saved, unknown, missing: eventsByKey.size - saved };
}

if (import.meta.main) {
  const [cmd, week, file] = process.argv.slice(2);
  const db = open();
  if (cmd === "emit")
    console.log(
      JSON.stringify({
        level: config().level,
        examples: examples(db),
        threads: reviewThreads(db, week),
      }),
    );
  else if (cmd === "save") {
    const version = promptVersion("suggest-labels");
    console.log(saveSuggestions(db, week, readJson(file), version));
  } else throw new Error("usage: bun jobs/review.ts emit|save <week> [file]");
}
