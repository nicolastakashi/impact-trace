import { expect, test } from "./helpers";

// On the new app the recap opens from search, so open it from there in both.
// Setup has no letter keys of its own, so typing in search changes nothing behind it.
const recap = async (page: any) => {
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Search threads, people, views…").fill("recap");
  // The new app fetches its threads; on Setup they come after the gh checks.
  await expect(page.getByRole("option", { name: /Open recap \(Wrapped\)/ })).toBeVisible();
  await page.keyboard.press("Enter");
};
// Only the recap's text: the view behind it may say the same words.
const see = (page: any, text: string | RegExp, exact?: boolean) =>
  page.getByText(text, { exact }).filter({ visible: true });

test("the recap starts with the period and steps with keys and taps", async ({ page, view }) => {
  await view("setup");
  await recap(page);
  await expect(see(page, "weeks of work, with a trace")).toBeVisible();
  await expect(see(page, /^\d{4}-W\d\d – \d{4}-W\d\d$/)).toBeVisible();
  await expect(see(page, "← → or tap the sides · 1/10")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(see(page, "threads with evidence. 4 times people praised your work.")).toBeVisible();
  await expect(see(page, "9", true)).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(see(page, "· 1/10")).toBeVisible();
  // The first slide stays first.
  await page.getByRole("button", { name: "previous" }).click();
  await expect(see(page, "· 1/10")).toBeVisible();
  await page.keyboard.press(" ");
  await expect(see(page, "· 2/10")).toBeVisible();
  await page.getByRole("button", { name: "next" }).click();
  await expect(see(page, "· 3/10")).toBeVisible();
  await expect(see(page, "3 threads kept")).toBeVisible();
  await expect(see(page, "Retry exports on timeout, part 1")).toBeVisible();
  await page.getByRole("button", { name: "next" }).click();
  await expect(
    see(page, "“Thanks @Riley Chen, the review on exports step 3 taught me a lot”"),
  ).toBeVisible();
  await expect(see(page, "Blair Ito")).toBeVisible();
});

test("the last slides: modes, then the open question", async ({ page, view }) => {
  await view("setup");
  await recap(page);
  for (let slide = 0; slide < 8; slide++) await page.keyboard.press("ArrowRight");
  await expect(see(page, "How you delivered")).toBeVisible();
  await expect(see(page, "elevate", true)).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(see(page, "The open question")).toBeVisible();
  await expect(see(page, /^\d+ of 9 answered\. Only you know the answer\.$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Open review →" })).toBeVisible();
  // The last slide stays last.
  await page.keyboard.press("ArrowRight");
  await expect(see(page, "· 10/10")).toBeVisible();
});

test("Esc and the close button close the recap", async ({ page, view }) => {
  await view("setup");
  await recap(page);
  await expect(see(page, "weeks of work, with a trace")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(see(page, "weeks of work, with a trace")).toBeHidden();
  await recap(page);
  await page.getByRole("button", { name: "close · esc" }).click();
  await expect(see(page, "weeks of work, with a trace")).toBeHidden();
});
