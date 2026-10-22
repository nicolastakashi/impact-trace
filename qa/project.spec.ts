import { expect, test, toast } from "./helpers";

const EXPORTS_ROUTE = "project?id=P-EXP";
const get = async (request: any, id = "P-EXP") =>
  (await request.get(`/api/project?id=${encodeURIComponent(id)}`)).json();
// A second project: the W40 Exports API thread moved into a new topic.
const topic = async (request: any, name = "Docs work") => {
  const thread = (await get(request)).threads[0];
  await request.post("/api/thread-project", { data: { week: thread.week, key: thread.key, name } });
};

test("shows sources, facts, milestones and the threads to review", async ({ page, view }) => {
  await view(EXPORTS_ROUTE);
  await expect(page.getByRole("heading", { level: 1, name: "Exports API" })).toBeVisible();
  await expect(page.getByRole("link", { name: "← Projects" })).toHaveAttribute(
    "href",
    "#/projects",
  );
  await expect(page.getByRole("link", { name: "Open in Linear" })).toHaveAttribute(
    "href",
    "https://linear.app/acme/project/exports",
  );
  await expect(page.getByText("Started", { exact: true })).toBeVisible();
  await expect(page.getByText("Batch exports")).toBeVisible();
  await expect(page.getByText("60%")).toBeVisible();
  await expect(page.getByRole("link", { name: "1 to review →" })).toHaveAttribute(
    "href",
    /#\/review\?week=\d{4}-W\d{2}&key=.+&from=P-EXP/,
  );
});

test("a thread opens to its events", async ({ page, view }) => {
  await view(EXPORTS_ROUTE);
  const thread = page.getByRole("button", { name: /Retry exports on timeout, part 1/ });
  await expect(thread).toHaveAttribute("aria-expanded", "false");
  await thread.click();
  await expect(thread).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: /feat: export step 3\.0/ })).toHaveAttribute(
    "href",
    "https://github.com/acme/api/pull/230",
  );
  await expect(page.getByText("PR merged").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "open in review →" })).toHaveAttribute(
    "href",
    /#\/review\?week=.+&from=P-EXP/,
  );
  await thread.click();
  await expect(page.getByRole("link", { name: /feat: export step 3\.0/ })).toHaveCount(0);
});

test("move a thread to another project", async ({ page, view, request }) => {
  await topic(request);
  await view(EXPORTS_ROUTE);
  await page.getByRole("button", { name: /part 2/ }).click();
  await page
    .getByRole("combobox", { name: "Move this thread" })
    .selectOption({ label: "Docs work" });
  await expect(toast(page)).toHaveText("Moved to Docs work");
  await expect(page.getByRole("button", { name: /part 2/ })).toHaveCount(0);
  expect(
    (await get(request, "topic:docs-work")).threads.map((thread: any) => thread.title),
  ).toEqual(["Retry exports on timeout, part 1", "Retry exports on timeout, part 2"]);
});

test("merge another project in, then split it out", async ({ page, view, request }) => {
  await topic(request);
  await view(EXPORTS_ROUTE);
  await page.getByRole("button", { name: "＋ merge another project in" }).click();
  await page
    .getByRole("combobox", { name: "Project to merge in" })
    .selectOption({ label: "Docs work" });
  await page.getByRole("button", { name: "merge Docs work in" }).click();
  await expect(toast(page)).toHaveText("Merged Docs work");
  expect((await get(request)).sources.map((source: any) => source.name)).toEqual([
    "Exports API",
    "Docs work",
  ]);
  // The merged project's address opens the project it lives in.
  await view("project?id=topic%3Adocs-work");
  await expect(page.getByRole("heading", { level: 1, name: "Exports API" })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("#/project?id=P-EXP");
  await page.getByRole("button", { name: "split out" }).click();
  await expect(toast(page)).toHaveText("Split out again");
  expect((await get(request)).sources.map((source: any) => source.name)).toEqual(["Exports API"]);
});

test("switch the goals it serves", async ({ page, view, request }) => {
  await view(EXPORTS_ROUTE);
  await expect(page.getByRole("link", { name: "no goals yet · add one →" })).toHaveAttribute(
    "href",
    "#/goals",
  );
  await request.post("/api/goal", {
    data: {
      title: "Ship exports",
      kind: "team",
      keyResults: [{ text: "A number", start: 0, target: 2 }],
    },
  });
  await page.reload();
  const goalButton = page
    .getByRole("group", { name: "Goals this project serves" })
    .getByRole("button", { name: "Ship exports" });
  await expect(goalButton).toHaveAttribute("aria-pressed", "false");
  await goalButton.click();
  await expect(toast(page)).toHaveText("Serves Ship exports");
  await expect(goalButton).toHaveAttribute("aria-pressed", "true");
  expect((await get(request)).goals[0].linked).toBe(1);
  await goalButton.click();
  await expect(toast(page)).toHaveText("No longer serves Ship exports");
  await expect(goalButton).toHaveAttribute("aria-pressed", "false");
});

test("delete asks first; a deleted project offers restore", async ({ page, view, request }) => {
  await view(EXPORTS_ROUTE);
  await page.getByRole("button", { name: "delete project" }).click();
  await expect(
    page.getByText(
      "Delete Exports API? 4 threads will have no project. You can restore it from the list.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "cancel" }).click();
  await page.getByRole("button", { name: "delete project" }).click();
  await page.getByRole("button", { name: "delete", exact: true }).click();
  await expect(toast(page)).toHaveText("Deleted Exports API");
  await expect(page).toHaveURL(/#\/projects$/);
  await view(EXPORTS_ROUTE);
  await expect(
    page.getByText("You deleted this project, so its threads have no project."),
  ).toBeVisible();
  await page.getByRole("button", { name: "restore" }).click();
  await expect(toast(page)).toHaveText("Restored");
  await expect(page.getByText("You deleted this project")).toHaveCount(0);
  expect((await get(request)).deleted).toBe(false);
});

test("discarded threads stay hidden until you ask", async ({ page, view, request }) => {
  const thread = (await get(request)).threads.at(-1);
  await request.post("/api/labels", {
    data: { week: thread.week, key: thread.key, labels: { discard: "yes" } },
  });
  await view(EXPORTS_ROUTE);
  await expect(page.getByText("all reviewed ✓")).toBeVisible();
  await expect(page.getByRole("button", { name: /part 4/ })).toHaveCount(0);
  await page.getByRole("button", { name: "show 1 discarded" }).click();
  await expect(page.getByRole("button", { name: /part 4/ })).toContainText("discarded");
  await page.getByRole("button", { name: "hide 1 discarded" }).click();
  await expect(page.getByRole("button", { name: /part 4/ })).toHaveCount(0);
});

test("an unknown project says so", async ({ page, view }) => {
  await view("project?id=nope");
  await expect(page.getByText("This project does not exist.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to projects" })).toHaveAttribute(
    "href",
    "#/projects",
  );
});
