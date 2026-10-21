import { expect, test, toast } from "./helpers";

test("setup shows who you are and saves a change", async ({ page, view, request }) => {
  await view("setup");
  await expect(page.getByLabel("Full name")).toHaveValue("Riley Chen");
  await page.getByLabel("Level").fill("Staff Engineer");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(toast(page)).toHaveText("Saved");
  expect((await (await request.get("/api/setup")).json()).config.level).toBe("Staff Engineer");
});
