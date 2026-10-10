# RAG Source Ingest Queue: YORK YMC² Trainer

**Purpose:** Ranked prioritization of source ingestion for LLM grounding  
**Strategy:** Tier sources by training value, access friction, and dependency order  
**Updated:** October 2026

---

## MUST-HAVE (Tier 1: Foundational — Ingest First)

These sources are essential for basic operator competency on YMC² operation, facility design context, and industry standards. Ingest in dependency order.

### 1. Form 160.78-O1 — YMC² Operations & Maintenance Manual
- **URL:** https://docs.johnsoncontrols.com/chillers/v/u/YORK/en-US/YMC2-Mod-A-Centrifugal-Chiller-with-OptiView-Control-Center-Unit-Operation-Guide/425
- **Access:** ✓ Public PDF (verified)
- **Why First:** Defines daily operator procedures, safety controls, maintenance intervals, troubleshooting. Core reference for shift checks, incident response, and post-maintenance startup.
- **Ingest Scope:** Full PDF; focus on sections: System Components, Safety Controls, Operating Procedures, Shutdowns/Alarms, Daily/Seasonal Maintenance, Emergency Procedures.
- **Estimated Pages:** ~100–150 pages
- **RAG Tags:** operation, safety, LCHLT, water treatment, refrigerant charge, leak testing, condenser water, compressor monitoring, oil analysis
- **Training Use:** Shift-check deck, incident drills, maintenance coordination, troubleshooting assistant

---

### 2. Form 160.78-O2 — OptiView Control Center & VSD Operation Manual
- **URL:** https://www.manualslib.com/manual/1561966/York-Optiview.html (or primary JCI portal)
- **Access:** ✓ Public PDF (verified)
- **Why Second:** Operator-facing control-center manual. Explains LCD screens, setpoint adjustment, VSD details, motor speed/frequency, power factor, temperature/pressure readings, and message interpretation.
- **Ingest Scope:** Full; focus on: Introduction, Screen Navigation, VSD Details, Motor Monitoring, Setpoint Configuration, Display Messages, Pre-rotation Vane Operation.
- **Estimated Pages:** ~150–200 pages
- **RAG Tags:** OptiView, LCD display, VSD, IGV position, frequency, current limit, power factor, surge margin, status messages, alarms, language selection
- **Training Use:** NOC simulation, operator training on display interpretation, real-time diagnostics, remote-support troubleshooting

---

### 3. ASHRAE 90579-2021 — Thermal Guidelines for Data Processing Environments (Reference Card + Excerpts)
- **URL:** https://www.ashrae.org/file%20library/technical%20resources/bookstore/supplemental%20files/therm-gdlns-5th-r-e-refcard.pdf (reference card — free)
- **Full URL (mirror):** https://haganerack.com/wp-content/uploads/2026/02/ASHRAE-90579-2021.pdf (full PDF — use if accessible)
- **Access:** ✓ Reference card public; full PDF archived mirrors available
- **Why Third:** Industry standard for facility design (air-inlet environmental class, LCHLT targets, humidity limits). Establishes baseline operating conditions and design rationale.
- **Ingest Scope:** Reference card (essential); full edition preferred. Focus on: Environmental Class Definitions (A1–A4, H1), Recommended vs. Allowable Ranges, Liquid-Cooled Equipment, Energy Efficiency Guidance.
- **Estimated Pages:** Reference card 2–4 pages; full edition 100+ pages (use excerpts)
- **RAG Tags:** ASHRAE TC 9.9, environmental class, dry-bulb, wet-bulb, dew-point, humidity, LCHLT target, liquid cooling, measurement methodology
- **Training Use:** Facility design context, why chiller setpoint matters, economizer decision thresholds, compliance explanation

---

### 4. Form 160.78-N1 — YMC² Installation & Reassembly Manual
- **URL:** https://docs.johnsoncontrols.com/chillers/api/khub/documents/5nRUX8MbEJ92R66osxPmSg/content
- **Access:** ✓ Public PDF (verified)
- **Why Fourth:** Installation sequence, chiller assembly order, rigging requirements, startup checklist. Essential for commissioning, retrofit, and chiller replacement scenarios.
- **Ingest Scope:** Full; focus on: Overview, Preliminary Steps, Rigging, Field Assembly (if dismantled), Isolator Installation, Piping/Wiring Connections, Startup Checklist, Dimensions/Weights.
- **Estimated Pages:** ~100–120 pages
- **RAG Tags:** YMC², Mod A, installation, rigging, waterbox, evaporator, condenser, isolators, wiring, startup, refrigerant charge, LCHLT setpoint, initial filling
- **Training Use:** Commissioning trainer scenario, change-control walkthrough, new-unit deployment, field assembly supervision

