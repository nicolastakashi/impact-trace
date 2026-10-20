# Threads and projects

A PR, its Linear issue and the Slack message that asked for review are one piece of work.
A thread groups them, so you judge the work once, not each event.

```
 PR #101 ━━┓
 ACME-41 ━━╋━━▶ 🧵 one thread ━━▶ 📁 Export lifecycle
 "PTAL #101"┛    (strong + weak     (Linear, or Claude,
                  links)             or you)
```

## How events join

- **Strong links join.** A PR and the issues it cites, a review and its PR, a doc and itself.
  Then threads with the same main Linear project merge.
- **Issues that move on keep their pull.** An open issue lives in the latest week that saw it.
  A PR that cites it still goes to that issue's project, so a week does not split next Monday.
- **Weak links attach.** A Slack message or a meeting goes to the one thread it cites most,
  and never joins two threads: one "PTAL #1 #2 #3" would glue unrelated work.
- **Raw URLs do not join.** Agendas carry board and huddle links that would join everything.
- **Only real issue ids.** `ABC-12` counts only for Linear team keys seen in your issues, so
  `UTF-8` and `eu-west-1` are not issues.

## Which project

Firmest first: yours, then Linear's, then a `#internal-*` channel as a topic, then Claude's.
Claude (`assign-projects`, Sonnet) places only threads Linear leaves out, and uses each
project's own issue titles as its vocabulary. You can undo any placement in review, and merge
or delete projects on the Projects page.

**Check:** `evals/check-threads.sh` asks Claude how many threads mix unrelated work.

Code: `ingest/ingest.ts` (threads), `ingest/assign.ts`. Next: [review](review.md).
