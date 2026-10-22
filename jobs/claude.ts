// What every step that saves a `claude -p` run shares: reading the run and naming its prompt.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../core/db";

export const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));

// The skill is the prompt, so its hash says which prompt wrote a row. Extra text is part of it too.
export function promptVersion(skill: string, ...extra: string[]) {
  const hash = createHash("sha256").update(
    readFileSync(join(ROOT, ".claude/skills", skill, "SKILL.md")),
  );
  for (const text of extra) hash.update(text);
  return hash.digest("hex").slice(0, 8);
}

export const modelOf = (run: any): string | null => Object.keys(run.modelUsage ?? {})[0] ?? null;

// The run's output, or an error when Claude failed or answered for another week.
export function weekOutput(run: any, week: string, step: string) {
  const out = run.structured_output;
  if (run.is_error || !out || out.week !== week)
    throw new Error(`${step} ${week}: no usable output`);
  return out;
}
