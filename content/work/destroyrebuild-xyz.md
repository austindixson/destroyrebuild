---
title: destroyrebuild.xyz
year: 2026
status: in progress
role: design & development
stack: Vite, TypeScript, Three.js
summary: A personal workshop on the web. Procedural sculpture, independent work, and an open build journal.
---

An independent founder’s portfolio should show how they think, not just what they’ve finished. This site is a place for the work and the work behind the work.

The homepage centers on 144 individual fragments that rebuild into three different forms: a hollow Monument, a ring-shaped Orbit, and a half-twisted Möbius loop. The pieces pull apart, drift, and find a new arrangement. The same orange pieces carry through each form: a visible thread through an ongoing reconstruction.

## The design constraint

Make the site feel alive without making the writing difficult to reach. The artwork sits beside the introduction; regular links take you to the portfolio, journal, and tutorials. A visitor should never have to solve a 3D navigation puzzle to read a post.

## Built from the material up

- **Three.js** for the custom geometry, deterministic concrete texture, lighting, and reconstruction cycle.
- **TypeScript** for the renderer lifecycle and a small History API router.
- **Markdown** for the content, compiled with the site rather than fetched from a CMS.
- **Vite + Caddy** for a static build with refresh-safe routes.

## Where the craft lives

The geometry is generated locally. There’s no downloaded scene or stock 3D model. Each fragment gets a slightly irregular cut; warm fracture edges appear as the structure breaks apart, then cool as the pieces settle. A moving rim light and an orange fill reveal the changing surfaces, while the camera eases back to give the scattered pieces room.

The quieter details matter too: reduced-motion support, a pause control, real links, readable article widths, and a renderer that stops while you’re reading.

## Still on the bench

More real project write-ups, more field notes, and video companions when they exist. YouTube and Patreon remain explicitly marked placeholders.
