# Collect

One week of your work, from 6 sources, into `data/impact.db`.

```
╭──────────────╮   ╭──────────────╮   ╭──────────────╮
│ 🤖 claude -p │━━▶│ 📄 raw JSON  │━━▶│ 🧪 ingest    │
│ skill, Haiku │   │ data/raw/W42 │   │ checks, SQL  │
╰──────────────╯   ╰──────────────╯   ╰──────────────╯
```

| Source | What | Skill |
|---|---|---|
| GitHub | PRs, review comments received | `collect-github` |
| Reviews | every review you submitted, with its date | `collect-reviews` |
| Requests | who asked you or your teams for a review, with its date | `collect-requests` |
| Linear | your issues and their projects | `collect-linear` |
| Slack | your messages and mentions of you, one call per day each | `collect-slack` |
| Calendar | meetings with someone else that you did not decline | `collect-calendar` |
| Drive | docs you own, created or changed that week | `collect-drive` |

## Why it works this way

- **Claude collects, code checks.** Claude Code already has your logins and connectors, so
  no collector is written twice. `--json-schema` fixes the shape. `ingest` checks the rest.
- **Read-only.** Each call gets only the tools it needs (`--allowedTools` in `run.sh`).
- **Claude copies, code filters.** Claude returns every row; code drops rows outside the
  week. When Haiku filtered dates itself, it lost an issue.
- **Independent counts.** `gh` counts your merged PRs and the PRs you reviewed on its own.
  If Claude returned fewer, `ingest` exits 2, and so does a source that failed.
- **Reviews by date, not by PR.** Search can only filter PRs by their last update, so a PR
  you reviewed weeks ago counted again when its author pushed. Each review now counts in
  the week you submitted it (W42: 9 counted before, 5 real).
- **Asked you, or asked your team.** A request that names you and a CODEOWNERS request to
  your team are two numbers. Since W36: 32 PRs still wait on you, 722 on you or a team.
  Search shows only requests still open, so the PR timeline gives the date of each one.
- **Slack in small calls.** A week in one call came back as its first page: 11 pages read,
  20 rows returned. Code checks that the rows fill the pages read, and drops rows from
  other days.

Code: `run.sh`, `.claude/skills/collect-*`, `ingest/ingest.ts`. Next: [threads](threads.md).