---

### 5. DOE Best Practices Guide for Energy-Efficient Data Center Design (July 2024)
- **URL:** https://www.energy.gov/sites/default/files/2024-07/best-practice-guide-data-center-design.pdf
- **Access:** ✓ Public PDF (verified)
- **Why Fifth:** Current best-practice cooling design (chiller selection, air/water-side economizers, liquid cooling). Establishes modern facility context for chiller operation.
- **Ingest Scope:** Focus on: Section 5 (Cooling Systems) — Direct Expansion, Water-Side Economizer, Liquid Cooling, Part-Load Performance, Metrics/Benchmarking, Controls. Skim IT energy, renewal energy sections.
- **Estimated Pages:** ~40–60 relevant pages (out of ~90 total)
- **RAG Tags:** economizer, water-side economizer, plate heat exchanger, free cooling, chiller staging, COP, part-load, wet-bulb, 50°F DBT / 45°F WBT, PUE, DCiE
- **Training Use:** Facility design rationale, economizer logic, chiller staging, efficiency optimization, metering/KPI context

---

### 6. Form 160.00-AD5 — Water Materials Application Guide for Chiller Water Quality
- **URL:** https://docs.johnsoncontrols.com/chillers/api/khub/documents/aiaQkOHch2IM1Um9TQ3FXg/content
- **Access:** ✓ Public PDF (verified)
- **Why Sixth:** Waterbox material selection, water treatment, corrosion/fouling prevention. Critical for maintenance troubleshooting and chiller reliability.
- **Ingest Scope:** Focus on: Water Quality Specification Limits, Condenser Water Treatment, Evaporator (Closed Loop) Treatment, Tube Material Selection, Fouling Prevention, Cycles of Concentration, Filtration Strategy, Cycles of Concentration.
- **Estimated Pages:** ~50–70 pages
- **RAG Tags:** waterbox, tube material (copper, titanium, stainless), corrosion, scale, fouling, water treatment, pH, chlorides, cycles of concentration, sacrificial anode, filtration
- **Training Use:** Maintenance troubleshooting (fouling diagnosis), water-treatment coordination, tube-cleaning procedures, chiller reliability context

---

### 7. Peterson Engineers: Avoiding Centrifugal Chiller Surge
- **URL:** https://s3.us-east-1.amazonaws.com/p2s-production/uploads/2018-11-Engineers-Notebook_Peterson_Avoiding-Centrifugal-Chiller-Surge.pdf
- **Access:** ✓ Public PDF (verified)
- **Why Seventh:** Practical guide to surge prevention and control logic. Essential operator awareness: what surge is, why it's bad, how control systems prevent it.
- **Ingest Scope:** Full; all sections. Focus on: Surge Definition & Consequences, Inlet Guide Vane Control, Variable Speed Control, Surge-Prevention Strategy, Load Staging Rules, Hot-Gas Bypass Limits (ASHRAE 90).
- **Estimated Pages:** ~10–15 pages
- **RAG Tags:** surge, IGV, variable speed, lift, capacity control sequence, low-load operation, motor current, stall, hot-gas bypass, ASHRAE 90 limits
- **Training Use:** Operator safety awareness, control-logic explanation, incident drill (surge detection/recovery), low-load operation guidance

---

## STRONGLY RECOMMENDED (Tier 2: Context & Operations — Ingest After Tier 1)

High-value sources that deepen operator understanding and support advanced scenarios. Sequencing priority within tier.

### 8. EPA ENERGY STAR: Top 12 Ways to Decrease Data Center Energy Consumption
- **URL:** https://www.energystar.gov/sites/default/files/tools/DataCenter-Top12-Brochure-Final.pdf
- **Access:** ✓ Public PDF (verified)
- **Why:** Quick-reference efficiency measures (blanking panels, air-side/water-side economizers, higher inlet temps, fan VFDs). Operator-friendly guidance for energy optimization.
- **Ingest Scope:** Full; brief document (~8 pages). All sections equally important.
- **Estimated Pages:** ~8 pages
- **RAG Tags:** economizer, blanking panel, hot/cold aisle, fan VFD, LCHLT increase, water-side economizer, energy savings, payback period
- **Training Use:** Shift briefing on efficiency levers, quick-win identification, energy-cost context, operator-led optimization ideas

