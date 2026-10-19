// Threads worth a label, and Claude's suggested labels for them.
// Usage: bun ingest/review.ts emit 2026-W42 | claude -p "/suggest-labels 2026-W42" ...
//        bun ingest/review.ts save 2026-W42 data/raw/2026-W42/labels.run.json
import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { open, ROOT, threads } from "./ingest";

// Alone, these say something; a lone Slack message or meeting rarely does.
const SOLO = new Set(["slack_mention", "doc_created", "pr_merged"]);

export function reviewThreads(db: Database, week: string) {
  const get = db.query("SELECT id, kind, title, url, author, (SELECT name FROM projects WHERE id = project_id) project, payload FROM events WHERE id = ?");
  return threads(db, [week]).flatMap((ids) => {
    const events = ids.map((id) => get.get(id) as any);
    if (ids.length === 1 && !SOLO.has(events[0].kind)) return [];
    return [{
      key: `${week}:${[...ids].sort()[0]}`,
      projects: [...new Set(events.map((e) => e.project).filter(Boolean))],
      events: events.map(({ payload, project, ...e }) => ({ ...e, text: JSON.parse(payload).text?.slice(0, 400) })),
    }];
  });
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
  let unknown = 0;
  db.transaction(() => {
    for (const l of out.labels) {
      // A key Claude made up or changed would label nothing.
      if (!byKey.has(l.key)) { unknown++; continue; }
      // without_me is yours alone: the events rarely show the counterfactual.
      for (const f of ["title", "summary", "mode", "pillar", "evidence"])
        put.run(l.key, week, f, f === "evidence" ? JSON.stringify(l[f]) : l[f], model, promptVersion, JSON.stringify(byKey.get(l.key)), at);
    }
  })();
  return { saved: out.labels.length - unknown, unknown, missing: byKey.size - (out.labels.length - unknown) };
}

if (import.meta.main) {
  const [cmd, week, file] = process.argv.slice(2);
  const db = open();
  if (cmd === "emit") console.log(JSON.stringify(reviewThreads(db, week)));
  else if (cmd === "save") {
    const skill = readFileSync(join(ROOT, ".claude/skills/suggest-labels/SKILL.md"));
    const version = createHash("sha256").update(skill).digest("hex").slice(0, 8);
    console.log(saveSuggestions(db, week, JSON.parse(readFileSync(file, "utf8")), version));
  } else throw new Error("usage: bun ingest/review.ts emit|save <week> [file]");
}
