---
name: collect-requests
description: Collect who asked for reviews on PRs where you were asked or reviewed, updated since a Monday, as JSON for impact-trace. Read-only.
argument-hint: "<YYYY-MM-DD of the Monday> <LOGIN> [UPDATED]"
---

`$ARGUMENTS` is a Monday (`FROM`), your GitHub login (`LOGIN`) and, only to collect history
in parts, a range of last update (`UPDATED`, such as `2026-09-28..2026-09-28`). Copy, never interpret.
Do not filter by date, by reviewer or by team: the ingest step does that.

You are read-only. Only run `gh search prs` and `gh api` **GET** calls. Never pass
`-X`, `-f`, `-F` or `--input` to `gh api`; any of them turns the call into a write.

## 1. PRs

Run both and keep each PR once. With `UPDATED`, use `--updated "UPDATED"` in both instead.

```
gh search prs --review-requested LOGIN --updated ">=FROM" --limit 1000 --json number,author,repository
gh search prs --reviewed-by LOGIN --updated ">=FROM" --limit 1000 --json number,author,repository
```

Drop every PR whose author is `LOGIN`.

## 2. Review requests on each PR

For every PR left, one call:

```
gh api --paginate repos/<repo>/issues/<number>/timeline \
  --jq '.[]|select(.event=="review_requested" and .created_at >= "FROM")|{at:.created_at, reviewer:(.requested_reviewer.login // "team:<org>/\(.requested_team.slug)"), requester:.review_requester.login}'
```

`<org>` is the part of `<repo>` before the `/`. Each line it prints is one row of `requests`,
copied as is. Most PRs print a few lines, and many print none.

`prs` has one entry per PR you called step 2 for, with its `repo`, `number`, the PR `author`,
and its `requests` (an empty list when it has none). Reading only some PRs is the mistake
that matters: the ingest counts them.

`from` is `FROM`. Return only the structured output. Nothing else.
