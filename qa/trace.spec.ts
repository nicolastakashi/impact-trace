import { expect, test } from "./helpers";

// Fixture: W40–W43, you kept the threads of W40–W42. Each week has one 2-day build span and two instant Slack spans.
const PART_TWO = "Retry exports on timeout, part 2";
const url = (page: any) => decodeURIComponent(new URL(page.url()).hash);

test("opens on this week; the address picks weeks", async ({ page, view }) => {
  await view("trace");
  await expect(
    page.getByText(
      "9 threads you kept, drawn as spans. Most are build (33%). 6 are on your critical path",
    ),
  ).toBeVisible();
  await expect.poll(() => url(page)).toBe("#/trace?w=W43");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(/W43\s*0 spans · 1 trace/);
  await expect(page.getByText("No spans in W43 match the filter.")).toBeVisible();
  await view("trace?w=W41,W42");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(/W41–W42\s*6 spans · 2 traces/);
  await expect(page.getByRole("button", { name: /part \d \dd/ })).toHaveCount(2);
});

test("drag across weeks, shift-click adds one, Enter picks one", async ({ page, view }) => {
  await view("trace?w=W43");
  const weekButton = (week: string) =>
    page.getByRole("button", { name: new RegExp(`^${week} (Sep|Oct) \\d+$`) });
  const startBox = (await weekButton("W40").boundingBox())!,
    endBox = (await weekButton("W42").boundingBox())!;
  await page.mouse.move(startBox.x + 5, startBox.y + startBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(endBox.x + 5, endBox.y + endBox.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => url(page)).toBe("#/trace?w=W40,W41,W42");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(/W40–W42\s*9 spans · 3 traces/);
  // Three weeks: only the newest opens.
  await expect(page.getByRole("button", { name: /part \d \dd/ })).toHaveCount(1);
  await page.getByRole("button", { name: "expand all" }).click();
  await expect(page.getByRole("button", { name: /part \d \dd/ })).toHaveCount(3);
  await weekButton("W43").click({ modifiers: ["Shift"] });
  await expect.poll(() => url(page)).toBe("#/trace?w=W40,W41,W42,W43");
  await weekButton("W41").focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => url(page)).toBe("#/trace?w=W41");
});

test("a trace folds; the filters keep a mode or the critical path", async ({ page, view }) => {
  await view("trace?w=W41,W42");
  const root = page.getByRole("button", { name: /W42 Oct 12 – Oct 18/ });
  await expect(root).toHaveAttribute("aria-expanded", "true");
  await root.click();
  await expect(root).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: /^acme-eng/ })).toHaveCount(2);
  await page.getByRole("button", { name: "expand all" }).click();
  await expect(page.getByRole("button", { name: "collapse all" })).toBeVisible();
  const filters = page.getByRole("group", { name: "Filter spans" });
  await filters.getByRole("button", { name: "build 3" }).click();
  await expect(filters.getByRole("button", { name: "build 3" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(/2 spans/);
  await expect(page.getByRole("button", { name: /^acme-eng/ })).toHaveCount(0);
  await filters.getByRole("button", { name: "build 3" }).click();
  await filters.getByRole("button", { name: "critical path 6" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(/4 spans/);
  await expect(page.getByRole("complementary")).toContainText("critical path4 of 4");
});

test("the summary, then one span and its events; Esc lets go", async ({ page, view }) => {
  await view("trace?w=W41,W42");
  const side = page.getByRole("complementary");
  await expect(side).toContainText("Trace summary");
  await expect(side).toContainText("6spans in W41–W42");
  await page.getByRole("button", { name: /replay/ }).click();
  await side.getByRole("button", { name: `${PART_TWO} · 2d 0h` }).click();
  await expect.poll(() => url(page)).toBe("#/trace?w=W41,W42&s=2026-W41:github:acme/api#220");
  await expect(page.getByRole("button", { name: `${PART_TWO} 2d 0h` })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(side.getByRole("heading", { name: PART_TWO })).toBeVisible();
  await expect(side).toContainText("longer than 67% of your spans");
  await expect(side).toContainText("without_youwouldn't happen");
  await expect(side).toContainText("pillarexecution");
  await expect(side).toContainText("startedTue 06:00, Oct 6");
  await expect(side.getByRole("link", { name: "Exports API ↗" })).toHaveAttribute(
    "href",
    "https://linear.app/acme/project/exports",
  );
  await expect(side).toContainText("Span events · 4");
  await expect(side.getByRole("listitem")).toHaveCount(4);
  await expect(side.getByRole("listitem").first()).toContainText("Tue 06:00issue done");
  await expect(side.getByRole("link", { name: "feat: export step 2.1 ↗" })).toHaveAttribute(
    "href",
    "https://github.com/acme/api/pull/221",
  );
  await expect(side.getByRole("link", { name: "change it in review →" })).toHaveAttribute(
    "href",
    "#/review?week=2026-W41&key=2026-W41%3Agithub%3Aacme%2Fapi%23220",
  );
  await page.keyboard.press("Escape");
  await expect.poll(() => url(page)).toBe("#/trace?w=W41,W42");
  await expect(side).toContainText("Trace summary");
  // The address opens the span, and its close button lets go too.
  await view(`trace?w=W41&s=${encodeURIComponent("2026-W41:github:acme/api#220")}`);
  await expect(side.getByRole("heading", { name: PART_TWO })).toBeVisible();
  await side.getByRole("button", { name: /close/ }).click();
  await expect(side).toContainText("Trace summary");
});

test("the thread sheet: title, chips, evidence; Esc closes it and keeps the span", async ({
  page,
  view,
}) => {
  await view(`trace?w=W41&s=${encodeURIComponent("2026-W41:github:acme/api#220")}`);
  await page.getByRole("complementary").getByRole("button", { name: "open thread" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: PART_TWO })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /close/ })).toBeFocused();
  for (const label of ["build", "wouldn't happen", "execution"])
    await expect(sheet.getByRole("button", { name: label, exact: true })).toBeVisible();
  await expect(sheet.getByText("Exports API", { exact: true }).first()).toBeVisible();
  await expect(sheet).toContainText("Evidence");
  await expect(sheet.getByRole("link", { name: "feat: export step 2.0 ↗" })).toHaveAttribute(
    "href",
    "https://github.com/acme/api/pull/220",
  );
  await expect(sheet.getByRole("link", { name: "change it in review →" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("complementary").getByRole("heading", { name: PART_TWO }),
  ).toBeVisible();
  await expect.poll(() => url(page)).toContain("&s=");
});

test("a recognised thread shows who said it in the sheet", async ({ page, view }) => {
  // A phone: the sheet must not scroll sideways.
  await page.setViewportSize({ width: 400, height: 860 });
  await view("trace?w=W40");
  await page.getByRole("button", { name: "acme-eng instant" }).first().click();
  await page.getByRole("complementary").getByRole("button", { name: "open thread" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("★ Blair Ito");
  expect(
    await sheet.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(0);
  await expect(sheet).toContainText(
    "“Thanks @Riley Chen, the review on exports step 3 taught me a lot”",
  );
  await sheet.getByRole("button", { name: /close/ }).click();
  await expect(sheet).toBeHidden();
});
