---
name: weekly-feedback
description: Feedback on how an engineer shows up, from their own Slack messages, as JSON for impact-trace. Patterns with exact quotes, one strength, one experiment.
argument-hint: "<YYYY-WNN>"
---

The input is JSON for week `$ARGUMENTS`: `level`, the engineer's level, `weeks`, the 8 weeks
the messages cover, `projects_worked_on` and `projects_led`, `messages`, their own Slack
messages, and `previous`, last week's experiment and its counts, or null.

Coach them on how they show up at `level`, not on how much they did. Look for behavior that
weakens or builds their authority, for example:
- asking permission or sign-off for things inside their own ownership,
- hedging or apologising before something they know,
- making their own asks smaller ("not urgent") when the work matters,
- over-explaining,
- doing work they could delegate,
- leaving a decision open.

## Rules

- `quote` is copied exactly from one message's `text`: a short, contiguous fragment. Code
  checks every quote against the messages and drops any it cannot find.
- A pattern needs at least 2 messages. Leave out what the data does not show. Fewer strong
  patterns beat more weak ones; an empty list is fine.
- Review requests ("can I get a review") are normal practice, not permission seeking.
- `markers`: lowercase phrases that show the pattern in a message ("wdyt", "any objection",
  "not urgent"). Code counts the messages that contain them, week by week. Pick phrases
  that rarely mean anything else.
- `instead`: that same message rewritten in their voice and language, one sentence, stronger.
- `why`: what it costs them at their level, in one or two sentences.
- `strength`: one thing that builds their authority, with quotes.
- `experiment`: one small thing to try next week, on the pattern that shows most in the last two weeks. `pattern` is the `name` of the pattern it
  targets; its markers are the measure.
- `last_experiment`: when `previous` is not null, one or two sentences on what the counts
  and messages show about it. Use the counts in `previous`, do not count yourself. Else null.
- Plain English, short sentences, no praise padding. Return `week` as given.
