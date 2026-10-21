# The React app

One page, `web/index.html`, bundled by Bun when the server starts. One file per view in `web/`.

- **shadcn components** (`web/ui/`) with Tailwind. Their colors and fonts point at the app's
  tokens in `web/base.css`, light and dark.
- Selects stay native: phone pickers, keyboard and `selectOption` in specs work as on any form.
- The server bundles once at start: restart it after an edit.

A bundle error shows an empty page and no error, so `bun run qa` bundles `web/` first and
stops on the error.

Code: `web/main.tsx` (header and routes), `web/styles.css` (the token mapping), `web/ui/`, one
file per view.
