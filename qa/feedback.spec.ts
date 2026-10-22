import { rmSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./helpers";

const verdicts = async (request: any) =>
  (await (await request.get("/api/north")).json()).FEEDBACK[0].verdicts;
// The verdict's note is a status too: find the toast by its exact text.
const said = (page: any, t: string) =>
  expect(page.getByRole("status").getByText(t, { exact: true })).toBeVisible();
const vd = (page: any, scope: any = page) => scope.getByRole("group", { name: "Your verdict" });

test("the week's experiment, the pattern in focus and its marked quotes", async ({
  page,
  view,
}) => {
  await view("feedback");
  await expect(page.getByText("9 of your Slack messages · W40–W42")).toBeVisible();
  await expect(page.getByText("Try this week")).toBeVisible();
  await expect(page.getByText("6messages with these phrases in 8 weeks, 2 in W42")).toBeVisible();
  await expect(
    page.getByRole("tab", { name: /Asking permission on what you own/ }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: "Asking permission on what you own" }),
  ).toBeVisible();
  // The phrase that carries the pattern is marked in your own words.
  await expect(page.getByRole("mark").first()).toHaveText("Is it ok if I");
  await expect(page.getByRole("link", { name: "open in Slack ↗" }).first()).toHaveAttribute(
    "href",
    /acme\.slack\.com/,
  );
  await page.getByText("Why this counts · Tanya Reilly").click();
  await expect(
    page.getByText("“Radiating intent (instead of seeking permission or asking for forgiveness).”"),
  ).toBeVisible();
  await page.getByText("1 more example · 8-week count").click();
  await expect(
    page.getByText("“Is it ok if I change the timeout default to 30s for exports?”"),
  ).toBeVisible();
});

test("tabs switch the focus and keep it in the address", async ({ page, view }) => {
  await view("feedback");
  await page.getByRole("tab", { name: /Closing with a written decision/ }).click();
  await expect(
    page.getByRole("heading", { name: "Closing with a written decision" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#\/feedback\?w=W42&p=1$/);
  await page.reload();
  await expect(page.getByRole("tab", { name: /Closing with a written decision/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("accept a pattern, then take it back", async ({ page, view, request }) => {
  await view("feedback");
  const focus = page.getByRole("tabpanel");
  await vd(page, focus)
    .getByRole("button", { name: /Accept/ })
    .click();
  await said(page, "Accepted");
  await expect(vd(page, focus).getByRole("button", { name: /Accept/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByText("Accepted. Claude keeps tracking it next week, and its count shows there."),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /accepted ·/ })).toBeVisible();
  expect((await verdicts(request))["pattern:Asking permission on what you own"]).toEqual({
    v: "accept",
    why: null,
  });
  await vd(page, focus)
    .getByRole("button", { name: /Accept/ })
    .click();
  await said(page, "Taken back");
  expect(await verdicts(request)).toEqual({});
});

test("reject with a reason that Claude reads next week", async ({ page, view, request }) => {
  await view("feedback");
  await vd(page, page.getByRole("tabpanel"))
    .getByRole("button", { name: /Reject/ })
    .click();
  await said(page, "Rejected. Say why, and Claude learns from it.");
  const why = page.getByRole("textbox", { name: "Why you rejected it" });
  await expect(why).toBeFocused();
  await why.fill("I was asking a real question");
  await page.getByRole("button", { name: "Save reason" }).click();
  await said(page, "Reason saved. Claude reads it next week.");
  expect((await verdicts(request))["pattern:Asking permission on what you own"]).toEqual({
    v: "reject",
    why: "I was asking a real question",
  });
});

test("A and R judge the pattern in focus", async ({ page, view, request }) => {
  await view("feedback");
  await page.getByRole("tab", { name: /Closing with a written decision/ }).click();
  await page.keyboard.press("a");
  await said(page, "Accepted");
  expect((await verdicts(request)).strength).toEqual({ v: "accept", why: null });
  await page.keyboard.press("r");
  await said(page, "Rejected. Say why, and Claude learns from it.");
  expect((await verdicts(request)).strength.v).toBe("reject");
});

test("pass on the experiment", async ({ page, view, request }) => {
  await view("feedback");
  await page.getByRole("button", { name: "Not this one" }).click();
  await expect(
    page.getByText(
      "Passed. Next week Claude proposes a different experiment, and nothing is measured for this one.",
    ),
  ).toBeVisible();
  expect((await verdicts(request)).experiment).toEqual({ v: "reject", why: null });
});

test("before your first collection: the example, and verdicts stay on the page", async ({
  page,
  view,
}) => {
  // No database: the server serves the sample.
  rmSync(join(import.meta.dirname, ".data/live/impact.db"));
  await view("feedback");
  await expect(page.getByRole("link", { name: /Example feedback, not yours/ })).toBeVisible();
  await expect(page.getByText("“Plan is to cut the release Friday, wdyt?”")).toBeHidden();
  await expect(page.getByText("We cut the release Friday.")).toBeHidden();
  await expect(
    page.getByText(
      "I'm dropping the v1 endpoint next sprint; tell me by Thursday if that breaks you.",
    ),
  ).toBeVisible();
  await vd(page, page.getByRole("tabpanel"))
    .getByRole("button", { name: /Accept/ })
    .click();
  await said(page, "Accepted (example only)");
});
