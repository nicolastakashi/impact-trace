import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { CONFIG } from "../core/db";
import { badRequest } from "./data";

// Setup: who you are, so the collectors search for you. ?guess=1 fills the form from the CLIs you already use.
// A command's output, or "" when it fails or is not installed.
const run = (...command: string[]) => {
  try {
    const result = Bun.spawnSync(command, { stderr: "ignore" });
    return result.success ? result.stdout.toString().trim() : "";
  } catch {
    return "";
  }
};
export function setup(guess: boolean) {
  const config = existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, "utf8")) : null;
  if (!guess) return Response.json({ config });
  const [github = "", name = ""] = run(
    "gh",
    "api",
    "user",
    "--jq",
    '.login + "\t" + (.name // "")',
  ).split("\t");
  // In the container the tools live on the host, where run.sh runs: this side cannot see them.
  const host = !!process.env.COLLECT_ON_HOST;
  return Response.json({
    config,
    checks: {
      host,
      github: host ? null : !!github,
      claude: host ? null : !!run("claude", "--version"),
    },
    guess: {
      github,
      name: name || run("git", "config", "user.name"),
      orgs: run("gh", "api", "user/orgs", "--jq", ".[].login").split("\n").filter(Boolean),
    },
  });
}
const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
export function saveSetup(body: any) {
  const config = {
    name: String(body?.name ?? "").trim(),
    github: String(body?.github ?? "").trim(),
    level: String(body?.level ?? "").trim(),
    orgs: (Array.isArray(body?.orgs) ? body.orgs : [])
      .map((org: any) => String(org).trim())
      .filter(Boolean),
  };
  // These go into search queries and shell arguments: keep them to what names look like.
  if (!config.name || config.name.length > 80 || /["\n\\]/.test(config.name))
    return badRequest("Your name, as people write it in Slack");
  if (!LOGIN.test(config.github)) return badRequest("A GitHub login: letters, digits and dashes");
  if (!config.orgs.every((org: string) => LOGIN.test(org)))
    return badRequest("GitHub orgs: letters, digits and dashes");
  if (!config.level || config.level.length > 60)
    return badRequest("Your level, for example Senior Engineer");
  writeFileSync(CONFIG, JSON.stringify(config, null, 2) + "\n");
  return Response.json({ ok: true });
}
