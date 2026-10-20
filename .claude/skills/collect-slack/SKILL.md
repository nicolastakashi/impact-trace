---
name: collect-slack
description: Collect your Slack messages (pass own) or the messages that mention you (pass mention) for one ISO week, as JSON for impact-trace. Read-only.
argument-hint: "<YYYY-MM-DD of the Monday> <own DAY|mention DAY NAME>"
---

`$ARGUMENTS` is the Monday that starts the week, then the pass: `own` or `mention`, then
one day (`DAY`, `YYYY-MM-DD`). `mention` also gets your full name (`NAME`, the rest of the arguments).
Run only that pass. Collect facts, copy, never interpret. Copy, never interpret.
Do not judge which messages matter: the ingest step does that in code. Copy `text`
exactly as the tool returns it, links and mentions included.

You are read-only. Never send, react, schedule or draft anything.

## 1. Window

Slack's `after:` and `before:` exclude the day itself.
`AFTER` is the day before DAY, `BEFORE` the day after it. This covers DAY only.
`week` is the ISO week. `self_user_id` is the user id the search tool reports as yours.

## 2. Pass `own`: everything you wrote

Run this only when the pass is `own`.

`slack_search_public_and_private` with `filters: "from:<@SELF> after:AFTER before:BEFORE"`,
`sort: "timestamp"`, `response_format: "detailed"`, `include_context: false`, `limit: 20`.

Page with `cursor` until no cursor comes back. A week is often six or seven pages.
Stopping early is the mistake that matters: the rows on later pages are lost.

## 3. Pass `mention`: what others wrote about you

Run this only when the pass is `mention`. Same call with `keywords: ["\"NAME\""]` and `filters: "after:AFTER before:BEFORE"`,
paged to the end the same way. Bots stay excluded (the default).

## 4. Rows

One row per message, with `pass` set to the pass you ran.
`channel_name` is the channel as shown (`#team-api`) or `DM` / `Group DM`.
`ts` is the `Message_ts` value. `permalink` is the link URL.

`pages_read` counts every call. `exhausted` is true only when the last page came back
without a cursor.

Return only the structured output. Nothing else.
