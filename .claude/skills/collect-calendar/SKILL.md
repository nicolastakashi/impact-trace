---
name: collect-calendar
description: Collect your Google Calendar events for one ISO week, as JSON for impact-trace. Read-only.
argument-hint: "<YYYY-MM-DD of the Monday>"
---

`$ARGUMENTS` is the Monday that starts the week. Collect facts, copy, never interpret.
Do not judge which events matter: the ingest step does that in code.

You are read-only. Never create, update, delete or respond to an event.

## 1. Call

`list_events` on the primary calendar with `startTime: "<Monday>T00:00:00"`,
`endTime: "<next Monday>T00:00:00"`, `orderBy: "startTime"`, `pageSize: 250`.
Page with `pageToken` until no `nextPageToken` comes back.

## 2. Rows

One row per event the tool returns. Copy every row, declined and cancelled included.

- `start`, `end`: the `dateTime` value as returned, or the `date` for all-day events.
- `event_type`: `eventType` as returned (`DEFAULT`, `FOCUS_TIME`, `OUT_OF_OFFICE`, ...).
- `organizer`: the organizer email.
- `my_response`: the `responseStatus` of the attendee with `self: true`. If there are no
  attendees, `organizer`.
- `attendees`: every attendee email, yourself included. Empty when there are none.
- `recurring`: true when `recurringEventId` is present.
- `urls`: every `attachments[].fileUrl`, then every `href` in `description`, copied
  exactly. Empty when there is none. Do not copy the description text.

`pages_read` counts every call. `exhausted` is true only when the last page came back
without `nextPageToken`.

Return only the structured output. Nothing else.