---

### 9. Trane: Water-Side Economizer Design Strategies
- **URL:** https://elibrary.tranetechnologies.com/public/commercial-hvac/Literature/White%20Paper/DC-WPR006A-EN_06302026.pdf
- **Access:** ✓ Public PDF (verified)
- **Why:** Detailed engineer-level guidance on economizer operation modes (full, hybrid, bypass) and integration with chiller. Critical for understanding seasonal operation.
- **Ingest Scope:** Full; focus on: Full Free Cooling, Hybrid Cooling, Economizer Bypass, Heat-Exchanger Design, Chiller Staging, ASHRAE 90.4 Compliance, Simultaneous Operation.
- **Estimated Pages:** ~12–15 pages
- **RAG Tags:** water-side economizer, plate heat exchanger, approach, full free cooling, hybrid cooling, economizer bypass, chiller staging, shoulder season, integrated operation
- **Training Use:** Seasonal operation logic, economizer engagement decision (wet-bulb threshold), troubleshooting economizer faults, efficiency scenario planning

---

### 10. Form 160.00-O4 — OptiSpeed / VSD Operation Manual (Optional but Valuable)
- **URL:** https://docs.johnsoncontrols.com/chillers/api/khub/documents/xk5ADqM8YJbLDHchGfmfsg/content
- **Access:** ✓ Public PDF (verified)
- **Why:** Covers variable-speed drive operation, harmonic filtering, and adaptive capacity control. Helps explain why chiller speed changes and how inverter works.
- **Ingest Scope:** Focus on: VSD Overview, Model Types, Capacity Control, Harmonic Filter, Motor Protection, Modbus Gateway. Skim electrical schematics unless deep knowledge needed.
- **Estimated Pages:** ~60–80 relevant pages (out of ~120 total)
- **RAG Tags:** OptiSpeed, VSD, inverter, frequency modulation, harmonic filter, adaptive capacity control (ACC), Modbus, E-Link gateway, motor current
- **Training Use:** Advanced operator training on VSD, power-quality monitoring, remote diagnostics, multi-chiller coordination

---

### 11. CTI STD-201 (Cooling Tower Thermal Certification) — FAQ & Overview
- **URL:** https://assets.speakcdn.com/assets/2793/answersforfrequentlyaskedquestions.pdf
- **Access:** ✓ Public FAQ (verified); full standard paywalled
- **Why:** Operator understanding of cooling-tower performance expectations and CTI certification. Important context for tower/chiller matching.
- **Ingest Scope:** FAQ fully (all Q&A). Full standard purchase required for detailed ingest; use FAQ as proxy.
- **Estimated Pages:** FAQ ~3–4 pages; full standard ~30+ pages
- **RAG Tags:** CTI certification, cooling tower, thermal performance, condenser water temperature, thermal capacity, test methodology, certified models
- **Training Use:** Tower selection rationale, performance expectations at various wet-bulb, tower maintenance coordination, troubleshooting tower faults

---

### 12. Uptime Institute Tier Standard (Public Summaries & TCDD Guidance)
- **URL:** https://uptimeinstitute.com/tier-certification/ + https://uptimeinstitute.com/tiers (landing pages)
- **Access:** ✓ Public landing pages (verified); full standard paywalled
- **Why:** Industry benchmark for facility reliability/redundancy. Helps explain why dual chillers, N+1 cooling towers, and change-control disciplines exist.
- **Ingest Scope:** Public landing pages, Tier classification summaries, TCDD process overview. Full standard purchase required for detailed topology.
- **Estimated Pages:** Public pages ~5–10 pages; full standard ~40+ pages
- **RAG Tags:** Tier I/II/III/IV, N+1 redundancy, chiller redundancy, fault tolerance, availability, single-point-of-failure, change control, maintenance windows
- **Training Use:** Facility context (what tier?), change-control discipline, N+1 strategy, redundancy design rationale, operator role in failover

---

