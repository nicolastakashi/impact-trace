import { expect, test, toast } from "./helpers";
import type { Page } from "@playwright/test";

// The fixture leaves the latest week undecided: 3 threads, Claude's labels on each.
const review = async (request: any, week = "") =>
  await (await request.get(`/api/review${week ? `?week=${week}` : ""}`)).json();
const human = async (request: any, i: number) => (await review(request)).threads[i].human;
const card = (page: Page) => ({
  title: page.getByRole("textbox", { name: "Thread title" }),
  summary: page.getByRole("textbox", { name: "Summary of what you did" }),
  mode: (m: string) =>
    page.getByRole("group", { name: "Mode" }).getByRole("button", { name: new RegExp(`^${m}`) }),
  pillar: (p: string) =>
    page.getByRole("group", { name: "Pillar" }).getByRole("button", { name: new RegExp(`^${p}`) }),
  queue: page
    .getByRole("list", { name: "Threads of the week" })
    .getByRole("button", { name: /^(?!discard all)/ }),
  done: page.getByText(/^\d+\/\d+$/),
});
// Keys do nothing before the threads load: wait for the card first.
const open = async (page: Page, view: (v: string) => Promise<void>) => {
  await view("review");
  await expect(card(page).title).toBeVisible();
};
// Claude's labels, changed in the response: the fixture has no routine thread and no Claude project.
const patch = (page: Page, f: (d: any) => void) =>
  page.route("**/api/review*", async (r) => {
    const res = await r.fetch(),
      d = await res.json();
    f(d);
    await r.fulfill({ response: res, json: d });
  });

