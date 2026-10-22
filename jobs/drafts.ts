// Objectives Claude drafts from your data. Claude picks what to aim for; code checks each draft
// and sets every start it can measure, so a draft never invents where you are today.
// Usage: bun jobs/drafts.ts emit > in.json   |   bun jobs/drafts.ts save run.json
import type { Database } from "bun:sqlite";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { CONFIG, isoWeek, open, ROOT } from "../core/db";
import { current, known, METRICS, quarterAll } from "../core/metrics";

export const quarterOf = (d: Date) =>
  `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
const lastQuarter = (q: string) => {
  const [y, n] = q.split("-Q").map(Number);
  return n > 1 ? `${y}-Q${n - 1}` : `${y - 1}-Q4`;
};

// What Claude reads: what the app can measure and where you are on it, your projects'
// milestones, the goals you already have, and the facts North shows.
export function draftInput(db: Database, facts: any, now = new Date()) {
  const week = isoWeek(now.toISOString()),
    q = quarterOf(now);
  const cfg = (() => {
    try {
      return JSON.parse(readFileSync(CONFIG, "utf8"));
    } catch {
      return {};
    }
  })();
  return {
    quarter: q,
    quarter_weeks_so_far: quarterAll(db, q, week).length,
    level: cfg.level ?? null,
    // A rate is per week, last 4 weeks. A total is this quarter so far; last_quarter is its whole total.
    metrics: Object.entries(METRICS).map(([key, m]) => ({
      key,
      label: m.label,
      unit: m.unit,
      better: m.better,
      agg: m.agg,
      now: current(db, key, q, week),
      ...(m.agg === "total" ? { last_quarter: current(db, key, lastQuarter(q), week) } : {}),
    })),
    milestones: db
      .query(
        `SELECT 'milestone:' || m.id metric, m.name, m.progress, p.name project FROM milestones m JOIN projects p ON p.id = m.project_id
      WHERE m.progress < 100 ORDER BY p.name, m.name`,
      )
      .all(),
    your_goals: db
      .query("SELECT title FROM goals")
      .all()
      .map((g: any) => g.title),
    facts,
  };
}

const str = (v: any, max: number) =>
  typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null;

// Replaces the drafts you have not used. Returns what was saved and why anything was dropped.
export function saveDrafts(db: Database, run: any, input: any, version: string, now = new Date()) {
  const out = run.structured_output,
    text = JSON.stringify(input),
    dropped: string[] = [];
  const inData = (n: string) =>
    new RegExp(`(?<![\\d.])${n.replace(".", "\\.")}(?![\\d])`).test(text);
  if (run.is_error || !Array.isArray(out?.objectives))
    throw new Error(`Claude failed: ${run.result ?? "no objectives"}`);
  const week = isoWeek(now.toISOString()),
    q = quarterOf(now);
  const drafts = out.objectives.slice(0, 5).flatMap((o: any) => {
    const title = str(o.title, 120),
      why = str(o.why, 400);
    if (
      !title ||
      !why ||
      !["team", "personal"].includes(o.kind) ||
      !["committed", "aspirational"].includes(o.type)
    ) {
      dropped.push(`${o.title}: bad fields`);
      return [];
    }
    // Each "based on" must be copied from the input; anything else is Claude's own story.
    const based_on = (o.based_on ?? []).filter(
      (b: any) =>
        typeof b === "string" && b.length >= 4 && text.includes(JSON.stringify(b).slice(1, -1)),
    );
    if (!based_on.length) {
      dropped.push(`${title}: nothing it is based on is in your data`);
      return [];
    }
    // A number in "why" is copied from your data, or the draft goes. ponytail: matches digits
    // anywhere in the input, so a wrong number that exists elsewhere slips through.
    const made = (why.match(/\d+(?:\.\d+)?/g) ?? []).filter((n) => !inData(n));
    if (made.length) {
      dropped.push(`${title}: numbers not in your data: ${made.join(", ")}`);
      return [];
    }
    const krs = (o.key_results ?? []).slice(0, 5).flatMap((k: any) => {
      const t = str(k.text, 200),
        metric = k.metric || null;
      if (!t || !Number.isFinite(k.target) || (metric && !known(db, metric))) {
        dropped.push(`${title} / ${k.text}: bad key result`);
        return [];
      }
      const madeKr = (t.match(/\d+(?:\.\d+)?/g) ?? []).filter(
        (n) => n !== String(k.target) && !inData(n),
      );
      if (madeKr.length) {
        dropped.push(`${title} / ${t}: numbers not in your data: ${madeKr.join(", ")}`);
        return [];
      }
      // A start the app can measure is code's. Any other start must be copied from your data:
      // Claude averaged weeks itself once (2.75), so a number it worked out stays empty for you.
      // A quarter total starts at 0.
      const start = metric
        ? METRICS[metric]?.agg === "total"
          ? 0
          : current(db, metric, q, week)
        : Number.isFinite(k.start) && inData(String(k.start))
          ? k.start
          : null;
      return [{ text: t, metric, start, target: k.target }];
    });
    if (!krs.length) {
      dropped.push(`${title}: no key result left`);
      return [];
    }
    return [{ title, kind: o.kind, type: o.type, why, based_on, krs }];
  });
  const at = now.toISOString();
  db.transaction(() => {
    db.query("DELETE FROM goal_drafts").run();
    const put = db.query(
      "INSERT INTO goal_drafts (title, kind, type, quarter, why, based_on, krs, model, prompt_version, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const d of drafts)
      put.run(
        d.title,
        d.kind,
        d.type,
        q,
        d.why,
        JSON.stringify(d.based_on),
        JSON.stringify(d.krs),
        "sonnet",
        version,
        at,
      );
  })();
  return { saved: drafts.length, dropped, cost: run.total_cost_usd ?? null };
}

if (import.meta.main) {
  const [cmd, file, inFile] = process.argv.slice(2),
    db = open();
  if (cmd === "emit") {
    const r = await fetch("http://127.0.0.1:4317/api/facts").catch(() => null);
    if (!r?.ok)
      throw new Error(r ? await r.text() : "The app is not running: docker compose up -d");
    const { facts } = await import("./facts");
    console.log(
      JSON.stringify(
        draftInput(db, facts(await r.json(), Intl.DateTimeFormat().resolvedOptions().timeZone)),
      ),
    );
  } else if (cmd === "save") {
    const version = createHash("sha256")
      .update(readFileSync(join(ROOT, ".claude/skills/draft-goals/SKILL.md")))
      .digest("hex")
      .slice(0, 8);
    console.log(
      saveDrafts(
        db,
        JSON.parse(readFileSync(file, "utf8")),
        JSON.parse(readFileSync(inFile, "utf8")),
        version,
      ),
    );
  } else throw new Error("usage: bun jobs/drafts.ts emit | save <run.json> <in.json>");
}
