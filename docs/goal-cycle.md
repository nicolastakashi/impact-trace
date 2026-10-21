# A quarter of goals

How to set goals, follow them and close them. The page itself is in [goals](goals.md).

```
 ╭──────────────╮   ╭──────────────╮   ╭──────────────╮   ╭──────────────╮
 │ 🤖 draft     │━━▶│ ✍️ decide     │━━▶│ 🔢 each week  │━━▶│ 🏁 close     │
 │ ./draft-     │   │ use and edit,│   │ confidence   │   │ score, keep  │
 │ goals.sh     │   │ or dismiss   │   │ 1 to 10      │   │ what you saw │
 ╰──────────────╯   ╰──────────────╯   ╰──────────────╯   ╰──────────────╯
```

## 1. Draft (start of the quarter)

`./draft-goals.sh` (the app must run). Claude (Sonnet, about $0.30) reads your facts and
proposes 3 to 5 objectives. A new run replaces the drafts you have not used. Code checks each
draft before you see it:

- **Based on** strings must be copied from your data, or the draft goes.
- **Numbers in "why"** must be in your data, or the draft goes.
- **Starts are code's.** For a measured key result, code sets the start to where you are now.
  Any other start must be in your data, or it stays empty for you to fill.
- **Measures must exist.** A key result with an unknown metric is dropped.

## 2. Decide

"Use and edit" opens the draft in the form, so you rename it, change targets or drop key
results before you save. Nothing is a goal until you save it. Aim for 2 to 4 objectives.

## 3. Each week

Give each objective a confidence, 1 to 10. Progress is what happened; confidence is what you
expect. A drop in confidence while progress looks fine is the thing to talk about.

## 4. Close (end of the quarter)

An aspirational goal at 0.7 went well; a committed one below 1.0 needs a reason. The score
is for you to learn from: never put it in a performance review.

Code: `ingest/drafts.ts`, `.claude/skills/draft-goals/SKILL.md`, `draft-goals.sh`.
