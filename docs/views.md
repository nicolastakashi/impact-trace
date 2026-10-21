# North, Trace and Projects

All three read the threads you kept in review, the last 8 weeks. The server builds them on
each load (`/data.js`), so a decision in review shows on the next reload. Before your first
review they show fictional example data, marked "example".

## North

One question per band, read top to bottom.
- **Where the work goes:** threads per week, stacked by [goal](goals.md), with a table of
  totals. A thread that serves two goals counts once, in the goal served most, so each bar
  adds up to its week. Before you write any goal, your top 3 projects stand in.
- **How you delivered:** threads by mode, your "without you" answers as parts of one whole,
  and reviews given per week against your average.
- **Recognition:** praise that names your work, one in focus, the rest one click away.
  Claude sorts every Slack mention of you (praise, ask, information, bot); a bare "thanks"
  is not praise. Code keeps praise only when its quote is in the message. "Not recognition"
  corrects Claude; your correction stays and goes to Claude as an example next time.
- **Who comes to you:** the people who asked you for a review, a decision or an answer, and
  about what. It shows where your opinion is sought.
- **This week:** the current feedback experiment, and threads still waiting for review.

## Trace

Your weeks shown the way a tracing tool shows a request.

| Trace view | Your work |
|---|---|
| trace | one week |
| span | one thread |
| span event | a PR merged, a review, a message |

Drag on the heatmap to pick weeks. Play replays the week in time order. The URL keeps the
week and the span, so a link opens the same view.

## Projects

Each Linear project and topic with its threads per week. Merge two projects, split one back
out, or move a thread to another project. A merged project keeps pointing to the one it went
into, so old links still open.

Code: `app/server.ts` (`north()`), `app/js/north.js`, `app/js/trace.js`, `app/js/projects.js`. Images: [north](north.jpg),
[trace](trace.jpg), [projects](projects.jpg).
