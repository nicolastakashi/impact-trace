// The database, your config, and dates: what the app and every job share.
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const ROOT = join(import.meta.dir, "..");
// Your data. IMPACT_DATA points a second copy (QA, screenshots) at its own folder.
export const DATA = process.env.IMPACT_DATA ?? join(ROOT, "data");
export const CONFIG = join(DATA, "config.json");

// Who you are, from the setup page. Git-ignored, like the rest of data/.
export type Config = { name: string; github: string; orgs: string[]; level: string };
export function config(): Config {
  if (!existsSync(CONFIG))
    throw new Error(
      "No data/config.json yet: run bun app/server.ts and open http://127.0.0.1:4317/#/setup",
    );
  return JSON.parse(readFileSync(CONFIG, "utf8"));
}
export function open(path = join(DATA, "impact.db")) {
  // A fresh clone has no data/ yet.
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

export function migrate(db: Database) {
  const dir = join(ROOT, "db/migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const { user_version } = db.query("PRAGMA user_version").get() as { user_version: number };
  files.slice(user_version).forEach((f, i) =>
    db.transaction(() => {
      db.exec(readFileSync(join(dir, f), "utf8"));
      db.exec(`PRAGMA user_version = ${user_version + i + 1}`);
    })(),
  );
}

// "?, ?, ?" for an SQL IN list of these values.
export const placeholders = (values: unknown[]) => values.map(() => "?").join(",");

// Slack markup to what a person reads: <@U1|Ana> → @Ana, <url|label> → label, bare links dropped.
export const plain = (t: string) =>
  t
    .replace(/<@[A-Z0-9]+\|([^>]+)>/g, "@$1")
    .replace(/<@[A-Z0-9]+>/g, "@someone")
    .replace(/<#[A-Z0-9]+\|([^>]*)>/g, "#$1")
    .replace(/<(?:https?|mailto):[^|>]+\|([^>]+)>/g, "$1")
    .replace(/<(?:https?|mailto):[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Midnight UTC of a day in an ISO week: 0 is Monday.
export function dayOf(week: string, i: number) {
  const [y, w] = week.split("-W").map(Number),
    jan4 = Date.UTC(y, 0, 4);
  return jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * 864e5 + ((w - 1) * 7 + i) * 864e5;
}

// ponytail: week of the UTC date; a Sunday-night Berlin timestamp lands in the next week.
export function isoWeek(iso: string) {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)); // Thursday of that week
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  const w = 1 + Math.floor((d.getTime() - jan1) / 864e5 / 7);
  return `${d.getUTCFullYear()}-W${String(w).padStart(2, "0")}`;
}

// The open state Linear returns is today's, so it only describes the current week.
export function isCurrentWeek(week: string, today = new Date()) {
  return isoWeek(today.toISOString()) <= week;
}