### 13. Magnetic-Bearing Chiller (DOE + GSA Case Studies)
- **URL (DOE):** https://www.energy.gov/cmei/femp/magnetic-bearing-chiller-compressors
- **URL (GSA GPG-009):** https://www.gsa.gov/system/files/09-Next-Generation%20Chillers.pdf
- **Access:** ✓ Both public (verified)
- **Why:** Explains magnetic-bearing technology, part-load efficiency peak (27–33% load), low-maintenance advantages. Context for why YMC² is premium choice.
- **Ingest Scope:** DOE landing page (summary); GSA document full. Focus on: Oil-Free Operation, Efficiency Curve, Part-Load Peak, Condenser Water Temperature Limits, Maintenance Implications, Retrofit vs. New.
- **Estimated Pages:** DOE page ~2–3; GSA ~6–8 relevant pages
- **RAG Tags:** MBC, magnetic bearing, oil-free, part-load efficiency (27–33%), vibration reduction, low maintenance, condenser water temperature tolerance, retrofit capability
- **Training Use:** Technology explanation (why MBC?), part-load efficiency context, maintenance advantages, retrofit decision logic

---

### 14. Vertiv: Dedicated CDU/Cooling UPS (Power Reliability Context)
- **URL:** https://www.vertiv.com/it-emea/insights/articles/blog-posts/why-your-liquid-cooling-investment-needs-dedicated-power-protection/
- **Access:** ✓ Public blog/article (verified)
- **Why:** Explains why cooling power must be mission-critical: pump inrush, VFD voltage sensitivity, 30-second thermal damage window. Context for chiller power-supply reliability.
- **Ingest Scope:** Full article.
- **Estimated Pages:** ~2–3 pages (blog post)
- **RAG Tags:** UPS dedicated to cooling, CDU, pump motor inrush, voltage sag, VFD sensitivity, battery ride-through, generator coordination, thermal shutdown
- **Training Use:** Reliability awareness (cooling is mission-critical), power-failure incident drills, UPS/generator coordination, chiller-shutdown prevention

---

## NICE-TO-HAVE (Tier 3: Advanced/Reference — Ingest if Time/Resources Allow)

Deepen knowledge but not essential for core competency. Use selectively based on trainer focus areas.

### 15. Form 160.76-EG1 — YK Style H Engineering Guide (Advanced Chiller Knowledge)
- **URL:** https://docs.johnsoncontrols.com/chillers/api/khub/documents/jMPftZuK2wWVXODkAKqRSQ/content
- **Access:** ✓ Public PDF (verified; large file)
- **Why:** Comprehensive chiller design, performance curves, nozzle sizing, vibration isolation. For deep technical training or engineering support.
- **Ingest Scope:** Focus on: System Fundamentals, Design Envelope (pressure, flow, temperature), Capacity vs. Lift, Waterbox Design, P&ID, Isolation Design, Pre-Startup Checklist.
- **Estimated Pages:** ~100–150 pages (out of ~250+ total)
- **RAG Tags:** YK chiller, evaporator, condenser, waterbox (removable, drain/vent), refrigerant charge, compressor displacement, performance curve, ASME code, vibration isolation
- **Training Use:** Commissioning engineer support, detailed troubleshooting, chiller selection/specification, design review scenarios

---

### 16. ASHRAE 2023 HVAC Handbook Chapter 20 (Facility Design Depth)
- **URL:** https://www.ashrae.org/technical-resources/ashrae-handbook/2023-ashrae-handbook-hvac-applications
- **Access:** Paywalled; excerpts/summaries public
- **Why:** Comprehensive facility design guide. Emphasizes cooling, power, space, networking must be designed together. Higher-level context.
- **Ingest Scope:** Full chapter desired but paywalled. Use free summaries/excerpts: cooling types, thermal envelope, commissioning, water concerns, fire protection integration.
- **Estimated Pages:** Chapter ~40–50 pages; prioritize key sections
- **RAG Tags:** datacom facility, cooling types (air, liquid, hybrid), thermal envelope, commissioning, DCIM, water usage, fire protection, chiller integration
- **Training Use:** Facility design context (cooling is system design, not isolated), stakeholder communication (power/cooling coordination), architect/engineer audience

---

