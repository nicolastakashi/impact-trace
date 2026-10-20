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

// What Claude may flag, and who says it matters. Claude picks from this list; code drops anything else.
export const CATEGORIES: { id: string; kind: "pattern" | "strength"; name: string; look_for: string; not?: string; refs: any[] }[] =
  JSON.parse(readFileSync(join(import.meta.dir, "feedback-categories.json"), "utf8"));
const cat = (id: string, kind: string) => CATEGORIES.find((c) => c.id === id && c.kind === kind);

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
  // You passed on that experiment: there is nothing to measure.
  if ((db.query("SELECT verdict FROM feedback_verdicts WHERE week = ? AND item = 'experiment'").get(row.week) as any)?.verdict === "reject") return null;
  const o = JSON.parse(row.output), t = o.experiment?.markers?.length ? trend(msgs, weeks, o.experiment.markers) : null;
  return { week: row.week, pattern: o.experiment?.pattern, do: o.experiment?.do, markers: o.experiment?.markers ?? [],
    before: t ? t[weeks.indexOf(row.week)] ?? null : null, after: t ? t.at(-1) : null };
}

// ISO week of a date, e.g. 2026-W42. The Thursday of its week decides the year.
export function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + 3 - (d.getDay() + 6) % 7));
  const y = t.getUTCFullYear(), jan4 = new Date(Date.UTC(y, 0, 4));
  const w = 1 + Math.round(((t.getTime() - jan4.getTime()) / 864e5 - 3 + (jan4.getUTCDay() + 6) % 7) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}
