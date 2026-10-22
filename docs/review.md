# Review

Claude suggests labels for each thread. You decide. Only threads you keep reach North and Trace.

| Field | Who | What |
|---|---|---|
| title, summary | Claude, you edit (`T`, `E`) | what the thread delivered, facts only |
| mode | Claude, you change (`H`) | clarify, prevent, solve, build, elevate, external |
| pillar | Claude, you change (`C`) | big picture, execution, leveling up (Reilly) |
| without you | **you only** (`1` `2` `3`) | would it happen without you: no, slower, same |
| discard | Claude suggests, you confirm (`0`) | routine work that is not impact |

## Why it works this way

- **"Without you" is yours alone.** The events rarely show what would have happened without
  you. When Claude tried, it said "unknown" on 35 of 36 threads.
- **Claude only suggests discard.** Keeping a thread is your call, never Claude's.
- **Your decisions teach the next week.** Threads you kept and discarded go to Claude as
  examples of what is routine for you.
- **Labels follow the thread.** A regroup or a merge can change a thread's key; labels move
  with its first event, so nothing you decided gets lost.
- **Sources for every mode.** The References page shows who says each kind of work counts.

Labels run on Sonnet with no tools: only the threads as input.

Code: `jobs/review.ts`, `.claude/skills/suggest-labels`. Next: [views](views.md).
