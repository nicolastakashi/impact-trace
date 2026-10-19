---
name: check-threads
description: Check whether each work thread of one week is one piece of work or mixes unrelated work. An eval for impact-trace grouping.
argument-hint: "<YYYY-WNN>"
---

The input is a JSON list of work threads for week `$ARGUMENTS`, each with a `key` and its
`events`. A thread should be one piece of work: one feature, fix, decision or conversation.

For each thread, say whether it mixes unrelated work.

- `mixed`: true when the events cover two or more pieces of work that a reader would not
  put under one title. Different repos or event kinds for the same work are not mixed.
- `topics`: when mixed, a few words for each piece. Empty when not mixed.

Judge only from the events. Return one row per input thread, `key` unchanged.
Return only the structured output. Nothing else.
