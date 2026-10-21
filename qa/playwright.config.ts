// QA: the same specs against the old app (/) and, view by view, the new one (/next/).
// Data: a fictional fixture (qa/fixture.ts), restored before each test. Browser: your Chrome.
import { defineConfig } from "@playwright/test";
import { existsSync, readdirSync, readFileSync } from "node:fs";

// QA_PORT lets two worktrees run QA at once.
const PORT = Number(process.env.QA_PORT ?? 4390), ROOT = new URL("..", import.meta.url).pathname;
// <view>.spec.ts runs on /next/ once web/<view>.tsx says `export const ready = true`.
const ready = readdirSync(`${ROOT}qa`).filter((f) => f.endsWith(".spec.ts")).filter((f) => {
  const v = `${ROOT}web/${f.split(/[.-]/)[0]}.tsx`;
  return existsSync(v) && /^export const ready = true;/m.test(readFileSync(v, "utf8"));
});
export default defineConfig({
  testDir: ".", workers: 1, fullyParallel: false, reporter: [["list"], ["html", { open: "never", outputFolder: "report" }]],
  use: { channel: "chrome", contextOptions: { reducedMotion: "reduce" }, timezoneId: "America/New_York", trace: "retain-on-failure" },
  webServer: { command: "bun app/server.ts", cwd: ROOT, url: `http://127.0.0.1:${PORT}/api/setup`, reuseExistingServer: false,
    env: { PORT: String(PORT), IMPACT_DATA: `${ROOT}qa/.data/live` } },
  projects: [{ name: "old", use: { baseURL: `http://127.0.0.1:${PORT}/` } },
    { name: "next", use: { baseURL: `http://127.0.0.1:${PORT}/next/` }, testMatch: ready.length ? ready : "none" }],
});
