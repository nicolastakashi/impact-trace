import { expect, test, toast } from "./helpers";

test("setup shows who you are and saves a change", async ({ page, view, request }) => {
  await view("setup");
  await expect(page.getByLabel("Full name")).toHaveValue("Riley Chen");
  await page.getByLabel("Level").fill("Staff Engineer");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(toast(page)).toHaveText("Saved");
  expect((await (await request.get("/api/setup")).json()).config.level).toBe("Staff Engineer");
});

test("a fresh clone starts on Setup; a link to a view still opens that view", async ({
  page,
  view,
}) => {
  // No config yet, as on a fresh clone. Setup's own ?guess=1 call still reaches the server.
  await page.route("**/api/setup", (route) => route.fulfill({ json: { config: null } }));
  await page.goto("/");
  await expect(page).toHaveURL(/#\/setup$/);
  await expect(page.getByRole("heading", { name: /Set up/ })).toBeVisible();
  await view("trace");
  await expect(page).toHaveURL(/#\/trace/);
});
