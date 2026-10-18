# impact-trace

Weekly impact tracking for a Principal Engineer.

Claude Code collects the facts from GitHub, Linear, Slack, Calendar and Docs through
CLIs and MCPs. Code here only validates them, stores them in SQLite, and shows them.

```
claude -p (skills) ━▶ data/raw/<week>/*.json ━▶ ingest ━▶ data/impact.db ━▶ app
```

`data/` holds Dash0 data. It is git-ignored and must never be pushed.