test("opens the week that waits for you, with Claude's labels filled in", async ({
  page,
  view,
  request,
}) => {
  const d = await review(request);
  await open(page, view);
  const c = card(page);
  await expect(c.title).toHaveValue("Retry exports on timeout, part 4");
  await expect(c.summary).toHaveValue("What happened in Retry exports on timeout, part 4.");
  await expect(c.mode("build")).toHaveAttribute("aria-pressed", "true");
  await expect(c.pillar("execution")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "Week" })).toHaveValue(d.week);
  await expect(
    page
      .getByRole("combobox", { name: "Week" })
      .locator("option", { hasText: `${d.week} · 3 left` }),
  ).toHaveCount(1);
  await expect(c.done).toHaveText("0/3");
  await expect(c.queue).toHaveCount(3);
  await expect(page).toHaveURL(
    new RegExp(
      `#/review\\?week=${d.week}&key=${encodeURIComponent(d.threads[0].key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    ),
  );
  await expect(page.getByRole("tab", { name: "Review 3" })).toBeVisible();
});

test("a mode by key, then 1: saved, the next thread opens, the badge counts down", async ({
  page,
  view,
  request,
}) => {
  await open(page, view);
  const c = card(page);
  await page.keyboard.press("s");
  await expect(c.mode("prevent")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("1");
  await expect(toast(page)).toHaveText("Saved");
  await expect(c.done).toHaveText("1/3");
  await expect(c.mode("elevate")).toHaveAttribute("aria-pressed", "true");
  // Pending hides what you decided.
  await expect(c.queue).toHaveCount(2);
  await expect(page.getByRole("tab", { name: "Review 2" })).toBeVisible();
  expect(await human(request, 0)).toMatchObject({
    mode: "prevent",
    pillar: "exec",
    without_me: "wouldnt",
    discard: "no",
    title: "Retry exports on timeout, part 4",
  });
});

test("your title and summary are saved with your answer", async ({ page, view, request }) => {
  await open(page, view);
  const c = card(page);
  await c.title.fill("Export retries");
  await c.summary.fill("I wrote the retry and its tests.");
  await page
    .getByRole("group", { name: "Pillar" })
    .getByRole("button", { name: /^leveling-up/ })
    .click();
  await page.getByRole("button", { name: /slower/ }).click();
  await expect(toast(page)).toHaveText("Saved");
  expect(await human(request, 0)).toMatchObject({
    title: "Export retries",
    summary: "I wrote the retry and its tests.",
    pillar: "level",
    without_me: "slower",
  });
});

test("0 discards; Show all brings it back", async ({ page, view, request }) => {
  await open(page, view);
  const c = card(page);
  await page.keyboard.press("0");
  await expect(toast(page)).toHaveText("Discarded");
  await expect(c.queue).toHaveCount(2);
  await page.getByRole("combobox", { name: "Show" }).selectOption("all");
  await expect(c.queue).toHaveCount(3);
  expect((await human(request, 0)).discard).toBe("yes");
});

test("the last thread: all weeks done, the badge goes", async ({ page, view }) => {
  await open(page, view);
  const c = card(page);
  for (const n of ["1/3", "2/3"]) {
    await page.keyboard.press("2");
    await expect(c.done).toHaveText(n);
  }
  await page.keyboard.press("3");
  await expect(toast(page)).toHaveText("All weeks done");
  await expect(c.done).toHaveText("3/3");
  await expect(page.getByRole("tab", { name: "Review", exact: true })).toBeVisible();
});

test("J and K move, ? shows the keys, Enter leaves the title", async ({ page, view }) => {
  await open(page, view);
  const c = card(page);
  await page.keyboard.press("j");
  await expect(c.mode("elevate")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("j");
  await expect(c.mode("solve")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("k");
  await expect(c.mode("elevate")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("?");
  await expect(page.getByText("discard all routine")).toBeVisible();
  await page.keyboard.press("t");
  await expect(c.title).toBeFocused();
  await page.keyboard.type("Blair learned from a review");
  await page.keyboard.press("Enter");
  await expect(c.title).not.toBeFocused();
  // Typed letters stay in the field: the mode did not change.
  await expect(c.mode("elevate")).toHaveAttribute("aria-pressed", "true");
  await expect(c.title).toHaveValue("Blair learned from a review");
  await c.queue.first().click();
  await expect(c.title).toHaveValue("Retry exports on timeout, part 4");
});

test("V opens the evidence, with links out", async ({ page, view }) => {
  await open(page, view);
  const more = page.getByRole("button", { name: /PR merged/ });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("v");
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: /feat: export step 0\.0/ })).toHaveAttribute(
    "href",
    "https://github.com/acme/api/pull/200",
  );
});

test("P moves the thread: a new topic, then an existing project", async ({
  page,
  view,
  request,
}) => {
  await open(page, view);
  await page.keyboard.press("p");
  const q = page.getByRole("textbox", { name: "Project" });
  await expect(q).toBeFocused();
  await q.fill("Retry work");
  await expect(page.getByRole("option", { name: /Create “Retry work”/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(toast(page)).toHaveText("Created Retry work");
  await page.getByRole("button", { name: /Retry work/ }).click();
  await page.getByRole("option", { name: /Alert routing/ }).click();
  await expect(toast(page)).toHaveText("Moved to Alert routing");
  expect(
    (await review(request)).threads
      .find((t: any) => t.events.some((e: any) => e.title === "Retry exports on timeout, part 4"))
      .projects.map((p: any) => p.name),
  ).toEqual(["Alert routing"]);
});

test("a thread serves a goal: link and unlink it", async ({ page, view, request }) => {
  await request.post("/api/goal", {
    data: { title: "Ship exports", kind: "team", krs: [{ text: "A number", start: 0, target: 2 }] },
  });
  await open(page, view);
  const chip = page
    .getByRole("group", { name: "Goals this thread serves" })
    .getByRole("button", { name: "Ship exports" });
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await chip.click();
  await expect(toast(page)).toHaveText("Linked to the goal");
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  expect((await review(request)).threads[0].goals.direct).toHaveLength(1);
  await chip.click();
  await expect(toast(page)).toHaveText("Unlinked");
  expect((await review(request)).threads[0].goals.direct).toHaveLength(0);
});

test("no goals yet: a link to add one", async ({ page, view }) => {
  await open(page, view);
  await expect(page.getByRole("link", { name: /no goals yet/ })).toHaveAttribute("href", "#/goals");
});

test("Claude's routine threads go last; discard all of them at once", async ({
  page,
  view,
  request,
}) => {
  const first = (await review(request)).threads[0].key;
  await patch(page, (d) => {
    const t = d.threads.find((x: any) => x.key === first);
    if (!t.human.discard) t.claude.discard = "yes";
  });
  await open(page, view);
  await expect(page.getByText("Probably routine · 1")).toBeVisible();
  await expect(card(page).mode("elevate")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /discard all/ }).click();
  await expect(toast(page)).toHaveText("Discarded 1");
  expect((await review(request)).threads.find((t: any) => t.key === first).human.discard).toBe(
    "yes",
  );
});

test("wrong project undoes Claude's placement", async ({ page, view }) => {
  await patch(page, (d) => {
    d.threads[0].projects = d.threads[0].projects.map((p: any) => ({ ...p, by: "claude" }));
  });
  await open(page, view);
  await page.getByRole("button", { name: /wrong project/ }).click();
  await expect(toast(page)).toHaveText("Project removed");
});

test("a refused save says why and keeps the thread open", async ({ page, view }) => {
  await page.route("**/api/labels", (r) => r.fulfill({ status: 400, body: "Bad value for mode" }));
  await open(page, view);
  const c = card(page);
  await page.keyboard.press("1");
  await expect(toast(page)).toHaveText("Not saved: Bad value for mode");
  await expect(c.done).toHaveText("0/3");
  await expect(c.title).toHaveValue("Retry exports on timeout, part 4");
});

test("another week from the address and from the picker", async ({ page, view, request }) => {
  const d = await review(request),
    past = d.weeks[1];
  await view(`review?week=${past}`);
  await expect(card(page).done).toHaveText("3/3");
  await page.getByRole("combobox", { name: "Week" }).selectOption(d.week);
  await expect(card(page).done).toHaveText("0/3");
  await expect(
    page.getByRole("combobox", { name: "Week" }).locator("option", { hasText: `${past} · done` }),
  ).toHaveCount(1);
});
