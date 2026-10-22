---
name: collect-reviews
description: Collect every review you submitted on PRs others wrote, updated since a Monday, as JSON for owntrace. Read-only.
argument-hint: "<YYYY-MM-DD of the Monday> <LOGIN>"
---

`$ARGUMENTS` is a Monday (`FROM`) and your GitHub login (`LOGIN`). Copy, never interpret.
Do not filter by date: the ingest step puts each review in its week.

You are read-only. Only run `gh search prs` and `gh api` **GET** calls. Never pass
`-X`, `-f`, `-F` or `--input` to `gh api`; any of them turns the call into a write.

## 1. PRs you reviewed

```
gh search prs --reviewed-by LOGIN --updated ">=FROM" --limit 1000 \
  --json number,author,repository
```

Drop every PR whose author is `LOGIN`.

## 2. Your reviews on each PR

For every PR left, one call:

```
gh api --paginate repos/<repo>/pulls/<number>/reviews
```

Keep every review whose `user.login` is `LOGIN`. One row per review: `repo`, `number`,
the PR `author`, `state`, and `submitted_at` exactly as returned. Every PR has at least one
of your reviews. Reading only some PRs is the mistake that matters: the ingest counts them.

`from` is `FROM`. `prs_read` is the number of PRs you called step 2 for.

Return only the structured output. Nothing else.
