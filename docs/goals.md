# Goals

What your work serves. You write each objective and its key results, or start from a
[Claude draft](goal-cycle.md); code measures the ones it can.

```
╭──────────────╮    ╭──────────────╮    ╭──────────────╮
│ 🎯 goal      │◀━━│ 📁 project   │◀━━│ 🧵 thread    │
│ you write it │    │ "Serves" on  │    │ in it        │
╰──────┬───────╯    │ its page     │    ╰──────────────╯
       │            ╰──────────────╯
       │◀━━━━━━━━━━━━━━━━━━━━━━━━━━━ 🧵 one thread, L in review
       ▼
 🧭 North: one ring per goal, plus "serves no goal"
```

| Kind | Example | Usually linked by |
|---|---|---|
| team or company | "Exports API GA" | a project |
| personal | "Grow two engineers to lead projects" | single threads: a pairing, a review that taught |

## Key results

```
 "Lead time under a day"   from 25 ━━━━━━━━━━━━━━━━━━━━━━━┃━▶ target 12 h
                           now 12.7 (median, last 4 weeks) = 0.95
```

- **A number, a start, a target.** Up to 5 per objective. "Ship X" is a task: if it is a
  Linear milestone, measure the milestone's % done.
- **Measured by code or by you.** Pick a metric (reviews, give vs take, lead time,
  recognition, requests that name you, elevate or external threads), a milestone, or
  "I update it" and type "now" yourself.
- **Now is a rate.** Counts are per week, over the last 4 closed weeks of the quarter. A
  quarter's sum only grows, so a "drop from 8 to 3" could never be read from it.
- **Committed or aspirational.** Committed must reach 1.0. Aspirational is on track at 0.7,
  the tick on each bar.
- **Confidence, weekly.** 1 to 10, only for this week: it records what you knew then.

## Why it works this way

- **Written by you.** Many teams have no OKR process, so the app is where goals live.
  Old plain-text key results became rows with no numbers; add them on edit.
- **Two ways to link.** A project links all its threads, every week. A personal goal rarely
  has a project, so one thread can link on its own.
- **Links survive changes.** A thread links by its events, so a regroup keeps it. A project
  you merge into another takes its goals with it.
- **One thread, many goals.** Shares on North can add up to more than 100%.
- **"Serves no goal" is a signal.** It can be normal, or glue work nobody owns.
- **Before your first goal,** North shows your top 3 projects, and says so.

Delete a goal and only its links go; projects and threads stay.

Code: `ingest/goals.ts`, `ingest/metrics.ts`, `app/server.ts` (`goalList`, `saveGoal`, `checkin`, `linkGoal`), `app/index.html` (`GO`).
