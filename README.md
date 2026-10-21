# impact-trace

Weekly impact tracking for engineers.

Claude Code collects the facts from GitHub, Linear, Slack, Calendar and Docs through
CLIs and MCPs. Code here only validates them, stores them in SQLite, and shows them.

```
claude -p (skills) ━▶ data/raw/<week>/*.json ━▶ ingest ━▶ data/impact.db ━▶ app
```

North and Trace show the threads you kept in review, the last 8 weeks. Before your first
review they show fictional example data, marked as such.

Feedback reads the Slack messages you wrote in the last 8 weeks and names patterns in how you
show up, with your own words quoted and a stronger version. It runs once a week, after the week
ends. The code drops any quote it cannot find in your messages and makes every count, so the
one experiment it proposes is measured the next week. Accept or reject each piece, with a reason if you want:
the next run reads your verdicts and does not repeat what you rejected.

Claude may only flag the categories in `ingest/feedback-categories.json`. Each one has a source
(Reilly, Larson, Marquet, research on hedges), shown on its card as "Why this counts". Cards
follow SBI (Situation, Behavior, Impact) and end with what to say next time.

## How it works

| Part | Doc |
|---|---|
| Collect from 5 sources, checked by code | [collect](docs/collect.md) |
| Group events into threads and projects | [threads](docs/threads.md) |
| Review: Claude suggests, you decide | [review](docs/review.md) |
| North, Trace and Projects | [views](docs/views.md) |
| Goals your work serves | [goals](docs/goals.md) |
| Draft, follow and close a quarter of goals | [goal cycle](docs/goal-cycle.md) |
| Feedback on how you show up | [feedback](docs/feedback.md) |
| The daily schedule, with no gaps | [schedule](docs/schedule.md) |
| Ask questions about your data | [ask](docs/ask.md) |
| Click-through tests on fictional data | [qa](docs/qa.md) |

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
./draft-goals.sh         # Claude drafts objectives from your data; you use or dismiss them
bun test                 # ingest self-check
bun install && bun run qa  # click-through tests in your Chrome, fictional data
```

Or run the app in a container. Collection stays on your machine, where your Claude Code
login and connectors are; both read and write the same `data/`.

```bash
docker compose up -d --build   # http://127.0.0.1:4317, rebuild after code changes
```

Collect on a schedule (macOS, launchd): weekdays at 18:00. Each run first closes every ended
week that has no feedback yet, weekend included: usually last week on a Monday, but also a
Monday the Mac slept through or a run that failed. After Monday it also collects this week so far.

```bash
./schedule.sh install    # or: remove. Logs in data/logs/
```

`PORT=4318 bun app/server.ts` runs a second copy next to yours, for example a fresh
clone with its own `data/` to try the setup from scratch.

One week cost $0.67 on 2026-10-19: collection with Haiku, projects and labels with Sonnet.
Each scheduled run costs about that, so weekdays add up to about $3.35 a week. Feedback adds $0.66, once a week. `ingest` exits 2 when a source failed or when
Claude returned fewer GitHub PRs than `gh` counts on its own.
