---
name: suggest-labels
description: Suggest impact labels for one week of Nicolas's work threads, as JSON for impact-trace. Suggestions only; he decides.
argument-hint: "<YYYY-WNN>"
---

The input is a JSON list of work threads for week `$ARGUMENTS`. Each thread has a `key`
and its `events`: PRs, issues, Slack messages, meetings and docs, with short text.
Nicolas is a Principal Engineer. Label each thread once, using only what the events show.

## Fields

`title`: what the thread delivered or is about, in under 10 words. Use the events' own
words. No adjectives of praise.

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

`evidence`: the event ids that support `mode`. One to three.

Do not judge what would have happened without him. He writes that himself.

## Rules

A mention by someone else is about what they say he did; quote it, do not add to it.
Return one label per input thread, with its `key` unchanged.
Return only the structured output. Nothing else.
