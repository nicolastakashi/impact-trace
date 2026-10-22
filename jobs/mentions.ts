// Claude sorts the Slack mentions of you: praise, a request, information, or a bot.
// Usage: bun jobs/mentions.ts emit 2026-W42 | claude -p "/classify-mentions 2026-W42" ...
//        bun jobs/mentions.ts save 2026-W42 data/raw/2026-W42/mentions.run.json
import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { open, plain, ROOT } from "../core/db";

// Whitespace and case aside, so a quote that drops a line break still matches.
const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();

export function mentions(db: Database, week: string) {
  const rows = db
    .query(
      "SELECT id, author, title, payload FROM events WHERE kind = 'slack_mention' AND week = ? ORDER BY occurred_at",
    )
    .all(week) as any[];
  // Your last corrections, so Claude learns where you draw the line.
  const corrections = (
    db
      .query(
        `SELECT e.payload, k.kind claude, k.human_kind you FROM mention_kinds k JOIN events e ON e.id = k.event_id
    WHERE k.human_kind IS NOT NULL ORDER BY k.at DESC LIMIT 20`,
      )
      .all() as any[]
  ).map((r) => ({
    text: plain(JSON.parse(r.payload).text ?? "").slice(0, 300),
    claude: r.claude,
    you: r.you,
  }));
  return {
    week,
    corrections,
    mentions: rows.map((r) => ({
      id: r.id,
      author: r.author ?? "",
      channel: r.title ?? "",
      text: plain(JSON.parse(r.payload).text ?? ""),
    })),
  };
}

export function saveMentions(db: Database, week: string, run: any, promptVersion: string) {
  const out = run.structured_output;
  if (run.is_error || !out || out.week !== week)
    throw new Error(`mentions ${week}: no usable output`);
  const text = new Map(mentions(db, week).mentions.map((m) => [m.id, m.text]));
  const model = Object.keys(run.modelUsage ?? {})[0] ?? null,
    at = new Date().toISOString();
  const put =
    db.query(`INSERT INTO mention_kinds (event_id, kind, about, quote, model, prompt_version, at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT DO UPDATE SET kind=excluded.kind, about=excluded.about, quote=excluded.quote, model=excluded.model, prompt_version=excluded.prompt_version, at=excluded.at`);
  let saved = 0,
    unknown = 0,
    unquoted = 0;
  db.transaction(() => {
    for (const m of out.mentions) {
      if (!text.has(m.id)) {
        unknown++;
        continue;
      }
      // Praise is evidence: without its exact words in the message, it is not shown as praise.
      const quoted =
        m.kind === "praise" && m.quote && norm(text.get(m.id)!).includes(norm(m.quote));
      if (m.kind === "praise" && !quoted) unquoted++;
      put.run(
        m.id,
        m.kind === "praise" && !quoted ? "info" : m.kind,
        m.about ?? null,
        quoted ? m.quote : null,
        model,
        promptVersion,
        at,
      );
      saved++;
    }
  })();
  return { mentions: text.size, saved, unknown, unquoted, missing: text.size - saved };
}

// You set the kind of one mention; null gives it back to Claude.
export function correct(db: Database, id: string, kind: string | null) {
  if (kind !== null && !KINDS.includes(kind)) return false;
  return (
    db.query("UPDATE mention_kinds SET human_kind = ? WHERE event_id = ?").run(kind, id).changes ===
    1
  );
}
const KINDS = ["praise", "ask", "info", "automated"];

if (import.meta.main) {
  const [cmd, week, file] = process.argv.slice(2);
  const db = open();
  if (cmd === "emit") console.log(JSON.stringify(mentions(db, week)));
  else if (cmd === "save") {
    const version = createHash("sha256")
      .update(readFileSync(join(ROOT, ".claude/skills/classify-mentions/SKILL.md")))
      .digest("hex")
      .slice(0, 8);
    console.log(saveMentions(db, week, JSON.parse(readFileSync(file, "utf8")), version));
  } else throw new Error("usage: bun jobs/mentions.ts emit|save <week> [file]");
}
