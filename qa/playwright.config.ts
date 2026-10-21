// QA: every view, in the browser.
// Data: a fictional fixture (qa/fixture.ts), restored before each test. Browser: your Chrome.
import { defineConfig } from "@playwright/test";

// QA_PORT lets two worktrees run QA at once.
const PORT = Number(process.env.QA_PORT ?? 4390), ROOT = new URL("..", import.meta.url).pathname;
export default defineConfig({
  testDir: ".", workers: 1, fullyParallel: false, reporter: [["list"], ["html", { open: "never", outputFolder: "report" }]],
  use: { channel: "chrome", contextOptions: { reducedMotion: "reduce" }, timezoneId: "America/New_York", baseURL: `http://127.0.0.1:${PORT}/`, trace: "retain-on-failure" },
  webServer: { command: "bun app/server.ts", cwd: ROOT, url: `http://127.0.0.1:${PORT}/api/setup`, reuseExistingServer: false,
    env: { PORT: String(PORT), IMPACT_DATA: `${ROOT}qa/.data/live` } },
});
