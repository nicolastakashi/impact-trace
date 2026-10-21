import { expect, test } from "./helpers";

const topic = (page: any, name: RegExp) => page.getByRole("group", { name: "Topics" }).getByRole("button", { name });

test("the address picks the topic; quotes link to their source", async ({ page, view }) => {
  await view("refs?k=build");
  await expect(page.getByRole("heading", { name: "Build at company scope" })).toBeVisible();
  await expect(topic(page, /^Build/)).toHaveAttribute("aria-pressed", "true");
  await expect(topic(page, /^Clarify/)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Shipped product or platform work.")).toBeVisible();
  await expect(page.getByText("Principal Engineers are hands-on and lead by example.")).toBeVisible();
  // A secondary source says so.
  await expect(page.getByText("Hacker News repost, not the official page")).toBeVisible();
  const src = page.getByRole("link", { name: /GitLab, Principal Engineer/ });
  await expect(src).toHaveAttribute("href", "https://handbook.gitlab.com/job-families/engineering/development/management/principal-engineer/");
  await expect(src).toHaveAttribute("target", "_blank");
});

test("a topic tab swaps the card and the address", async ({ page, view }) => {
  await view("refs");
  await topic(page, /^Glue work/).click();
  await expect(page.getByRole("heading", { name: "Glue work" })).toBeVisible();
  await expect(page.getByText("Glue work is the difference between a project that succeeds and one that fails.")).toBeVisible();
  await expect(topic(page, /^Glue work/)).toHaveAttribute("aria-pressed", "true");
  expect(new URL(page.url()).hash).toBe("#/refs?k=glue");
});

test("an unknown topic falls back to Clarify", async ({ page, view }) => {
  await view("refs?k=nope");
  await expect(page.getByRole("heading", { name: "Clarify" })).toBeVisible();
  await expect(page.getByText("Made a fuzzy problem clear.")).toBeVisible();
});
