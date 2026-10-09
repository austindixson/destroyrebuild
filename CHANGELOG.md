# Changelog

Newest entries are first. Add a new heading. Do not change old entries.

## 2026-10-09 — PR #25 — YORK-12

- The lead package is the original 119,514-triangle mesh, meshopt compressed. The file is 6.2 MB. It was 13.6 MB.
- The nameplate and OptiView base color stay at 2048. The normal map and the metal-rough map are 1024.
- A selected fleet unit uses that full mesh. Other units use a seam-locked 51,080-triangle mesh while they cover at least about 120 canvas pixels, and a 17,975-triangle mesh when they are smaller.
- The far mesh locks borders and weights normals and texture coordinates. It does not use Permissive mode. Vertices that already share a position are welded first, because a locked simplify of the split mesh stops near 51,080 triangles.
- The far mesh turns on below 100 canvas pixels and turns off above 140. Each level is one instanced draw.
- A desktop sample of the live trainer draws 126,212 triangles in 103 calls. Three frame-time samples were 340 ms, 358 ms, and 433 ms. The pixel ratio stops at 1.5.
- A real fleet of 18 units draws 431,787 triangles in 104 calls. Three frame-time samples were 525 ms, 642 ms, and 911 ms. All 17 extra units are on the far mesh.
- A real fleet of 36 units draws 755,337 triangles in 104 calls. Three frame-time samples were 821 ms, 917 ms, and 1,130 ms. All 35 extra units are on the far mesh.
- Pipe runs merge to one mesh per loop colour. Valves, flanges, gauges, and fans share shapes and materials.
- The desktop shadow map is 1024 and uses PCF. The package mesh receives that shadow. This Three.js release folded the old PCFSoft type into PCF.
- Fog density starts at 0.035 and falls with the fleet span (0.011 at 18 units, 0.0076 at 36).
- The floor grid grows to cover the bank. Each tag leader stays on the lead unit's pipe or part.
- A start or a stop recolors the instances. It does not move the camera.
- Occlusion stays requested until the throttled test runs. Tag fit runs when the camera or the reading changes.
- The lead machine keeps the nozzle pipes, the eight live tags, and the valve wheels.
- `?plantStats` exposes the scene only in a dev build.
- The boot tests drip the model at 6,500 bytes per second.
- `scripts/measure-york-plant.mjs` samples the live trainer.

## 2026-10-08 — PR #23 — FM-REBUILD-YORK-10

- The York trainer gives each text job one style: title, label, value, lesson, glossary, alert, button, or quiz prompt.
- The lesson words stay the same.
- Mint, amber, and rose stay in front of the value color on the KPIs, the pipe delta P, and the chaos line.
- The active loop step uses title ink on a solid disc. The contrast stays above 4.5:1.
- The valve alert heading uses alert ink. The explanation uses body ink.
- The head KPI test waits until the color is amber or rose.
- Sim tests write each bundle in a private temporary directory.
- The sim test script deletes that directory after the run. It also deletes the directory after a failure.
- The valve alert paint function stays small. One helper writes the text. One helper keeps the glossary focus.
- Shift frequency labels use grey label ink. They do not use amber.
- A new test checks that status color stays in front of value color on the KPIs, the pipe delta P, and the chaos line.
- A new test checks that the active loop step uses title ink on the solid disc.
