---
name: collect-drive
description: Collect the Google Drive files you own that were created or changed in one ISO week, as JSON for owntrace. Read-only.
argument-hint: "<YYYY-MM-DD of the Monday>"
---

`$ARGUMENTS` is the Monday that starts the week. Collect facts, copy, never interpret.
Do not judge which files matter: the ingest step does that in code.

You are read-only. Never create, update, copy, share or trash a file.

## 1. Call

`search_files` with `excludeContentSnippets: true`, `pageSize: 100` and this query, where
START is `<Monday>T00:00:00Z` and END is `<next Monday>T00:00:00Z`:

`owner = 'me' and ((createdTime >= 'START' and createdTime < 'END') or (modifiedTime >= 'START' and modifiedTime < 'END'))`

Page with `pageToken` until no `nextPageToken` comes back or a page is empty.

## 2. Rows

One row per file, copied as returned. Pages can repeat a file: keep it once.
`mime_type` is `mimeType`, `created_time` is `createdTime`, `modified_time` is
`modifiedTime`, `url` is `viewUrl`.

An empty result is a valid answer: return `files: []`.

`pages_read` counts every call. `exhausted` is true only when the last page came back
without `nextPageToken` or empty.

Return only the structured output. Nothing else.
