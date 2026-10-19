// Feedback on how you show up, from your own Slack messages. Claude finds patterns and quotes them;
// this file keeps only quotes it finds in your messages and makes every count itself.
// Usage: bun ingest/feedback.ts emit 2026-W42 | claude -p "/weekly-feedback 2026-W42" ...
//        bun ingest/feedback.ts save 2026-W42 data/raw/2026-W42/feedback.run.json
import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config, open, ROOT } from "./ingest";
import { reviewThreads } from "./review";

type Msg = { week: string; at: string; channel: string; text: string; url: string | null };

function window8(db: Database, week: string) {
  return (db.query("SELECT DISTINCT week FROM events WHERE week <= ? ORDER BY 1 DESC LIMIT 8").all(week) as any[]).map((r) => r.week).reverse() as string[];
}
function messages(db: Database, weeks: string[]): Msg[] {
  return db.query(`SELECT week, occurred_at at, title channel, url, json_extract(payload, '$.text') text FROM events
    WHERE kind = 'slack_message' AND week IN (${weeks.map(() => "?").join()}) ORDER BY occurred_at`).all(...weeks) as any[];
}
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A marker matches as a whole phrase: "wdyt" in a message, not inside another word.
const hits = (markers: string[]) => { const re = new RegExp(markers.map((m) => `(?<![\\w])${esc(m.toLowerCase())}(?![\\w])`).join("|"));
  return (m: Msg) => re.test((m.text ?? "").toLowerCase()); };
const trend = (msgs: Msg[], weeks: string[], markers: string[]) => { const f = hits(markers); return weeks.map((w) => msgs.filter((m) => m.week === w && f(m)).length); };

function previous(db: Database, week: string, weeks: string[], msgs: Msg[]) {
  const row = db.query("SELECT week, output FROM feedback WHERE week < ? ORDER BY week DESC LIMIT 1").get(week) as any;
  if (!row) return null;
  const o = JSON.parse(row.output), t = o.experiment?.markers?.length ? trend(msgs, weeks, o.experiment.markers) : null;
  return { week: row.week, pattern: o.experiment?.pattern, do: o.experiment?.do, markers: o.experiment?.markers ?? [],
    before: t ? t[weeks.indexOf(row.week)] ?? null : null, after: t ? t.at(-1) : null };
}

export function emit(db: Database, week: string) {
  const weeks = window8(db, week), msgs = messages(db, weeks), me = config();
  const worked = new Set<string>();
  for (const w of weeks) for (const t of reviewThreads(db, w)) for (const p of t.projects) worked.add(p.name);
  const led = (db.query("SELECT name FROM projects WHERE lead = ?").all(me.name) as any[]).map((r) => r.name);
  return { week, level: me.level, weeks, projects_worked_on: [...worked], projects_led: led,
    messages: msgs.map((m) => ({ week: m.week, at: m.at, channel: m.channel, text: m.text })), previous: previous(db, week, weeks, msgs) };
}

export function verify(db: Database, week: string, out: any) {
  const weeks = window8(db, week), msgs = messages(db, weeks);
  const find = (q: string) => { const n = norm(q); return n.length >= 8 ? msgs.find((m) => norm(m.text ?? "").includes(n)) : undefined; };
  const cite = (e: any) => { const m = find(e.quote); return m && { ...e, quote: norm(e.quote), week: m.week, at: m.at, channel: m.channel, url: m.url }; };
  const patterns = (out.patterns ?? []).map((p: any) => ({ ...p, markers: p.markers.map((x: string) => x.toLowerCase()), evidence: p.evidence.map(cite).filter(Boolean) }))
    .filter((p: any) => p.evidence.length >= 2)
    .map((p: any) => ({ ...p, trend: trend(msgs, weeks, p.markers) }));
  const sev = (out.strength?.evidence ?? []).map(cite).filter(Boolean);
  const target = patterns.find((p: any) => p.name === out.experiment?.pattern);
  return { week, weeks, messages: weeks.map((w) => msgs.filter((m) => m.week === w).length), patterns,
    strength: sev.length ? { ...out.strength, evidence: sev } : null,
    experiment: out.experiment ? { ...out.experiment, markers: target?.markers ?? [], trend: target?.trend ?? null } : null,
    last_experiment: out.last_experiment ?? null, previous: previous(db, week, weeks, msgs),
    dropped: (out.patterns ?? []).reduce((n: number, p: any) => n + p.evidence.length, 0) - patterns.reduce((n: number, p: any) => n + p.evidence.length, 0) };
}

if (import.meta.main) {
  const [cmd, week, file] = process.argv.slice(2);
  const db = open();
  if (cmd === "emit") console.log(JSON.stringify(emit(db, week)));
  else if (cmd === "save") {
    const run = JSON.parse(readFileSync(file, "utf8")), out = run.structured_output;
    if (run.is_error || !out || out.week !== week) throw new Error(`feedback ${week}: no usable output`);
    const version = createHash("sha256").update(readFileSync(join(ROOT, ".claude/skills/weekly-feedback/SKILL.md"))).digest("hex").slice(0, 8);
    const v = verify(db, week, out);
    db.query(`INSERT INTO feedback VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (week) DO UPDATE SET output = excluded.output, model = excluded.model,
      prompt_version = excluded.prompt_version, cost_usd = excluded.cost_usd, at = excluded.at`)
      .run(week, JSON.stringify(v), Object.keys(run.modelUsage ?? {})[0] ?? null, version, run.total_cost_usd ?? null, new Date().toISOString());
    console.log({ patterns: v.patterns.length, quotes_dropped: v.dropped, experiment: !!v.experiment?.trend });
  } else throw new Error("usage: bun ingest/feedback.ts emit|save <week> [file]");
}
