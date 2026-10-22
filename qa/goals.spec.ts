import { expect, test, toast } from "./helpers";

const goals = async (request: any) => await (await request.get("/api/goals")).json();

test("a draft becomes a goal with one click", async ({ page, view, request }) => {
  await view("goals");
  await expect(page.getByText("Claude drafted 2 objectives")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Exports reach general availability" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add as goal" }).click();
  await expect(toast(page)).toHaveText("Added: Exports reach general availability");
  const goal = (await goals(request)).goals[0];
  expect(goal.title).toBe("Exports reach general availability");
  expect(goal.description).toBe("Batch exports is open and most of your work sits in Exports API.");
  // Starts are code's: the milestone is at 60.
  expect(
    goal.krs.map((keyResult: any) => [keyResult.text, keyResult.start, keyResult.target]),
  ).toEqual([
    ["Batch exports milestone done", 60, 100],
    ["PRs you review each week", 3, 5],
  ]);
});

test("drop a key result and change a target before adding", async ({ page, view, request }) => {
  await view("goals");
  await page.getByRole("button", { name: "Keep this key result" }).nth(1).click();
  await page.getByRole("textbox", { name: "Target" }).first().fill("90");
  await page.getByRole("button", { name: "Add as goal" }).click();
  await expect(toast(page)).toContainText("Added");
  expect(
    (await goals(request)).goals[0].krs.map((keyResult: any) => [keyResult.text, keyResult.target]),
  ).toEqual([["Batch exports milestone done", 90]]);
});

test("skip deletes a draft; arrows move between drafts", async ({ page, view, request }) => {
  await view("goals");
  await expect(page.getByText("1 of 2")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { name: "Alerts reach the right team" })).toBeVisible();
  await page.getByRole("button", { name: "skip" }).click();
  await expect(toast(page)).toContainText("Skipped");
  expect((await goals(request)).drafts.map((draft: any) => draft.title)).toEqual([
    "Exports reach general availability",
  ]);
});

test("write a goal by hand, with a measured key result", async ({ page, view, request }) => {
  await view("goals");
  await page.getByRole("button", { name: /new goal/ }).click();
  await page.getByLabel("Objective").fill("Reviews flow both ways");
  await page.getByLabel("Description").fill("Others review as much as I do.");
  await page
    .getByRole("textbox", { name: "Key result 1", exact: true })
    .fill("PRs I review each week");
  await page.getByLabel("How it is measured").selectOption("reviews_given");
  await page.getByLabel("target").fill("6");
  await page.getByRole("button", { name: "Create objective" }).click();
  await expect(toast(page)).toHaveText("Goal created");
  const goal = (await goals(request)).goals[0];
  expect([goal.title, goal.description, goal.krs[0].metric, goal.krs[0].target]).toEqual([
    "Reviews flow both ways",
    "Others review as much as I do.",
    "reviews_given",
    6,
  ]);
});

test("a wrong number is explained, and nothing is lost", async ({ page, view }) => {
  await view("goals");
  await page.getByRole("button", { name: /new goal/ }).click();
  await page.getByLabel("Objective").fill("Bad numbers");
  await page.getByRole("textbox", { name: "Key result 1", exact: true }).fill("Something");
  await page.getByLabel("target").fill("lots");
  await page.getByRole("button", { name: "Create objective" }).click();
  await expect(page.getByRole("alert")).toContainText("must be numbers");
  await expect(page.getByLabel("Objective")).toHaveValue("Bad numbers");
});

test("one goal open at a time; confidence; edit; delete", async ({ page, view, request }) => {
  for (const title of ["First goal", "Second goal"])
    await request.post("/api/goal", {
      data: {
        title,
        kind: "team",
        krs: [{ text: "A number", start: 0, target: 2, current: 1 }],
      },
    });
  await view("goals");
  await page.getByRole("button", { name: /First goal/ }).click();
  await expect(page.getByRole("heading", { name: "First goal" })).toBeVisible();
  await page.getByRole("button", { name: /Second goal/ }).click();
  await expect(page.getByRole("heading", { name: "First goal" })).toHaveCount(0);
  await page
    .getByRole("group", { name: /Confidence this week/ })
    .getByRole("button", { name: "7" })
    .click();
  await expect(toast(page)).toHaveText("Confidence 7 saved");
  await page.getByRole("button", { name: "edit", exact: true }).click();
  await page.getByLabel("Description").fill("Now with words.");
  await page.getByRole("button", { name: "Save objective" }).click();
  await expect(page.getByText("Now with words.")).toBeVisible();
  await page.getByRole("button", { name: "delete", exact: true }).click();
  await page.getByRole("button", { name: "delete", exact: true }).last().click();
  await expect(toast(page)).toHaveText("Goal deleted");
  const saved = await goals(request);
  expect(
    saved.goals.map((goal: any) => [
      goal.title,
      goal.checkins.map((checkIn: any) => checkIn.confidence),
    ]),
  ).toEqual([["First goal", []]]);
});
