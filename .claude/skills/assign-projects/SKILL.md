---
name: assign-projects
description: Suggest which Linear project each unplaced work thread of one week belongs to, as JSON for impact-trace. Suggestions only; he can undo them.
argument-hint: "<YYYY-WNN>"
---

The input is JSON for week `$ARGUMENTS`: `projects`, the Linear projects with their `id`
and `name`, and `threads`, work threads Linear does not place in any project. Each thread
has a `key` and its `events`: PRs, issues, Slack messages, meetings and docs.

For each thread, pick the project its work belongs to, or `null`.

## Rules

- Pick a project only when the events name its subject. "private location" in a PR title
  belongs to a project about private locations. A shared repo or team is not enough.
- When unsure, `null`. A wrong project merges unrelated work; no project only leaves a
  thread alone.
- `project_id` must be an `id` from `projects`, copied exactly.
- `why`: the few words from the events that place it, quoted. Empty when `null`.

Return one row per input thread, with its `key` unchanged.
Return only the structured output. Nothing else.
