# Ask your data

Open Claude Code in this repo and ask. The skill `ask-impact` answers from the same numbers
North shows.

```
╭──────────────╮     ╭─────────────────────╮     ╭───────────────╮
│ 💬 question   │ ━━▶ │ 📦 bun jobs/facts.ts │ ━━▶ │ 🗣️ answer + links │
╰──────────────╯     │  code counts, JSON      │     ╰───────────────╯
                     ╰─────────────────────╯
```

```
/ask-impact why did I review so few PRs in W42?
/ask-impact which work would not happen without me, and does it serve a goal?
/ask-impact is "asking permission" going down?
```

## Rules

- **Code counts, Claude explains.** Claude made counting mistakes before (it said 5 where code
  found 15), so every number comes from `facts.ts`.
- **Kept or collected.** Modes, pillars and goals come from threads you kept in review. Slack,
  PRs and meetings count everything collected.
- **Your label or Claude's.** `labels_by` says who set each label. Claude says when an answer
  rests on a label you never confirmed.
- **Patterns are questions.** Few reviews and many merges in one week is something to ask you
  about, not a cause.
- **Read-only.** The skill never writes to `data/` and never shares the facts outside the session.

## The weekly loop

```
╭───────────────╮   ╭──────────────╮   ╭──────────────╮   ╭──────────────╮
│ ⏰ 18:00 collect │ ━▶ │ ✅ you review   │ ━▶ │ 🧭 North shows  │ ━▶ │ 💬 you ask why  │
╰───────────────╯   ╰──────────────╯   ╰──────────────╯   ╰──────────────╯
```

1. Weekdays at 18:00 the [schedule](schedule.md) collects and suggests labels.
2. You keep or drop threads in [review](review.md). Only kept threads count.
3. North shows the week. Something stands out: ask about it here.
4. A missing number: add it to `jobs/facts.ts` with a test, so the next session has it.
   Its keys use the [glossary](glossary.md) words: `goals`, `praise`, `asks`.

Code: `jobs/facts.ts`, `/api/facts` in `app/server.ts`, `.claude/skills/ask-impact`.
