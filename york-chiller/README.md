<img src="assets/icon.svg" width="64" height="64" alt="">

# YMC² Data Center Operator Trainer

Interactive trainer for YORK YMC² magnetic-bearing centrifugal chillers in a **mission-critical data center** central plant.

## Features

- **Data Center Plant** — IT → CRAH/CDU → CHW → YMC² → towers → BMS/NOC
- **3D Plant Room** — procedural Three.js model with N+1 ghost chiller, CHW/CW headers, cable trays
- **MOP start / stop** — redundancy and change-control before production work
- **OptiView lab** — warmer CHW setpoints, NOC page sim, message classes
- **Match icons**, **10-question quiz**, **incident drills** (weather, ATS landings, hall-hot/chiller-idle, failover, BMS fight)
- **Shift check deck** for 24/7 rounds
- Progress + XP in `localStorage`

Themes align with Johnson Controls forms **160.84-OM1** / **160.78-O1** plus data-center operating discipline. Not a substitute for site SOPs or certified service.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Build

```bash
npm run build
npm run preview
```
