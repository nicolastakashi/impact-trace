// Claude sorts the Slack mentions of you: praise, a request, information, or a bot.
// Usage: bun jobs/mentions.ts emit 2026-W42 | claude -p "/classify-mentions 2026-W42" ...
//        bun jobs/mentions.ts save 2026-W42 data/raw/2026-W42/mentions.run.json
import type { Database } from "bun:sqlite";
import { open, plain } from "../core/db";
import { modelOf, promptVersion, readJson, weekOutput } from "./claude";

const KINDS = ["praise", "ask", "info", "automated"];

// Whitespace and case aside, so a quote that drops a line break still matches.
const looseText = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

const messageText = (payload: string) => plain(JSON.parse(payload).text ?? "");

// Your last corrections, so Claude learns where you draw the line.
function corrections(db: Database) {
  const rows = db
    .query(
      `SELECT e.payload, k.kind claude, k.human_kind you FROM mention_kinds k JOIN events e ON e.id = k.event_id
    WHERE k.human_kind IS NOT NULL ORDER BY k.at DESC LIMIT 20`,
    )
    .all() as any[];
  return rows.map((row) => ({
    text: messageText(row.payload).slice(0, 300),
    claude: row.claude,
    you: row.you,
  }));
}

export function mentions(db: Database, week: string) {
  const rows = db
    .query(
      "SELECT id, author, title, payload FROM events WHERE kind = 'slack_mention' AND week = ? ORDER BY occurred_at",
    )
    .all(week) as any[];
  return {
    week,
    corrections: corrections(db),
    mentions: rows.map((row) => ({
      id: row.id,
      author: row.author ?? "",
      channel: row.title ?? "",
      text: messageText(row.payload),
    })),
  };
}

export function saveMentions(db: Database, week: string, run: any, promptVersion: string) {
  const out = weekOutput(run, week, "mentions");
  const textById = new Map(
    mentions(db, week).mentions.map((mention) => [mention.id, mention.text]),
  );
  const model = modelOf(run);
  const at = new Date().toISOString();
  const put =
    db.query(`INSERT INTO mention_kinds (event_id, kind, about, quote, model, prompt_version, at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT DO UPDATE SET kind=excluded.kind, about=excluded.about, quote=excluded.quote, model=excluded.model, prompt_version=excluded.prompt_version, at=excluded.at`);
  let saved = 0;
  let unknown = 0;
  let unquoted = 0;
  db.transaction(() => {
    for (const mention of out.mentions) {
      if (!textById.has(mention.id)) {
        unknown++;
        continue;
      }
      // Praise is evidence: without its exact words in the message, it is not shown as praise.
      const praise = mention.kind === "praise";
      const quoted =
        praise &&
        mention.quote &&
        looseText(textById.get(mention.id)!).includes(looseText(mention.quote));
      if (praise && !quoted) unquoted++;
      put.run(
        mention.id,
        praise && !quoted ? "info" : mention.kind,
        mention.about ?? null,
        quoted ? mention.quote : null,
        model,
        promptVersion,
        at,
      );
      saved++;
    }
  })();
  return { mentions: textById.size, saved, unknown, unquoted, missing: textById.size - saved };
}

// You set the kind of one mention; null gives it back to Claude.
export function correct(db: Database, id: string, kind: string | null) {
  if (kind !== null && !KINDS.includes(kind)) return false;
  const update = db.query("UPDATE mention_kinds SET human_kind = ? WHERE event_id = ?");
  return update.run(kind, id).changes === 1;
}

if (import.meta.main) {
  const [command, week, file] = process.argv.slice(2);
  const db = open();
  if (command === "emit") console.log(JSON.stringify(mentions(db, week)));
  else if (command === "save") {
    const version = promptVersion("classify-mentions");
    console.log(saveMentions(db, week, readJson(file), version));
  } else throw new Error("usage: bun jobs/mentions.ts emit|save <week> [file]");
}
