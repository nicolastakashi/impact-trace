---
name: collect-linear
description: Collect Nicolas's Linear issues and their projects for one ISO week, as JSON for impact-trace. Read-only.
argument-hint: "<YYYY-MM-DD of the Monday>"
---

Collect facts for the week that starts on Monday `$ARGUMENTS`. Copy, never interpret:
no summaries, no judgment, no guesses. A field you cannot find is `null` or `[]`.

You are read-only. Never create, update or comment on anything.

## 1. Window

Monday `$ARGUMENTS` to the Sunday six days later, inclusive. `week` is its ISO week,
for example `2026-W42`.

## 2. Issues

Call `list_issues` with `assignee: "me"`, `updatedAt: "<Monday>"`, `limit: 250`,
`fields: ["title","url","statusType","completedAt","project","projectMilestone"]`.

Page with `cursor` until `hasNextPage` is false. `pages_read` is how many calls you made.
Stopping early is the one mistake that matters here: rows on a later page are silently
lost, and nobody notices.

Copy **every** row from every page into `issues`, including canceled and duplicate
ones. Do not filter by date or status: the ingest step does that in code, and compares
its result with your attachment picks below. A row you leave out is a row that is lost.

When the window's Sunday is today or later, also collect open issues nobody touched this
week: a second `list_issues` call with `assignee: "me"`, no `updatedAt`, same `fields`,
paged to the end. Add its rows to `issues` too (repeating an id is fine) and count its
pages in `pages_read`.

For each `completed` issue whose `completedAt` falls inside the window, call `get_issue`
with `fields: ["attachments"]` and add `{id, urls}` to `attachments`, with every
attachment `url`. Use `[]` for an issue that has none.

`project_name` and `milestone_name` are the names exactly as Linear returns them.

## 3. Projects

For each distinct non-null `project_name` among the issues that got an `attachments` entry
or are open, call `list_projects` with `query: <name>`,
`includeMilestones: true`, `fields: ["name","url","status","lead","milestones"]`.
Take the row whose name matches exactly. Copy its `id` (the `P-...` identifier), `url`,
`status.name`, `lead.name` (or `null`), and each milestone's `id`, `name`, `progress`
as a number without `%`, and `targetDate`. Skip milestone descriptions.

## 4. Output

Return only the structured output. Nothing else.
