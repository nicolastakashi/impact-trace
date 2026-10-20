---
name: collect-github
description: Collect your GitHub PRs and review comments received for one ISO week, as JSON for impact-trace. Read-only.
argument-hint: "<YYYY-MM-DD of the Monday> <LOGIN> <ORGS>"
---

`$ARGUMENTS` is the Monday that starts the week, your GitHub login (`LOGIN`), and your
company's GitHub orgs, comma-separated (`ORGS`, or `-` for none). Collect facts for that week. Copy, never interpret.
Quote titles and comment bodies exactly as written.

You are read-only. Only run `gh search prs` and `gh api` **GET** calls. Never pass
`-X`, `-f`, `-F` or `--input` to `gh api`; any of them turns the call into a write.

## 1. Window

`FROM` is the Monday, `TO` the Sunday six days later. `week` is the ISO week.

## 2. PRs

Merged in the window (`at` = `closedAt`):

```
gh search prs --author LOGIN --merged --merged-at FROM..TO --limit 200 \
  --json number,title,repository,url,closedAt,body
```

Opened in the window and still open (`at` = `createdAt`):

```
gh search prs --author LOGIN --created FROM..TO --state open --limit 200 \
  --json number,title,repository,url,createdAt,body
```

Drop every PR whose repository starts with `LOGIN/`. Those are side projects.
Keep upstream repositories (open source projects outside `ORGS`).

`linear_refs` are Linear identifiers such as `ACME-41` or `ACME-573` that appear in the
title or the body. Upper-case them. Do not copy the body itself.

## 3. Review comments received

For each merged PR in a repository owned by one of `ORGS`, read both:

```
gh api --paginate repos/<repo>/pulls/<number>/comments
gh api --paginate repos/<repo>/pulls/<number>/reviews
```

Keep comments and non-empty review bodies whose author is not `LOGIN` and does
not end in `[bot]`. Copy `body` verbatim and `html_url` as `url`.

## 4. Output

Return only the structured output. Nothing else.
