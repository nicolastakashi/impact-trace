# North, Trace and Projects

All three read the threads you kept in review, the last 8 weeks. The server builds them on
each load (`/data.js`), so a decision in review shows on the next reload. Before your first
review they show fictional example data, marked "example".

## North

Your week on one screen.
- **Rings:** your [goals](goals.md), most served first, plus "serves no goal". Before you write
  any goal, your top 3 projects stand in.
- **Without you:** your own answers from review: wouldn't happen, slower, same.
- **Highlight:** one thread from the last week. It prefers one you said would not happen
  without you, and one with praise someone wrote.
- **Try this week:** the current feedback experiment, unless you passed on it.

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

Code: `app/server.ts` (`north()`), `app/index.html`. Images: [north](north.jpg),
[trace](trace.jpg), [projects](projects.jpg).