### 17. NREL: Chiller-Less / Direct Liquid Cooling Case Studies
- **URL (Lessons Learned):** https://datacenters.lbl.gov/sites/default/files/Lessons_Learned_NREL.pdf
- **URL (Thermosyphon Hybrid):** https://datacenters.lbl.gov/sites/default/files/Thermosyphon%20Cooler%20Hybrid%20System%20for%20Water%20Savings%20Paper.pdf
- **Access:** ✓ Both public (verified)
- **Why:** Demonstrates extreme efficiency (PUE 1.04, no chiller) and water-savings strategies. Perspective on emerging design trends.
- **Ingest Scope:** Full; both papers valuable. Focus on: Design Rationale, Waste-Heat Reuse, Water Savings, Operational Results.
- **Estimated Pages:** Both ~8–12 pages each
- **RAG Tags:** chiller-less, direct liquid cooling, warm-water supply/return, waste-heat reuse, PUE 1.04, thermosyphon cooler, water usage effectiveness (WUE), 24-month results
- **Training Use:** Long-term trend awareness (future of cooling design), advanced efficiency concepts, water-sustainability perspective

---

### 18. Research & Patents (Advanced Theory)
- **US Patent 6463748** (MBC Control): https://exa.ai/library/legal/patent/v8n0j8s2h1f
- **US Patent 5355691** (Dynamic Surge Control): https://exa.ai/library/legal/patent/j4ht3ktrwc1
- **Purdue VFD Control**: https://docs.lib.purdue.edu/cgi/viewcontent.cgi?article=2921&context=icec
- **Research: Bearing Orbit Optimization**: https://exa.ai/library/publication/dtgd9f34mtf
- **Access:** ✓ All public (verified)
- **Why:** Deep technical understanding of magnetic-bearing control, surge boundary algorithms, and compressor map optimization.
- **Ingest Scope:** Patents: executive summary + key claims/drawings. Research papers: abstract + key sections (skip heavy math unless needed).
- **Estimated Pages:** Patents ~20–30 pages each; research ~10–20 pages
- **RAG Tags:** magnetic bearing unit (MBU), surge boundary control (SBC), compressor map, IGV + speed coordination, pressure coefficient, capacity coefficient, bearing orbit feedback, model-based control
- **Training Use:** Advanced troubleshooting (control-loop anomalies), technology deep-dive, R&D context, engineer audience

---

### 19. Trane/Daikin Clinics & Engineering Bulletins (Competitor Perspectives)
- **Trane CTV-PRB018** (Waterbox Design): https://rumfordportal.com/wp-content/uploads/2017/07/CTV-PRB018-EN_11132012.pdf
- **Trane TRC010** (Chiller Clinic): https://www.tranebelgium.com/files/book-doc/10/en/10.n4mz18g9.pdf
- **Daikin Installation Manual**: https://www.daikin.es/content/dam/document-library/installation-manuals/as/water-cooled-centrifugal-chillers/ewwd-fzxs/EWWD-FZ_D-EIMWC00908-16_Installation%20and%20operation%20manuals_English.pdf
- **Access:** ✓ All public (verified)
- **Why:** Competitor/industry perspectives on waterbox design, maintenance, water treatment, tube cleaning. Broader chiller knowledge base.
- **Ingest Scope:** Focus on: Waterbox Design Options, Tube Cleaning Procedures, Water Treatment, Corrosion Prevention, Maintenance Best Practices.
- **Estimated Pages:** Total ~30–40 relevant pages across three documents
- **RAG Tags:** marine waterbox, hinged waterbox, tube cleaning, sacrificial anode, air infiltration, oil analysis, water treatment, pressure drop, fouling, scale
- **Training Use:** Troubleshooting (fouling diagnosis, tube cleaning), maintenance procedures, competitor chiller context, knowledge breadth

---

### 20. Flex: Advanced Power Quality (AI/HPC Context)
- **URL:** https://flex.com/resources/power-quality-the-unseen-phenomenon-behind-some-of-the-biggest-data-center-challenges
- **Access:** ✓ Public article (verified)
- **Why:** Emerging power-quality challenges from high-density AI workloads (subharmonics, load pulsing). Relevant to next-generation facilities.
- **Ingest Scope:** Full article; focus on: Harmonics/Subharmonics, Load Pulsing, VFD Artifacts, UPS/Generator Sensitivity, Cooling System Stability, CESS Solution.
- **Estimated Pages:** ~2–3 pages (article)
- **RAG Tags:** harmonics, subharmonics, load pulsing, VFD harmonics, power factor, cooling stability, generator transients, UPS failure modes
- **Training Use:** Emerging operational challenges, power-monitoring context, next-generation facility readiness, troubleshooting complex power issues

