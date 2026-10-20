# Collect

One week of your work, from 5 sources, into `data/impact.db`.

```
╭──────────────╮   ╭──────────────╮   ╭──────────────╮
│ 🤖 claude -p │━━▶│ 📄 raw JSON  │━━▶│ 🧪 ingest    │
│ skill, Haiku │   │ data/raw/W42 │   │ checks, SQL  │
╰──────────────╯   ╰──────────────╯   ╰──────────────╯
```

| Source | What | Skill |
|---|---|---|
| GitHub | PRs, reviews given, review comments received | `collect-github` |
| Linear | your issues and their projects | `collect-linear` |
| Slack | your messages (one call per day), and mentions of you | `collect-slack` |
| Calendar | meetings with someone else that you did not decline | `collect-calendar` |
| Drive | docs you own, created or changed that week | `collect-drive` |

## Why it works this way

- **Claude collects, code checks.** Claude Code already has your logins and connectors, so
  no collector is written twice. `--json-schema` fixes the shape. `ingest` checks the rest.
- **Read-only.** Each call gets only the tools it needs (`--allowedTools` in `run.sh`).
- **Claude copies, code filters.** Claude returns every row; code drops rows outside the
  week. When Haiku filtered dates itself, it lost an issue.
- **An independent count.** `gh` counts your merged PRs on its own. If Claude returned
  fewer, `ingest` exits 2, and so does a source that failed.
- **Slack in small calls.** One call for a busy week (338 messages) was too long, and one
  call for both passes skipped the mentions.

Code: `run.sh`, `.claude/skills/collect-*`, `ingest/ingest.ts`. Next: [threads](threads.md).
