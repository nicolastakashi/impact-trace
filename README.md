# impact-trace

Weekly impact tracking for engineers.

Claude Code collects the facts from GitHub, Linear, Slack, Calendar and Docs through
CLIs and MCPs. Code here only validates them, stores them in SQLite, and shows them.

```
claude -p (skills) ━▶ data/raw/<week>/*.json ━▶ ingest ━▶ data/impact.db ━▶ app
```

`data/` holds Dash0 data. It is git-ignored and must never be pushed.

## Use

```bash
bun app/server.ts        # first run opens the setup page: tools, who you are, first week
./run.sh 2026-10-12      # collect and ingest the week of that Monday (default: this week)
bun test                 # ingest self-check
```

One week costs about $0.05 with Haiku. `ingest` exits 2 when a source failed or when
Claude returned fewer GitHub PRs than `gh` counts on its own.