// Mondays of the ended weeks that still have no feedback, oldest first. A week gets feedback only
// after it ends, so a Monday the Mac slept through, or a run that failed, shows up here the next day,
// even when a later week went fine. Weeks before your first feedback were collected before feedback
// existed: with none yet, only last week counts. At most 8 weeks back, the feedback window.
export function pendingMondays(today: Date, have: string[]) {
  const first = [...have].sort()[0], out: string[] = [];
  for (let k = 1; k <= 8; k++) {
    const m = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (today.getDay() + 6) % 7 - 7 * k), w = isoWeek(m);
    if (first ? w < first : k > 1) break;
    if (!have.includes(w)) out.unshift(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`);
  }
  return out;
}
export const countMessages = (db: Database, week: string) =>
  (db.query("SELECT count(*) n FROM events WHERE kind = 'slack_message' AND week = ?").get(week) as any).n as number;

export function emit(db: Database, week: string) {
  const weeks = window8(db, week), msgs = messages(db, weeks), me = config();
  const worked = new Set<string>();
  for (const w of weeks) for (const t of reviewThreads(db, w)) for (const p of t.projects) worked.add(p.name);
  const led = (db.query("SELECT name FROM projects WHERE lead = ?").all(me.name) as any[]).map((r) => r.name);
  return { week, level: me.level, weeks, projects_worked_on: [...worked], projects_led: led,
    categories: CATEGORIES.map(({ id, kind, name, look_for, not }) => ({ id, kind, name, look_for, not })),
    messages: msgs.map((m) => ({ week: m.week, at: m.at, channel: m.channel, text: m.text })), previous: previous(db, week, weeks, msgs),
    verdicts: db.query("SELECT week, item, verdict, why FROM feedback_verdicts WHERE week < ? ORDER BY week DESC LIMIT 40").all(week) };
}

// Every counted message you do not see as a quote, so the count and the page always agree.
// A snippet around the first phrase, so long messages still show why they counted.
function others(msgs: Msg[], p: any) {
  const f = hits(p.markers), shown = (m: Msg) => p.evidence.some((e: any) => norm(m.text ?? "").includes(e.quote));
  return msgs.filter((m) => f(m) && !shown(m)).map((m) => {
    const t = norm(m.text ?? ""), low = t.toLowerCase(), i = Math.min(...p.markers.map((x: string) => low.indexOf(x)).filter((n: number) => n >= 0));
    const a = Math.max(0, i - 110), b = Math.min(t.length, i + 170);
    return { week: m.week, at: m.at, channel: m.channel, url: m.url, text: `${a ? "… " : ""}${t.slice(a, b)}${b < t.length ? " …" : ""}` };
  });
}

export function verify(db: Database, week: string, out: any) {
  const weeks = window8(db, week), msgs = messages(db, weeks);
  const find = (q: string) => { const n = norm(q); return n.length >= 8 ? msgs.find((m) => norm(m.text ?? "").includes(n)) : undefined; };
  const cite = (e: any) => { const m = find(e.quote); return m && { ...e, quote: norm(e.quote), week: m.week, at: m.at, channel: m.channel, url: m.url }; };
  // The name comes from the category, so a verdict on it means the same thing every week.
  const patterns = (out.patterns ?? []).filter((p: any) => cat(p.category, "pattern")).map((p: any) => ({ ...p, name: cat(p.category, "pattern")!.name, markers: p.markers.map((x: string) => x.toLowerCase()), evidence: p.evidence.map(cite).filter(Boolean) }))
    .filter((p: any) => p.evidence.length >= 2)
    .map((p: any) => ({ ...p, trend: trend(msgs, weeks, p.markers), matches: others(msgs, p) }));
  const sc = cat(out.strength?.category, "strength"), sev = sc ? (out.strength.evidence ?? []).map(cite).filter(Boolean) : [];
  const target = patterns.find((p: any) => p.category === out.experiment?.pattern);
  return { week, weeks, messages: weeks.map((w) => msgs.filter((m) => m.week === w).length), patterns,
    strength: sev.length ? { ...out.strength, name: sc!.name, evidence: sev } : null,
    experiment: target ? { ...out.experiment, pattern: target.name, markers: target.markers, trend: target.trend } : null,
    last_experiment: out.last_experiment ?? null, previous: previous(db, week, weeks, msgs),
    dropped: (out.patterns ?? []).reduce((n: number, p: any) => n + p.evidence.length, 0) - patterns.reduce((n: number, p: any) => n + p.evidence.length, 0) };
}

if (import.meta.main) {
  const [cmd, week, file] = process.argv.slice(2);
  const db = open();
  if (cmd === "emit") console.log(JSON.stringify(emit(db, week)));
  else if (cmd === "pending") console.log(pendingMondays(new Date(), (db.query("SELECT week FROM feedback").all() as any[]).map((r) => r.week)).join("\n"));
  else if (cmd === "count") console.log(countMessages(db, week));
  else if (cmd === "empty") {
    // No messages from you that week, so nothing to judge: the row still marks the week as closed.
    db.query("INSERT OR REPLACE INTO feedback VALUES (?, ?, NULL, NULL, 0, ?)").run(week,
      JSON.stringify(verify(db, week, { patterns: [], strength: null, experiment: null, last_experiment: null })), new Date().toISOString());
    console.log({ week, empty: true });
  }
  else if (cmd === "save") {
    const run = JSON.parse(readFileSync(file, "utf8")), out = run.structured_output;
    if (run.is_error || !out || out.week !== week) throw new Error(`feedback ${week}: no usable output`);
    // The categories are part of the prompt too.
    const version = createHash("sha256").update(readFileSync(join(ROOT, ".claude/skills/weekly-feedback/SKILL.md"))).update(JSON.stringify(CATEGORIES)).digest("hex").slice(0, 8);
    const v = verify(db, week, out);
    db.query(`INSERT INTO feedback VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (week) DO UPDATE SET output = excluded.output, model = excluded.model,
      prompt_version = excluded.prompt_version, cost_usd = excluded.cost_usd, at = excluded.at`)
      .run(week, JSON.stringify(v), Object.keys(run.modelUsage ?? {})[0] ?? null, version, run.total_cost_usd ?? null, new Date().toISOString());
    console.log({ patterns: v.patterns.length, quotes_dropped: v.dropped, experiment: !!v.experiment?.trend });
  } else throw new Error("usage: bun ingest/feedback.ts emit|save|count|empty <week> [file] | pending");
}
