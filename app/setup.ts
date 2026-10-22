import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { CONFIG } from "../ingest/ingest";

// Setup: who you are, so the collectors search for you. ?guess=1 fills the form from the CLIs you already use.
const sh = (...cmd: string[]) => { try { const p = Bun.spawnSync(cmd, { stderr: "ignore" }); return p.success ? p.stdout.toString().trim() : ""; } catch { return ""; } };
export function setup(guess: boolean) {
  const config = existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, "utf8")) : null;
  if (!guess) return Response.json({ config });
  const [github = "", name = ""] = sh("gh", "api", "user", "--jq", '.login + "\t" + (.name // "")').split("\t");
  // In the container the tools live on the host, where run.sh runs: this side cannot see them.
  const host = !!process.env.COLLECT_ON_HOST;
  return Response.json({ config, checks: { host, gh: host ? null : !!github, claude: host ? null : !!sh("claude", "--version") },
    guess: { github, name: name || sh("git", "config", "user.name"), orgs: sh("gh", "api", "user/orgs", "--jq", ".[].login").split("\n").filter(Boolean) } });
}
const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
export function saveSetup(b: any) {
  const c = { name: String(b?.name ?? "").trim(), github: String(b?.github ?? "").trim(), level: String(b?.level ?? "").trim(),
    orgs: (Array.isArray(b?.orgs) ? b.orgs : []).map((o: any) => String(o).trim()).filter(Boolean) };
  // These go into search queries and shell arguments: keep them to what names look like.
  if (!c.name || c.name.length > 80 || /["\n\\]/.test(c.name)) return new Response("Your name, as people write it in Slack", { status: 400 });
  if (!LOGIN.test(c.github)) return new Response("A GitHub login: letters, digits and dashes", { status: 400 });
  if (!c.orgs.every((o: string) => LOGIN.test(o))) return new Response("GitHub orgs: letters, digits and dashes", { status: 400 });
  if (!c.level || c.level.length > 60) return new Response("Your level, for example Senior Engineer", { status: 400 });
  writeFileSync(CONFIG, JSON.stringify(c, null, 2) + "\n");
  return Response.json({ ok: true });
}
