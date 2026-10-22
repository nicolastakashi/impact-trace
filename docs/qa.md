# QA

Specs that click through the app the way you do, on fictional data.

```
 bun run qa ━▶ 🧪 qa/fixture.ts builds a fictional DB with the real ingest code
            ━▶ 🌐 a server on :4390 with IMPACT_DATA=qa/.data/live
            ━▶ ✅ Playwright in your Chrome, the fixture restored before each test
```

- **Fictional data only.** Riley Chen at ACME. The weeks are the last 4 up to today, so "this
  week" and "this quarter" always exist.
- **Find things the way people do:** by role, label and text, never by CSS class.
- **A console error fails the test,** and so does a page file that does not load. A refused
  API call does not: specs check those.
- **Names:** ESLint runs first and fails on a one-letter name. Words: [glossary](glossary.md).
- **Your Chrome,** not a downloaded browser (`channel: "chrome"`).

Report: `qa/report/`. A failed test keeps a trace: `bunx playwright show-trace <file>`.

Code: `qa/fixture.ts`, `qa/helpers.ts`, `qa/*.spec.ts`, `qa/playwright.config.ts`.
