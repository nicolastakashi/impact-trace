import { test as base, expect, type Page } from "@playwright/test";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const DATA = join(import.meta.dirname, ".data");
// Every test starts from the fixture. The server reopens the database on each request.
export const test = base.extend<{ view: (v: string) => Promise<void> }>({
  view: async ({ page, baseURL }, use) => {
    mkdirSync(join(DATA, "live"), { recursive: true });
    for (const f of ["impact.db-journal", "impact.db-wal"]) rmSync(join(DATA, "live", f), { force: true });
    copyFileSync(join(DATA, "fixture.db"), join(DATA, "live", "impact.db"));
    copyFileSync(join(DATA, "fixture-config.json"), join(DATA, "live", "config.json"));
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // A failed load shows up as a console error with no URL: record the response instead.
    page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
    // API refusals are behaviour the specs check; a page file that fails to load is a bug.
    page.on("response", (r) => { const p = new URL(r.url()).pathname; if (r.status() >= 400 && !p.startsWith("/api/")) errors.push(`${r.status()} ${p}`); });
    await use(async (v) => { await page.goto(`${baseURL}#/${v}`); });
    expect(errors, "console errors").toEqual([]);
  },
});
export { expect };
export const toast = (page: Page) => page.getByRole("status");
