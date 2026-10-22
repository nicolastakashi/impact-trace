import { test as base, expect, type Page } from "@playwright/test";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const DATA = join(import.meta.dirname, ".data");
// Every test starts from the fixture. The server reopens the database on each request.
export const test = base.extend<{ view: (route: string) => Promise<void> }>({
  view: async ({ page, baseURL }, use) => {
    mkdirSync(join(DATA, "live"), { recursive: true });
    for (const file of ["impact.db-journal", "impact.db-wal"])
      rmSync(join(DATA, "live", file), { force: true });
    copyFileSync(join(DATA, "fixture.db"), join(DATA, "live", "impact.db"));
    copyFileSync(join(DATA, "fixture-config.json"), join(DATA, "live", "config.json"));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // A failed load shows up as a console error with no URL: record the response instead.
    page.on(
      "console",
      (message) =>
        message.type() === "error" &&
        !message.text().startsWith("Failed to load resource") &&
        errors.push(message.text()),
    );
    // API refusals are behaviour the specs check; a page file that fails to load is a bug.
    page.on("response", (response) => {
      const path = new URL(response.url()).pathname;
      if (response.status() >= 400 && !path.startsWith("/api/"))
        errors.push(`${response.status()} ${path}`);
    });
    await use(async (route) => {
      await page.goto(`${baseURL}#/${route}`);
    });
    expect(errors, "console errors").toEqual([]);
  },
});
export { expect };
export const toast = (page: Page) => page.getByRole("status");
