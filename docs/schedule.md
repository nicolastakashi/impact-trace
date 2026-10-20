# Schedule

launchd runs `./schedule.sh run` on weekdays at 18:00. Install with `./schedule.sh install`.

```
18:00 ━▶ 📅 close ended weeks with no feedback, oldest first
       ━▶ 📥 collect this week so far (not on Monday)
       ━▶ 🔔 macOS notification if any run failed
```

## Why it works this way

- **No gaps.** A Monday the Mac slept through, a failed run or a week off all leave a week
  with no feedback. The next run finds those weeks (up to 8 back) and closes them first.
- **One failure does not stop the rest.** Each week is logged and the run moves on.
- **Loud on errors.** If the list of pending weeks cannot be read, the run stops instead of
  reading it as "nothing to do".
- **Collection runs on your Mac,** not in Docker. It needs your Claude Code login and claude.ai
  connectors. The app in Docker reads the same `data/` and opens the database fresh on each
  request, because Docker's file share kept showing old data to an open connection.

Logs: `data/logs/`. Cost: about $0.67 a weekday, plus $0.66 for feedback once a week.

Code: `schedule.sh`, `run.sh`, `ingest/feedback.ts` (`pending`).
