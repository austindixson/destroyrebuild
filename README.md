# DESTROY / REBUILD

Personal **portfolio + blog** for [destroyrebuild.xyz](https://destroyrebuild.xyz) — the captain’s #solofounder build-in-public world.

This is **not** Super Notch / supernotch.ai. Separate site, separate work, separate voice.

Bespoke Three.js. Custom procedural structure, shaders, and a destroy → rebuild idle loop. Not a blog theme, Notion export, or generic Tailwind marketing page.

## Stack

- [Vite](https://vitejs.dev/) + TypeScript
- [Three.js](https://threejs.org/) (vanilla — no React / R3F on this slice)
- Markdown content compiled at build time (`import.meta.glob`)
- [marked](https://github.com/markedjs/marked) for ship-log / tutorial bodies

## Destinations

Navigation lives in the WebGL world as clickable slabs (keyboard `1` `2` `3` and Esc also work):

| Path | Surface |
| --- | --- |
| `/` | Living world — procedural tower + idle crack / reform cycle |
| `/portfolio` | Work showcase (markdown in `content/work/`) |
| `/blog` | Ship-log list (`content/logs/`) |
| `/blog/:slug` | Single log |
| `/tutorials` | Tutorial list (`content/tutorials/`) |
| `/tutorials/:slug` | Tutorial + accompanying YouTube slot |
| `/youtube` | External channel — **placeholder only** |
| `/patreon` | External patron page — **placeholder only** |

YouTube and Patreon use tokens, not invented handles:

- `PLACEHOLDER_YOUTUBE_URL`
- `PLACEHOLDER_PATREON_URL`

Defined in `src/config.ts`. Replace those strings when the real URLs exist.

## Scripts

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # tsc --noEmit && vite build
npm run preview   # serve the production build
```

## Project layout

```
content/
  logs/          daily ship logs (markdown + frontmatter)
  tutorials/     lessons; each pairs with a YouTube video URL
  work/          portfolio entries
src/
  world/         Three.js scene, procedural core, destinations, shaders
  content/       markdown catalog
  ui/            industrial HUD plates (world stays the primary surface)
  router.ts      History API routes
```

## Content frontmatter

**Ship log** — `title`, `date`, `session`, `commits`, `tools`, `mood`

**Tutorial** — `title`, `date`, `video` (`PLACEHOLDER_YOUTUBE_URL` until real), `duration`, `level`

**Work** — `title`, `year`, `status`, `role`, `stack`, `summary`

## Domain / deploy

DNS and production hosting for destroyrebuild.xyz are out of scope for this first slice. `npm run build` emits static files in `dist/`.
