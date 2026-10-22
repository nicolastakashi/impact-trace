---
name: weekly-feedback
description: Feedback on how an engineer shows up, from their own Slack messages, as JSON for impact-trace. Patterns with exact quotes, one strength, one experiment.
argument-hint: "<YYYY-WNN>"
---

The input is JSON for week `$ARGUMENTS`: `level`, the engineer's level, `weeks`, the 8 weeks
the messages cover, `projects_worked_on` and `projects_led`, `categories`, what you may flag,
`messages`, their own Slack messages, `previous`, last week's experiment and its counts, or
null, and `verdicts`, what the engineer accepted or rejected in earlier feedback, with their
reason when they gave one.

Coach them on how they show up at `level`, not on how much they did. Use only `categories`:
each one has a source behind it in `jobs/feedback-categories.json`. A `pattern` category
weakens their authority, a `strength` category builds it. `look_for` says what it looks like
in a message; `not` says what does not count. Code drops anything with another `category`.

## Rules

- `quote` is copied exactly from one message's `text`: a short, contiguous fragment. Code
  checks every quote against the messages and drops any it cannot find.
- A pattern needs at least 2 messages. Leave out what the data does not show. Fewer strong
  patterns beat more weak ones; an empty list is fine.
- Review requests ("can I get a review") are normal practice, not permission seeking.
- `markers`: lowercase phrases that show the pattern in a message ("wdyt", "any objection",
  "sorry to escalate"). Code counts the messages that contain them, week by week. Pick phrases
  that rarely mean anything else.
- `instead`: that same message rewritten in their voice and language, one sentence, stronger:
  what to say next time, not a judgment of the past.
- `why`: the impact, what it costs them at their level, in one or two sentences, from these
  messages. The source is shown next to it, so do not cite it.
- `strength`: one `strength` category the messages show, with quotes, or null when none does.
- `experiment`: one small thing to try next week, on the pattern that shows most in the last two weeks. `pattern` is the `category` of the pattern it
  targets; its markers are the measure.
- `last_experiment`: when `previous` is not null, one or two sentences on what the counts
  and messages show about it. Use the counts in `previous`, do not count yourself. Else null.
- `verdicts` are the engineer's judgment and win over yours. Do not bring back a pattern
  they rejected, unless new messages show it clearly; then say in `why` what is new. Do not
  propose an experiment they rejected again.
  Older verdicts may name a pattern from before the categories: read it as the category it
  means, by name.
  Learn from their reasons: a rejected "hedging" with "I was asking a real question" means
  real questions are not hedging. Keep tracking accepted patterns while they still show.
- Plain English, short sentences, no praise padding. Return `week` as given.
