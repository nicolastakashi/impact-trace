---
name: collect-github
description: Collect Nicolas's GitHub PRs, reviews given and review comments received for one ISO week, as JSON for impact-trace. Read-only.
argument-hint: "<YYYY-MM-DD of the Monday>"
---

Collect facts for the week that starts on Monday `$ARGUMENTS`. Copy, never interpret.
Quote titles and comment bodies exactly as written.

You are read-only. Only run `gh search prs` and `gh api` **GET** calls. Never pass
`-X`, `-f`, `-F` or `--input` to `gh api`; any of them turns the call into a write.

## 1. Window

`FROM` is the Monday, `TO` the Sunday six days later. `week` is the ISO week.

## 2. PRs

Merged in the window (`at` = `closedAt`):

```
gh search prs --author nicolastakashi --merged --merged-at FROM..TO --limit 200 \
  --json number,title,repository,url,closedAt,body
```

Opened in the window and still open (`at` = `createdAt`):

```
gh search prs --author nicolastakashi --created FROM..TO --state open --limit 200 \
  --json number,title,repository,url,createdAt,body
```

Drop every PR whose repository starts with `nicolastakashi/`. Those are side projects.
Keep upstream repositories (prometheus, perses, open-telemetry and others).

`linear_refs` are Linear identifiers such as `ACME-41` or `ACME-573` that appear in the
title or the body. Upper-case them. Do not copy the body itself.

## 3. Reviews given

```
gh search prs --reviewed-by nicolastakashi --updated FROM..TO --limit 200 \
  --json number,author,repository
```

`reviews_given` is the number of rows whose author is not `nicolastakashi`.

## 4. Review comments received

For each merged PR in a `dash0hq/` repository, read both:

```
gh api --paginate repos/<repo>/pulls/<number>/comments
gh api --paginate repos/<repo>/pulls/<number>/reviews
```

Keep comments and non-empty review bodies whose author is not `nicolastakashi` and does
not end in `[bot]`. Copy `body` verbatim and `html_url` as `url`.

## 5. Output

Return only the structured output. Nothing else.
