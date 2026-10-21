# The React app

The views move to React one at a time. Both apps run in the same server, on the same API.

```
 /        ━▶ 📜 old app: app/index.html + app/js/*.js
 /next/   ━▶ ⚛️  React: web/*.tsx, bundled by Bun from web/index.html
              a view it does not have yet ━▶ the old app, same address
```

- **shadcn components** (`web/ui/`) with Tailwind. Their colors and fonts point at the app's
  tokens in `app/css/base.css`, so both apps share one palette, light and dark.
- **Same behaviour:** a view moves only when its specs pass on both apps (`bun run qa`).
- **Done here:** Goals, Setup. **Next:** Review, then Projects.
- Selects stay native: phone pickers, keyboard and `selectOption` in specs work as on any form.

A bundle error shows an empty page and no error, so `bun run qa` bundles `web/` first and
stops on the error.

Code: `web/main.tsx` (header and routes), `web/styles.css` (the token mapping), `web/ui/`, one
file per view.
