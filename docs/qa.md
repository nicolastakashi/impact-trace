# QA

Specs that click through the app the way you do, on fictional data. They are how the move to
React stays safe: each spec passes on the old app first, then on the new one.

```
 bun run qa ━▶ 🧪 qa/fixture.ts builds a fictional DB with the real ingest code
            ━▶ 🌐 a server on :4390 with IMPACT_DATA=qa/.data/live
            ━▶ ✅ Playwright in your Chrome, the fixture restored before each test
```

- **Fictional data only.** Riley Chen at ACME. The weeks are the last 4 up to today, so "this
  week" and "this quarter" always exist.
- **Find things the way people do:** by role, label and text, never by CSS class. The same
  spec then runs on both apps.
- **A console error fails the test,** and so does a page file that does not load. A refused
  API call does not: specs check those.
- **Two apps, one spec.** Project `old` runs every spec on `/`, project `next` runs the specs of
  the views React has on `/next/`. A spec that lands in the old app from `/next/` fails.
- **Your Chrome,** not a downloaded browser (`channel: "chrome"`).

Report: `qa/report/`. A failed test keeps a trace: `bunx playwright show-trace <file>`.

Code: `qa/fixture.ts`, `qa/helpers.ts`, `qa/*.spec.ts`, `qa/playwright.config.ts`.
