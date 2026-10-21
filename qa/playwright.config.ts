// QA: the same specs against the old app (/) and, view by view, the new one (/next/).
// Data: a fictional fixture (qa/fixture.ts), restored before each test. Browser: your Chrome.
import { defineConfig } from "@playwright/test";

const PORT = 4390, ROOT = new URL("..", import.meta.url).pathname;
export default defineConfig({
  testDir: ".", workers: 1, fullyParallel: false, reporter: [["list"], ["html", { open: "never", outputFolder: "report" }]],
  use: { channel: "chrome", reducedMotion: "reduce", timezoneId: "America/New_York", trace: "retain-on-failure" },
  webServer: { command: "bun app/server.ts", cwd: ROOT, url: `http://127.0.0.1:${PORT}/api/setup`, reuseExistingServer: false,
    env: { PORT: String(PORT), IMPACT_DATA: `${ROOT}qa/.data/live` } },
  projects: [{ name: "old", use: { baseURL: `http://127.0.0.1:${PORT}/` } }],
});
