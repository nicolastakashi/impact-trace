# Goals

What your work serves. You write the goals; nothing measures them yet.

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

## Why it works this way

- **Written by you.** Many teams have no OKR process, so the app is where goals live. Key
  results are plain text, one per line. "Goals", not "OKRs": nothing measures them.
- **Two ways to link.** A project links all its threads, every week. A personal goal rarely
  has a project, so one thread can link on its own.
- **Links survive changes.** A thread links by its events, so a regroup keeps it. A project
  you merge into another takes its goals with it.
- **One thread, many goals.** Shares on North can add up to more than 100%.
- **"Serves no goal" is a signal.** It can be normal, or glue work nobody owns.
- **Before your first goal,** North shows your top 3 projects, and says so.

Delete a goal and only its links go; projects and threads stay.

Code: `ingest/goals.ts`, `app/server.ts` (`goalList`, `saveGoal`, `linkGoal`), `app/index.html` (`GO`).
