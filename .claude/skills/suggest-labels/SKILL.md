---
name: suggest-labels
description: Suggest impact labels for one week of an engineer's work threads, as JSON for impact-trace. Suggestions only; they decide.
argument-hint: "<YYYY-WNN>"
---

The input is JSON for week `$ARGUMENTS`: `level`, the engineer's level, `threads`, the work threads to label, and
`examples`, titles of threads the engineer already judged. Each thread has a `key` and its `events`: PRs, issues, Slack messages, meetings and docs, with short text.
`projects` lists the Linear projects the thread belongs to, when known.
The engineer works at `level`. Judge the work against that level. Label each thread once, using only what the events show.

## Fields

`title`: what the thread delivered or is about, in under 10 words. Use the events' own
words. No adjectives of praise.

`summary`: what they did, in one or two sentences and under 40 words. Past tense, no
subject ("Shipped soft-delete for exports: ..."). Facts and counts from the events only.
No praise, no judgment of impact. For a mention, say what the other person says the engineer did.

`mode`: the one kind of value that fits best.
- `clarify`: made a fuzzy problem clear. Proposals, decision docs, framing, scoping.
- `prevent`: stopped a bad outcome before it happened. A risk caught in review, a guard.
- `solve`: fixed a live problem. An incident, a bug, an unblock.
- `build`: shipped product or platform work.
- `elevate`: made other people better. Teaching reviews, mentoring, pairing, recognition.
- `external`: work outside the company. Open source upstream, talks, community.

`pillar`: from Tanya Reilly's *The Staff Engineer's Path*.
- `big`: big-picture thinking. Direction and strategy across teams.
- `exec`: project execution. Getting a hard thing done.
- `level`: leveling up others.

`routine`: true when the thread is not worth recording as impact, the way the engineer judged
`examples.routine` (access requests, small talk, a lone reply, a small PR with no wider
effect). False when it is like `examples.kept`. When unsure, false: they review it anyway.

`evidence`: the event ids that support `mode`. One to three.

Do not judge what would have happened without them. They write that themselves.

## Rules

A mention by someone else is about what they say the engineer did; quote it, do not add to it.
Write every field in English, even when the events are in another language.
Return one label per input thread, with its `key` unchanged.
Return only the structured output. Nothing else.
