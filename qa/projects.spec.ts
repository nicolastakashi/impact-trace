import { expect, test, toast } from "./helpers";

// A second project to merge with: one Exports API thread moved into a new topic.
const topic = async (request: any, name = "Docs work") => {
  const g = (await (await request.get("/api/groups")).json()).groups[0],
    week = Object.keys(g.weeks)[0]!;
  await request.post("/api/group", { data: { week, key: g.weeks[week][0].key, name } });
};

test("lists projects across weeks; a filter shows one kind", async ({ page, view, request }) => {
  await topic(request);
  await view("projects");
  await expect(page.getByRole("heading", { name: "Projects across weeks" })).toBeVisible();
  const exp = page.getByRole("link", { name: "Exports API" });
  await expect(exp).toContainText("1 to review");
  await expect(exp).toContainText("Linear · Started");
  await page.getByRole("button", { name: "Topics" }).click();
  await expect(page.getByRole("button", { name: "Topics" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(exp).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Docs work" })).toBeVisible();
  await page.getByRole("button", { name: "Linear" }).click();
  await expect(page.getByRole("link", { name: "Docs work" })).toHaveCount(0);
  await expect(exp).toBeVisible();
});

test("merge asks first, then moves the threads", async ({ page, view, request }) => {
  await topic(request);
  await view("projects");
  const pick = page.getByRole("combobox", { name: "Merge Docs work into another project" });
  await pick.selectOption({ label: "Exports API" });
  await expect(
    page.getByText("Merge Docs work into Exports API? Its 1 thread move there."),
  ).toBeVisible();
  await page.getByRole("button", { name: "cancel" }).click();
  await expect(page.getByText("Merge Docs work into Exports API?")).toHaveCount(0);
  await pick.selectOption({ label: "Exports API" });
  await page.getByRole("button", { name: "merge", exact: true }).click();
  await expect(toast(page)).toHaveText("Merged");
  await expect(page.getByRole("link", { name: "Docs work" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Exports API" })).toContainText("includes Docs work");
  const g = (await (await request.get("/api/groups")).json()).groups.find(
    (x: any) => x.id === "P-EXP",
  );
  expect(g.merged.map((m: any) => m.name)).toEqual(["Docs work"]);
});

test("a refused merge says why", async ({ page, view, request }) => {
  await topic(request);
  await view("projects");
  await page
    .getByRole("combobox", { name: "Merge Docs work into another project" })
    .selectOption({ label: "Exports API" });
  await request.post("/api/delete", { data: { id: "P-EXP" } });
  await page.getByRole("button", { name: "merge", exact: true }).click();
  await expect(toast(page)).toHaveText("Pick two different projects");
});

test("delete asks first; restore brings it back", async ({ page, view, request }) => {
  await view("projects");
  await page.getByRole("button", { name: "delete" }).click();
  await expect(
    page.getByText("Delete Exports API? 4 threads will have no project. You can restore it below."),
  ).toBeVisible();
  await page.getByRole("button", { name: "delete" }).click();
  await expect(toast(page)).toHaveText("Deleted");
  await expect(page.getByText("No projects yet.")).toBeVisible();
  expect((await (await request.get("/api/groups")).json()).deleted.map((p: any) => p.id)).toEqual([
    "P-EXP",
  ]);
  await page.getByText("Deleted · 1").click();
  await page.getByRole("button", { name: "restore" }).click();
  await expect(page.getByRole("link", { name: "Exports API" })).toBeVisible();
  await expect(page.getByText("Deleted · 1")).toHaveCount(0);
});

test("a card opens its project; the old address still works", async ({ page, view }) => {
  await view("projects");
  await page.getByRole("link", { name: "Exports API" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Exports API" })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("#/project?id=P-EXP");
  await view("projects?p=P-EXP");
  await expect(page.getByRole("heading", { level: 1, name: "Exports API" })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("#/project?id=P-EXP");
});
