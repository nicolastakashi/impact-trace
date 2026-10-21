import { expect, test, type Page } from "./helpers";

// Week labels follow today's date, so read them from the same data the page reads.
const north = async (request: any) => (await (await request.get("/api/north")).json());
// Most links go to views /next/ may not have yet: keep the address change, stop the route.
// Registered before the app's own listener, so it runs first. The old app's tiles route
// without a hashchange, so each test clicks one of those last.
const stay = (page: Page) => page.addInitScript(() => addEventListener("hashchange", (e) => e.stopImmediatePropagation()));

test("the header counts what you kept", async ({ page, view, request }) => {
  const { WEEKS } = await north(request);
  await view("home");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${WEEKS[0]}–${WEEKS.at(-1)} · 4 weeks`);
  await expect(page.getByText("9 threads you kept, 4 times people praised your work, 6 that would not have happened without you.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Recap · 10 screens" })).toBeVisible();
});

test("where the work goes: a row per project, each opens its weeks in Trace", async ({ page, view, request }) => {
  const { WEEKS } = await north(request);
  await stay(page);
  await view("home");
  await expect(page.getByText("33% serve a top project")).toBeVisible();
  await expect(page.getByRole("link", { name: "add your goals →" })).toHaveAttribute("href", "#/goals");
  await expect(page.getByText("Threads you kept each week, by the project they serve.")).toBeVisible();
  await expect(page.getByRole("img", { name: "Threads per week by project" })).toBeVisible();
  await expect(page.getByRole("row", { name: "Exports API 3 33% 3" })).toBeVisible();
  await expect(page.getByRole("row", { name: "Everything else 6 67% 3" })).toBeVisible();
  await page.getByRole("button", { name: "Exports API" }).click();
  await expect(page).toHaveURL(new RegExp(`#/trace\\?w=${WEEKS.slice(0, 3).join(",")}$`));
});

test("how you delivered: modes, without you, reviews", async ({ page, view }) => {
  await stay(page);
  await view("home");
  await expect(page.getByRole("img", { name: "6 wouldn't happen, 3 slower, 0 same" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "wouldn't happen · 67%" })).toHaveText(/^6\s*wouldn't/);
  await expect(page.getByRole("img", { name: "Reviews per week: 3, 3, 3, 3" })).toBeVisible();
  await page.getByRole("link", { name: "solve", exact: true }).click();
  await expect(page).toHaveURL(/#\/refs\?k=solve$/);
  await page.getByRole("link", { name: "why →" }).click();
  await expect(page).toHaveURL(/#\/refs\?k=counterfactual$/);
  await page.getByRole("link", { name: "trace →" }).click();
  await expect(page).toHaveURL(/#\/trace(\?|$)/);
});

test("your weeks in numbers, in this browser's time zone", async ({ page, view }) => {
  await view("home");
  await expect(page.getByText("times in America/New_York")).toBeVisible();
  // Fixture messages are at 07, 11 and 12 New York time: one of three is before 09.
  await expect(page.getByRole("img", { name: "Outside work hours per week: 33, 33, 33, 33" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Give vs take per week: 1.5, 1.5, 1.5, 1.5" })).toBeVisible();
  await expect(page.getByText("3 PRs reviewed, 2 opened · average 1.5")).toBeVisible();
});

test("praise: page through the weeks, open the thread", async ({ page, view, request }) => {
  const { WEEKS } = await north(request);
  await view("home");
  await expect(page.getByText("4 in 4 weeks")).toBeVisible();
  await expect(page.getByRole("button", { name: `Blair Ito, ${WEEKS[3]}, shown` })).toBeVisible();
  await expect(page.getByRole("link", { name: "Slack ↗" })).toHaveAttribute("href", /^https:\/\/acme\.slack\.com\//);
  await page.getByRole("button", { name: `Blair Ito, ${WEEKS[1]}` }).click();
  await expect(page.getByRole("button", { name: `Blair Ito, ${WEEKS[1]}, shown` })).toBeVisible();
  await expect(page.getByText("Thanks @Riley Chen, the review on exports step 2 taught me a lot")).toBeVisible();
  await page.getByRole("button", { name: "acme-eng →" }).click();
  await expect(page.getByRole("dialog")).toContainText("acme-eng");
});

test("not praise: removed, and undo brings it back", async ({ page, view, request }) => {
  await view("home");
  await page.getByRole("button", { name: "Not recognition" }).click();
  await expect(page.getByText('Removed: Blair Ito, "the review on exports".')).toBeVisible();
  await expect(page.getByText("3 in 4 weeks")).toBeVisible();
  expect((await north(request)).REC).toHaveLength(3);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("4 in 4 weeks")).toBeVisible();
  await expect(page.getByText(/^Removed:/)).toHaveCount(0);
  expect((await north(request)).REC).toHaveLength(4);
});

test("who comes to you", async ({ page, view }) => {
  await view("home");
  const asks = page.getByRole("list").filter({ hasText: "Sam Rivera" });
  await expect(asks.getByRole("listitem")).toHaveCount(1);
  await expect(asks).toContainText("alert routing");
  await expect(asks.getByRole("img", { name: "per week: 1, 1, 1, 1" })).toBeVisible();
});

test("the experiment opens Feedback", async ({ page, view, request }) => {
  const { FEEDBACK } = await north(request);
  await stay(page);
  await view("home");
  const fb = page.getByRole("button", { name: /^Try this week/ });
  await expect(fb).toContainText("from the pattern “Asking permission on what you own”");
  await expect(fb).toContainText(new RegExp(`2\\s*times in ${FEEDBACK[0].week.slice(5)}`));
  await fb.click();
  await expect(page).toHaveURL(/#\/feedback$/);
});

test("the threads that wait open Review", async ({ page, view }) => {
  await stay(page);
  await view("home");
  const wm = page.getByRole("button", { name: /^To review/ });
  await expect(wm).toContainText("3 threads wait for your answer");
  await expect(wm).toContainText("open review →");
  await wm.click();
  await expect(page).toHaveURL(/#\/review$/);
});
