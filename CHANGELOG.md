# Changelog

Newest entries are first. Add a new heading. Do not change old entries.

## 2026-10-09 — PR #25 — YORK-12

- The lead package is the original 119,514-triangle mesh, meshopt compressed. The file is 6.8 MB. It was 13.6 MB.
- The nameplate and OptiView base color stay at 2048. The normal map and the metal-rough map are 1024.
- A selected fleet unit uses that full mesh. Other units use three instanced meshes: 51,080 triangles above 160 CSS pixels, the seam-safe 26,980-triangle mesh between the bands, and a 21,764-triangle mesh below the framed fleet.
- The 26,980-triangle mesh welds a vertex only when position, normal, and UV are the same. Borders stay locked. Painted vertices on the nameplate, OptiView, JCI mark, and panel stay locked. Permissive collapses stay on that pass. Without Permissive it stops near 52,000 triangles, the same place as the 51,080-triangle mesh.
- The 21,764-triangle mesh starts from that mid index buffer, keeps the same paint and seam locks, and simplifies again with borders locked and no Permissive. It stops at 21,764 triangles. The control panel, JCI mark, and OptiView stay on the face. `york-chiller/scripts/build-ymc2-lod.mjs` rebuilds the file from the original float mesh.
- A framed extra unit is about 61–74 CSS pixels at 18 units and 41–50 at 36, so those views stay on the 21,764-triangle mesh. That mesh holds until 96 CSS pixels and returns below 80. The 51,080-triangle mesh turns on above 160 CSS pixels and returns below 128.
- A desktop sample of the live trainer draws 126,212 triangles in 103 calls. The median frame time was 233 ms. The pixel ratio stops at 1.5.
- A real fleet of 18 units draws 496,200 triangles in 104 calls. The median frame time was 567 ms. All 17 extra units are on the 21,764-triangle mesh.
- A real fleet of 36 units draws 887,952 triangles in 104 calls. The median frame time was 850 ms. All 35 extra units are on the 21,764-triangle mesh.
- The CWS tag sits further right than the chilled-water stack, so it does not cover the ends of the CHWR, CHWS, and CWR leaders.
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
