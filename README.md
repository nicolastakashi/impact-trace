# impact-trace

Weekly impact tracking for engineers.

Claude Code collects the facts from GitHub, Linear, Slack, Calendar and Docs through
CLIs and MCPs. Code here only validates them, stores them in SQLite, and shows them.

```
claude -p (skills) ━▶ data/raw/<week>/*.json ━▶ ingest ━▶ data/impact.db ━▶ app
```

`data/` holds your work data and `config.json`. It is git-ignored and must never be pushed.

## Before you start

- [Bun](https://bun.sh), to run the app and the ingest.
- [GitHub CLI](https://cli.github.com), logged in: `gh auth login`.
- [Claude Code](https://claude.com/claude-code), with these claude.ai connectors on your account:
  Linear, Slack, Google Calendar and Google Drive. `run.sh` calls their tools by name
  (`mcp__claude_ai_Linear__list_issues` and others), so they must be the claude.ai ones.

## Use

```bash
bun app/server.ts        # first run opens the setup page: tools, who you are, first week
./run.sh 2026-10-12      # collect and ingest the week of that Monday (default: this week)
bun test                 # ingest self-check
```

One week cost $0.67 on 2026-10-19: collection with Haiku, projects and labels with Sonnet. `ingest` exits 2 when a source failed or when
Claude returned fewer GitHub PRs than `gh` counts on its own.
