# DESTROY / REBUILD

Personal **portfolio + blog** for [destroyrebuild.xyz](https://destroyrebuild.xyz) — the captain’s #solofounder build-in-public world.

This is **not** Super Notch / supernotch.ai. Separate site, separate work, separate voice.

Bespoke Three.js with a ground-up industrial editorial direction. A 144-fragment, procedurally textured monument destroys and rebuilds beside oversized typography. Olive-black, warm paper, safety orange, and custom geometric illustrations form one visual system.

## Stack

- [Vite](https://vitejs.dev/) + TypeScript
- [Three.js](https://threejs.org/) (vanilla — no React / R3F on this slice)
- Markdown content compiled at build time (`import.meta.glob`)
- [marked](https://github.com/markedjs/marked) for ship-log / tutorial bodies

## Destinations

Navigation uses real, keyboard-accessible links with History API transitions, active states, document titles, and focus management. Reading pages stop the WebGL loop.

| Path | Surface |
| --- | --- |
| `/` | Editorial workshop + interactive reconstruction monument |
| `/portfolio` | Work showcase (markdown in `content/work/`) |
| `/portfolio/:slug` | Individual project write-up |
| `/blog` | Ship-log list (`content/logs/`) |
| `/blog/:slug` | Single log |
| `/tutorials` | Tutorial list (`content/tutorials/`) |
| `/tutorials/:slug` | Tutorial + accompanying YouTube slot |
| `/youtube` | External channel — **placeholder only** |
| `/patreon` | External patron page — **placeholder only** |

YouTube and Patreon use tokens, not invented handles:

- `PLACEHOLDER_YOUTUBE_URL`
- `PLACEHOLDER_PATREON_URL`

Defined in `src/config.ts`. The local placeholder pages intentionally don’t link out. When real destinations exist, update the tokens **and** wire external anchors; tutorial embeds likewise require a real video URL and implementation.

## Artwork & accessibility

- Click **Break the structure** to interrupt the idle cycle.
- **Pause motion** holds a static composition; `prefers-reduced-motion` starts paused.
- Rendering sleeps on reading routes, offscreen, and in hidden tabs.
- WebGL failure leaves the complete HTML navigation and content usable.
- Native links support opening in a new tab; a skip link and visible focus indicators support keyboard navigation.
- Desktop, tablet, and mobile layouts give the sculpture its own space.
- Sample archive/project entries are explicitly labeled. The tutorial describes the current renderer.

The Google Fonts stylesheet loads Barlow, Barlow Condensed, and IBM Plex Mono, with local CSS fallbacks. All geometry and texture data are generated in the app; there are no downloaded models.

## Scripts

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # tsc --noEmit && vite build
npm run preview   # serve the production build
```

## Verification

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

The browser suite runs against the production preview. It covers collection/article navigation and refresh, history, placeholders, missing entries, reduced motion and sleeping render loops, WebGL failure, keyboard focus, axe accessibility checks, and overflow at five viewport widths.

## Project layout

```
content/
  logs/          daily ship logs (markdown + frontmatter)
  tutorials/     lessons; each pairs with a YouTube video URL
  work/          portfolio entries
src/
  world/         Three.js lifecycle, lighting, procedural fragments and concrete
  content/       markdown catalog
  ui/            editorial homepage, collection indexes, article and placeholder pages
  router.ts      History API routes
```

## Content frontmatter

**Ship log** — `title`, `date`, `session`, `commits`, `tools`, `mood`

**Tutorial** — `title`, `date`, `video` (`PLACEHOLDER_YOUTUBE_URL` until real), `duration`, `level`

**Work** — `title`, `year`, `status`, `role`, `stack`, `summary`

## Domain / deploy

`npm run build` emits the static SPA in `dist/`.

**Railway** (Railpack, default): connect this repo. Railpack runs `npm ci` / install, then `npm run build`, then serves `dist/` with [Caddy](https://caddyserver.com/). `Caddyfile` rewrites unknown paths to `index.html` so client-side routes (`/portfolio`, `/blog`, `/tutorials`, …) work on refresh. `railway.toml` pins the Railpack builder and build command. Do not add a `start` script — Railpack would then skip Caddy SPA mode.

**Nixpacks** (if the service builder is switched): `nixpacks.toml` adds Caddy and starts the same `Caddyfile`.

DNS for destroyrebuild.xyz is out of scope here — attach a Railway domain in the dashboard when you deploy.
