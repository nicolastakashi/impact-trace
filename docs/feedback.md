# Feedback

How you show up, from the Slack messages you wrote in the last 8 weeks. Once a week, after the
week ends.

```
╭────────────╮   ╭────────────╮   ╭────────────╮   ╭────────────╮
│ 📚 catalog │━━▶│ 🤖 Claude  │━━▶│ 🧪 code    │━━▶│ 👤 you     │
│ sourced    │   │ quotes you │   │ checks     │   │ accept or  │
│ categories │   │ Sonnet     │   │ and counts │   │ reject     │
╰────────────╯   ╰────────────╯   ╰─────┬──────╯   ╰─────┬──────╯
                       ▲                │                │
                       ╰━━ next week reads your verdicts ━╯
```

## What you get

- Up to 4 **patterns** that weaken your authority, 1 **strength**, and 1 **experiment** to try.
- Each card: where you wrote it, your exact words, what it costs, and what to say next time
  (SBI, then feedforward).

## Why it works this way

- **Only sourced categories.** Claude picks from `ingest/feedback-categories.json`. Each one
  cites who says it matters (Reilly, Larson, Marquet, hedge research). The code drops anything
  else. Summaries we wrote show as "In our words", never as quotes.
- **Quotes are checked.** The code drops any quote it cannot find in your messages, and a
  pattern left with fewer than 2.
- **Counts come from code.** In the first test Claude said "about 5"; the code found 15.
- **The experiment is measured.** Its phrases are counted per week, so the next week shows
  before → after.
- **Your verdicts win.** A rejected pattern does not come back without new evidence. Your
  reason teaches Claude what you meant.

About $0.66 a week. Code: `ingest/feedback.ts`, `.claude/skills/weekly-feedback`.