---

## INGEST SEQUENCING STRATEGY

### Phase 1: Foundation (Week 1)
**Sources:** Tier 1 items 1–7  
**Goal:** Operator competency on basic YMC² operation, safety, facility design, surge awareness  
**Output:** Shift-check deck, incident-drill scenarios, maintenance coordination workflow

### Phase 2: Operations & Context (Week 2)
**Sources:** Tier 2 items 8–14  
**Goal:** Deepen understanding of seasonal operation, efficiency optimization, reliability context  
**Output:** Economizer engagement logic, power-failure drills, energy KPI explanations, technology context

### Phase 3: Advanced & Reference (Week 3+)
**Sources:** Tier 3 items 15–20  
**Goal:** Support engineering, commissioning, troubleshooting, trend awareness  
**Output:** Detailed troubleshooting guides, engineering support, future-state readiness

---

## Estimated Total Ingest

| Tier | Count | Approx. Pages | Estimated Parse/Vector Time | Notes |
|------|-------|---------------|------------------------------|-------|
| **Tier 1** | 7 | 500–600 | 8–12 hours | Core operational knowledge |
| **Tier 2** | 7 | 150–200 | 3–5 hours | Context, advanced scenarios |
| **Tier 3** | 6 | 200–300 | 4–6 hours | Reference, deep dives, research |
| **TOTAL** | 20 | 850–1,100 | 15–23 hours | Parallel parsing possible; vectorization ~2–4 hours per 100 pages |

---

## Known Gaps (Not in Queue)

| Gap | Why Not Included | Recommendation |
|-----|------------------|-----------------|
| **YORK YMC² IOM** (Form 160.78-IOM) | Behind login portal; not publicly accessible | Request from JCI support or existing maintenance contract |
| **ASHRAE 90.1** (full edition) | Paywalled; data-center uses 90.4 instead | Use reference cards / excerpts (public); 90.4 is primary standard |
| **ASHRAE 90.4** (full standard 2025) | Paywalled; mirrors & excerpts available | Use archived PDF mirror or institutional license; excerpts sufficient for context |
| **Uptime Tier Full Standard** | Paywalled; public summaries available | Use public landing pages; purchase standard for detailed topology if engineering-deep |
| **CTI STD-201 / STD-203** (full standards) | Paywalled; FAQ & overview sufficient | FAQ adequate for operator context; purchase if detailed tower design needed |
| **Real-world YMC² case studies** | Limited public domain; proprietary installations | Monitor ASHRAE conference papers, LBNL, GSA GPG for published case studies |
| **YORK Mod B / latest OptiView** | Limited public documentation | Refer to Form 160.84-OM1 (Mod B); request newer docs from JCI |
| **Proprietary MBC algorithms** | Trade secrets; patents public but implementation proprietary | Patent US 6463748 covers basics; deeper algorithms proprietary to JCI |

---

## Ingest Priority Summary (TL;DR)

**Must-Have First (in order):**
1. Form 160.78-O1 (Operations Manual)
2. Form 160.78-O2 (OptiView/VSD Manual)
3. ASHRAE 90579-2021 (Thermal Guidelines)
4. Form 160.78-N1 (Installation Manual)
5. DOE Best Practices (July 2024)
6. Form 160.00-AD5 (Water Quality Guide)
7. Peterson: Avoiding Surge

**Then (by value):**
8. EPA ENERGY STAR Top 12
9. Trane Water-Side Economizer
10. CTI STD-201 FAQ
11. DOE/GSA Magnetic-Bearing Studies
12. Vertiv CDU/UPS Reliability

**If Resources / Specialized Training:**
- OptiSpeed VSD Manual (Form 160.00-O4)
- Uptime Tier Summaries (public pages)
- YK Engineering Guide (Form 160.76-EG1)
- NREL Chiller-Less Case Studies
- Patents & Research (MBC deep dives)
- Competitor Clinics (maintenance context)

---

**Last Updated:** October 2026  
**Status:** Queue ready for ingest  
**Next:** Execute Phase 1 ingest → test retrieval → iterate refinement
