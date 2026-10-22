import { expect, test } from "./helpers";

const box = (page: any) => page.getByPlaceholder("Search items, people, views…");

test("the header button opens search; typing filters threads, views and people", async ({ page, view }) => {
  await view("goals");
  await page.getByRole("button", { name: /^Search/ }).click();
  await expect(box(page)).toBeFocused();
  await expect(page.getByRole("option", { name: /Go to North/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Open recap \(Wrapped\)/ })).toBeVisible();
  // At most 12 results.
  await expect(page.getByRole("option")).toHaveCount(12);
  await box(page).fill("part 2");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option", { name: /Retry exports on timeout, part 2/ })).toBeVisible();
  // People count: Blair praised three threads.
  await box(page).fill("blair");
  await expect(page.getByRole("option")).toHaveCount(3);
  await box(page).fill("zzzz");
  await expect(page.getByText("Nothing found. Try a person or a stream name.")).toBeVisible();
});

test("arrows move the selection; Enter goes to the view", async ({ page, view }) => {
  await view("setup");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("option", { name: /Go to North/ })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: /Go to Goals/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("option", { name: /Go to North/ })).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/goals$/);
  await expect(box(page)).toBeHidden();
});

test("a thread result opens its sheet", async ({ page, view }) => {
  await view("setup");
  await page.keyboard.press("ControlOrMeta+k");
  await box(page).fill("part 2");
  await page.getByRole("option", { name: /Retry exports on timeout, part 2/ }).click();
  await expect(box(page)).toBeHidden();
  await expect(page.getByRole("dialog")).toContainText("Retry exports on timeout, part 2");
});

test("Esc closes search", async ({ page, view }) => {
  await view("goals");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(box(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(box(page)).toBeHidden();
});
