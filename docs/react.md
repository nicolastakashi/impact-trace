# The React app

The views move to React one at a time. Both apps run in the same server, on the same API.

```
 /        ━▶ 📜 old app: app/index.html + app/js/*.js
 /next/   ━▶ ⚛️  React: web/*.tsx, bundled by Bun from web/index.html
              a view it does not have yet ━▶ the old app, same address
```

- **Same look:** `web/` uses the same `app/css/` files and class names. Screenshots of both apps
  were compared pixel by pixel on the fixture, at 1280 and 400 px wide. What differs is focus
  and scroll: React keeps the button you clicked, the old app redraws it.
- **Same behaviour:** a view moves only when its specs pass on both apps (`bun run qa`).
- **Done here:** Goals, Setup. **Next:** Review, then Projects.
- When a view needs a component library piece (a dialog, a command menu), shadcn comes in then.

A bundle error shows an empty page and no error, so `bun run qa` bundles `web/` first and
stops on the error.

Code: `web/main.tsx` (header and routes), `web/lib.tsx`, one file per view.
