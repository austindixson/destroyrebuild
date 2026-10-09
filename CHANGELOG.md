# Changelog

Newest entries are first. Add a new heading. Do not change old entries.

## 2026-10-09 — PR #25 — YORK-12c

- The lead machine stays the full 119,514-triangle mesh. A selected fleet unit switches to that same mesh.
- Other fleet units use a seam-locked 51,080-triangle mesh inside 14 units. They use a 7,963-triangle mesh past 20 units. Between those distances the unit keeps its current level.
- The far mesh locks borders. Permissive mode is only on that far mesh, because a locked simplify stops near 51,080 triangles. Distant units do not draw a nameplate.
- Each level is one instanced draw. The focused unit is its own mesh, so the draw count stays at one extra call.
- The package file is 6.2 MB. It holds the full mesh and both levels, meshopt compressed. The nameplate and OptiView base color stay at 2048.
- A desktop sample of the live trainer still draws 126,212 triangles in 103 calls. The frame time averaged 281 ms (3.6 FPS). The pixel ratio stops at 1.5.
- A real fleet of 18 units draws 261,583 triangles in 104 calls. The frame time averaged 454 ms. All 17 extra units are on the far mesh.
- A real fleet of 36 units draws 404,917 triangles in 104 calls. The frame time averaged 571 ms. All 35 extra units are on the far mesh.
- Selecting one extra unit in the 18-unit bank draws 373,134 triangles in 105 calls. The same selection in the 36-unit bank draws 516,468 triangles in 105 calls.
- Those framed fleets were 2,157,950 triangles at 1,767 ms and 4,309,202 triangles at 3,205 ms in the YORK-12b entry below.

## 2026-10-09 — PR #25 — YORK-12b

- Locked simplification cannot pass about 51,000 triangles without Permissive mode, so the lead package is the original 119,514-triangle mesh again.
- meshopt compresses that mesh. The file is 5.2 MB. It was 13.6 MB.
- The nameplate and OptiView base color stay at 2048. The normal map and the metal-rough map are 1024.
- A desktop sample of the live trainer draws 126,212 triangles in 103 calls. The frame time averaged 281 ms (3.6 FPS). The pixel ratio stops at 1.5.
- Heap growth over two seconds of that sample was 74,421 bytes.
- A real fleet of 18 units draws 2,157,950 triangles in 104 calls. The frame time averaged 1,767 ms. A fleet of 36 units draws 4,309,202 triangles in 104 calls. The frame time averaged 3,205 ms. The geometry count stays 43.
- Fog density starts at 0.035 and falls with the fleet span (0.011 at 18 units, 0.0076 at 36).
- The floor grid grows to cover the bank. The eight tags spread across the bank instead of stacking on the lead unit.
- A start or a stop recolors the instances. It does not move the camera.
- Occlusion stays requested until the throttled test runs.
- The desktop shadow map is 1024 and uses PCF. This Three.js release folded the old PCFSoft type into PCF.
- `?plantStats` exposes the scene only in a dev build.
- The 20 second boot test drips the model at 6,500 bytes per second, same as the 180 second test.
- `scripts/measure-york-plant.mjs` is the live-trainer sampler used for these numbers.

## 2026-10-09 — PR #25 — YORK-12

- The plant package drops from 119,514 triangles and 13.6 MB to 9,473 triangles and 1.3 MB.
- A desktop sample of the live trainer, before this change, drew 132,140 triangles in 171 calls. The frame time averaged 340 ms (2.9 FPS) at pixel ratio 2 with shadows on.
- The same camera after this change draws 16,171 triangles in 103 calls. The frame time averaged 123 ms (8.1 FPS). The pixel ratio stops at 1.5.
- The frame keeps 43 geometries and 33 materials. It had 163 geometries and 101 materials.
- Pipe runs merge to one mesh per loop colour. Valves, flanges, gauges, and fans share shapes and materials.
- The shadow map is 512 and basic. One box casts the floor shadow. The package mesh does not receive it.
- Tag fit and occlusion run when the camera or the reading changes. They do not run on every fan frame.
- Heap growth over two seconds of that sample drops from 1,583,141 bytes to 16,448 bytes.
- The lead machine keeps the nozzle pipes, the eight live tags, and the valve wheels.
- A real fleet of 18 units draws 177,212 triangles in 104 calls. A fleet of 36 units draws 347,726 triangles in 104 calls. The geometry count stays 43.
- The 180 second boot test drips the smaller model file so the cap still fires while the percent moves.
- `scripts/measure-york-plant.mjs` samples that live trainer. The 9,473-triangle mesh is replaced in the YORK-12b entry above.

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
