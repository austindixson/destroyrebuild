# RAG Source Catalog: YORK YMC² Data-Center Cooling Trainer

**Status:** Draft catalog for sourced content ingestion  
**Generated:** October 2026  
**Purpose:** Primary sources for grounding LLM training on magnetic-bearing centrifugal chiller operation, data-center cooling standards, and plant operations discipline

---

## Catalog Structure

Each entry includes:
- **Title** — official document name
- **Publisher/Source** — manufacturer or standards body
- **URL** — verified, accessible link
- **Access** — public PDF | landing page | paywalled | broken | archived
- **Date/Version** — publication or revision date visible
- **RAG Tags** — domain keywords: YMC², OptiView, OptiSpeed, VSD, MBC, IGV, surge, LCHLT, N+1, wet-bulb, economizer, free-cooling, UPS, ATS, Tier-I/II/III/IV, etc.
- **Why It Matters** — training value and use cases
- **License/TOS Considerations** — reproduction and ingest rights

---

## 1. YORK YMC² MAGNETIC-BEARING CENTRIFUGAL CHILLER

### 1.1 Installation & Reassembly (Form 160.78-N1)

| Field | Value |
|-------|-------|
| **Title** | YMC2 Mod A Install and Reassembly Chiller with OptiView Control Center R-134a, R-513A, R-1234ze, or R-515B |
| **Publisher** | Johnson Controls / YORK |
| **Form** | 160.78-N1 |
| **URL** | https://docs.johnsoncontrols.com/chillers/api/khub/documents/5nRUX8MbEJ92R66osxPmSg/content |
| **Access** | Public PDF (landing page; full PDF accessible) |
| **Date/Version** | Revision 1224; latest active |
| **RAG Tags** | YMC², rigging, dismantling, waterboxes, evaporator, condenser, isolators, wiring, startup, Mod A |
| **Why It Matters** | Foundational installation procedures, dimensional requirements, chiller assembly order, pre-startup checks. Essential for trainer scenarios on unit deployment, field assembly supervision, and change-control. Covers refrigerant charge separation, electrical power requirements, piping isolation. |
| **License/TOS** | Authored by Johnson Controls; commercial document. Public access via manufacturer landing. Ingest likely fair-use for trainer training (educational, non-commercial derivative). Verify per customer terms. |

---

### 1.2 Unit Operation Guide (Form 160.78-O1)

| Field | Value |
|-------|-------|
| **Title** | YMC2 Mod A Centrifugal Chiller with OptiView Control Center, Unit Operation Guide |
| **Publisher** | Johnson Controls / YORK |
| **Form** | 160.78-O1 |
| **URL** | https://docs.johnsoncontrols.com/chillers/v/u/YORK/en-US/YMC2-Mod-A-Centrifugal-Chiller-with-OptiView-Control-Center-Unit-Operation-Guide/425 |
| **Access** | Public PDF (landing page; fetched) |
| **Date/Version** | Revision 425; active status |
| **RAG Tags** | YMC², operation, maintenance, safety shutdowns, daily logs, magnetic bearing lubrication (oil-free), refrigerant charge check, leak testing, vacuum dehydration, oil analysis |
| **Mirror** | https://ecochillers.net/wp-content/uploads/2023/07/ymc2_manual.pdf (third-party hosting) |
| **Why It Matters** | Daily operator procedures, safety control sequences, troubleshooting shutdown messages, maintenance intervals (semi-annual, annual). Covers magnetic bearing basics, oil-free operation, condenser water flow monitoring. Critical for trainer shift-check deck, incident drills, and post-maintenance startup protocols. |
| **License/TOS** | Johnson Controls commercial document. Public access via manufacturer. Third-party mirror at ecochillers.net may have IP considerations; prefer primary Johnson Controls source. |

---

### 1.3 OptiView Control Center Operation Manual (Form 160.78-O2)

| Field | Value |
|-------|-------|
| **Title** | YMC2 Mod A Centrifugal Chiller with OptiView Control Center, Unit Operation Guide (VSD Section) |
| **Publisher** | Johnson Controls / YORK |
| **Form** | 160.78-O2 |
| **URL** | https://www.manualslib.com/manual/1561966/York-Optiview.html |
| **Access** | Public HTML view; PDF downloadable from ManualsLib |
| **Date/Version** | Issue date 5/22/2017; current |
| **RAG Tags** | OptiView, LCD display, keypad interface, VSD operation, pre-rotation vanes, surge map, current limit, motor speed, frequency control, power factor, UPS transition |
| **Why It Matters** | Graphic display screens, user navigation, setpoint configuration, VSD Details screen (frequency, rectifier temperature, power factor). Essential for trainer NOC simulation, operator training on control-center interpretation, and real-time diagnostics (temperature, pressure, motor current). Covers language switching, historical trend display, status messages. |
| **License/TOS** | ManualsLib archives; original by Johnson Controls. Public educational archive; ingest for trainer likely permissible. Cite primary source. |

---

### 1.4 OptiSpeed / VSD Operation Manual (Form 160.00-O4)

| Field | Value |
|-------|-------|
| **Title** | YD, YK, YT Centrifugal Chillers Liquid-Cooled OptiSpeed Compressor Speed Drive Operation Manual |
| **Publisher** | Johnson Controls / YORK |
| **Form** | 160.00-O4 |
| **URL** | https://docs.johnsoncontrols.com/chillers/api/khub/documents/xk5ADqM8YJbLDHchGfmfsg/content |
| **Access** | Public PDF (landing page; full content accessible) |
| **Date/Version** | Current active form; covers models VSD 270–1055, LVD 270–900 |
| **RAG Tags** | OptiSpeed, VSD, variable frequency drive, HYP744, inverter, adaptive capacity control (ACC), surge map, modulation, harmonic filter, motor cooling, Modbus protocol |
| **Why It Matters** | Detailed VSD control logic, capacity modulation without chillers needing full manual speed control, harmonic filtering, motor protection. Critical for trainer scenarios on chiller staging, low-load operation, efficiency optimization, and power-quality monitoring (THD, power factor). Covers Modbus gateway for building automation. |
| **License/TOS** | Johnson Controls commercial document; public access via manufacturer portal. Educational ingest permissible; cite source. |

---

### 1.5 OptiView Control Center for YK Style (Training Slide Deck)

| Field | Value |
|-------|-------|
| **Title** | CENTRIFUGAL LIQUID CHILLERS WITH OPTIVIEW™ CONTROL CENTER (Model YK Style G) |
| **Publisher** | Genpact / Johnson Controls (embedded training materials) |
| **URL** | https://lms.genpact.com/showcase_LMS/Learning/Chiller_JobAid/assets/resources/Optiview_Control_Center_Model_Yk_(Through_Style_G).pdf |
| **Access** | Public PDF (embedded training LMS; accessible) |
| **Date/Version** | Circa 2010–2015; Style G legacy but foundational |
| **RAG Tags** | OptiView, YK chiller, pre-rotation vanes, surge control, microboard, logic board, solid-state starter, VSD interface, RS-485 Modbus, E-Link gateway |
| **Why It Matters** | Internal control architecture, microprocessor-based decision logic, vane modulation curves, VSD integration, building automation gateway setup. Valuable for trainer deep-dive on how OptiView maintains surge margin, adjusts capacity dynamically, and communicates with building systems. Large embedded diagrams. |
| **License/TOS** | Genpact learning materials; embedded Johnson Controls content. Public access. Ingest permissible; cite both parties. |

---

### 1.6 Chiller Materials & Water Quality (Form 160.00-AD5)

| Field | Value |
|-------|-------|
| **Title** | Water Cooled Chiller Materials Application Guide for Various Water Qualities |
| **Publisher** | Johnson Controls / YORK |
| **Form** | 160.00-AD5 |
| **URL** | https://docs.johnsoncontrols.com/chillers/api/khub/documents/aiaQkOHch2IM1Um9TQ3FXg/content |
| **Access** | Public PDF (landing page; full content accessible) |
| **Date/Version** | Active application data guide |
| **RAG Tags** | waterbox, condenser, evaporator, corrosion, scaling, fouling, tube cleaning, marine waterbox, sacrificial anode, water treatment, cycles of concentration, tube material selection |
| **Why It Matters** | Specifies tube material (copper, titanium, stainless), waterbox design (marine vs. fixed), anode placement, cleaning intervals, water chemistry limits (pH, chlorides, sulfates). Critical for trainer maintenance scenarios: fouling diagnosis, cleaning procedures without disconnecting piping, water-treatment program coordination with plant ops. Covers filtration strategies, chemical compatibility. |
| **License/TOS** | Johnson Controls engineering guide; public access. Educational use permissible. |

---

### 1.7 YK Style H Engineering Guide (Form 160.76-EG1)

| Field | Value |
|-------|-------|
| **Title** | Model YK Style H Centrifugal Liquid Chillers Engineering Guide |
| **Publisher** | Johnson Controls / YORK |
| **Form** | 160.76-EG1 |
| **URL** | https://docs.johnsoncontrols.com/chillers/api/khub/documents/jMPftZuK2wWVXODkAKqRSQ/content |
| **Access** | Public PDF (landing page; large, comprehensive) |
| **Date/Version** | Current engineering reference |
| **RAG Tags** | YK Style H, evaporator, condenser, refrigerant charge, compressor displacement, impeller design, capacity vs. lift, waterbox design (removable, drain/vent), ASME pressure code, nozzle connections, isolation requirements |
| **Why It Matters** | Comprehensive chiller design, operating envelope (pressure, flow, temperature limits), nozzle sizing, piping arrangement best practices, vibration isolation, pre-startup checklist. Large embedded P&ID diagrams, performance curves. Valuable for trainer on chiller selection, capacity planning, piping layout, and installation verification. |
| **License/TOS** | Johnson Controls; public access via manufacturer. Educational ingest permissible. |

---

## 2. DATA-CENTER COOLING & ENVIRONMENTAL STANDARDS

### 2.1 ASHRAE 90579-2021: Thermal Guidelines for Data Processing Environments (Fifth Edition)

| Field | Value |
|-------|-------|
| **Title** | Thermal Guidelines for Data Processing Environments, Fifth Edition (TC 9.9) |
| **Publisher** | ASHRAE (American Society of Heating, Refrigerating and Air-Conditioning Engineers) |
| **Standard** | ANSI/ASHRAE 90579-2021 |
| **URL** | https://www.ashrae.org/file%20library/technical%20resources/bookstore/supplemental%20files/therm-gdlns-5th-r-e-refcard.pdf (reference card) |
| **Full URL** | https://haganerack.com/wp-content/uploads/2026/02/ASHRAE-90579-2021.pdf (full PDF; mirror) |
| **Access** | Public reference card PDF; full edition paywalled via ASHRAE but mirrors available |
| **Date/Version** | Published 2021; current standard |
| **RAG Tags** | ASHRAE TC 9.9, thermal envelope, air-inlet classes (A1–A4, H1), dry-bulb/wet-bulb/dew-point, relative humidity, recommended vs. allowable ranges, liquid-cooled equipment classes, measurement methodology, energy efficiency |
| **Why It Matters** | Canonical industry standard for IT equipment environmental design. Specifies 18–27°C recommended, 32–45°C allowable for Class A1–A4; high-density H1 narrower. Essential for trainer on facility design rationale, why chiller setpoint matters, economizer decision boundaries (wet-bulb thresholds). Covers measurement, airflow patterns, reliability. Reference card freely available; full edition for detailed guidance on liquid cooling. |
| **License/TOS** | ASHRAE standard (paywalled); reference card and mirrors public. Educational ingest permissible with attribution. |

---

### 2.2 ASHRAE 90.4-2025: Energy Standard for Data Centers

| Field | Value |
|-------|-------|
| **Title** | ANSI/ASHRAE Standard 90.4-2025: Energy Standard for Data Centers |
| **Publisher** | ASHRAE |
| **Standard** | ANSI/ASHRAE 90.4-2025 |
| **URL** | https://img.antpedia.com/standard/files/pdfs_ora/20251111/ANSI%20ASHRAE%20Standard%2090.4-2025.pdf (full PDF) |
| **Public Info URL** | https://www.ashrae.org/technical-resources/bookstore/datacom-series |
| **Addenda** | https://www.ashrae.org/file%20library/technical%20resources/standards%20and%20guidelines/standards%20addenda/90_4_2022_a_20250131.pdf (2025 addendum) |
| **Access** | Public PDF available via standards mirrors; official ANSI store paywalled |
| **Date/Version** | 2025 edition; supersedes 2022 |
| **RAG Tags** | energy efficiency, chiller COP requirements, economizer requirements (100% free cooling at 50°F DBT/45°F WBT), mechanical system design, renewable energy, water consumption, greenhouse gas emissions, PUE targets |
| **Why It Matters** | Normative energy-efficiency rules for data-center design and operation. Mandates economizer integration, chiller staging, condenser-water temperature limits, VFD requirements. Critical for trainer on why operators adjust chiller speed, when to use free cooling, and how to sequence multiple chillers. Addendum 2025-a expands scope to water and carbon. |
| **License/TOS** | ASHRAE standard (paywalled); mirrors available. Educational use with attribution permissible. |

---

### 2.3 ASHRAE 2023 HVAC Applications Handbook, Chapter 20: Data Centers & Telecom Facilities

| Field | Value |
|-------|-------|
| **Title** | ASHRAE Handbook—HVAC Applications, Chapter 20: Data Centers and Telecommunication Facilities |
| **Publisher** | ASHRAE |
| **Edition** | 2023 (latest) |
| **URL** | https://www.ashrae.org/technical-resources/ashrae-handbook/2023-ashrae-handbook-hvac-applications |
| **Access** | Paywalled; summaries and excerpts public |
| **Date/Version** | 2023 edition; updated with liquid cooling, fire protection, water concerns |
| **RAG Tags** | data-center cooling types (air, liquid, hybrid), thermal envelope, commissioning, water usage effectiveness (WUE), fire protection, chiller selection, economizer integration, CDU (cooling distribution unit), free cooling |
| **Why It Matters** | Comprehensive HVAC design guide for datacom facilities. Emphasizes cooling, power, space, and networking must be designed together. Covers air cooling, liquid cooling (direct, immersion), hybrid approaches, and economizer design. Critical for trainer on why chiller plant design is facility-wide issue, not isolated. Updated guidance on liquid cooling for high-density racks. Paywalled but summaries/excerpts available. |
| **License/TOS** | ASHRAE handbook (paywalled); excerpts and chapter summaries public. Ingest permissible for educational trainer with attribution. |

---

### 2.4 Uptime Institute Tier Standard: Topology

| Field | Value |
|-------|-------|
| **Title** | Uptime Institute Tier Standard: Topology (Data Center Classification I–IV) |
| **Publisher** | Uptime Institute |
| **Standard** | Tier Certification (TCDD = Tier Certification of Design Documents) |
| **URL** | https://uptimeinstitute.com/tier-certification/ |
| **Standard Info** | https://uptimeinstitute.com/publications/asset/tier-standard-topology |
| **Access** | Landing page public; full standard paywalled (purchase required) |
| **Date/Version** | 2018 revision current; regular updates |
| **RAG Tags** | Tier I (non-redundant), Tier II (partial N+1), Tier III (N+1 hot-swap), Tier IV (fault-tolerant N+X), availability %, redundancy, fault tolerance, cooling topology, UPS, generator, transfer switches, single-points-of-failure |
| **Why It Matters** | Industry benchmark for data-center design reliability. Defines cooling redundancy expectations: Tier I no redundant cooling, Tier II some redundancy, Tier III full N+1 chiller + cooling-tower pairs, Tier IV full N+X. Essential for trainer on why dual chillers exist, how failover works, staged maintenance, and change-control discipline. Uptime Institute is sole authorized certifier. Public landing pages explain each tier; full standard purchase required. |
| **License/TOS** | Uptime Institute IP; standard paywalled. Public landing pages and summaries available for reference. Educational use of public summaries permissible. |

---

## 3. CONDENSER WATER, COOLING TOWERS & FREE COOLING

### 3.1 EPA ENERGY STAR: Top 12 Ways to Decrease Data Center Energy Consumption

| Field | Value |
|-------|-------|
| **Title** | Top 12 Ways to Decrease the Energy Consumption of Your Data Center |
| **Publisher** | U.S. Environmental Protection Agency (EPA) |
| **Program** | ENERGY STAR |
| **URL** | https://www.energystar.gov/sites/default/files/tools/DataCenter-Top12-Brochure-Final.pdf |
| **Access** | Public PDF (government) |
| **Date/Version** | Circa 2010s; still current guidance |
| **RAG Tags** | air-flow management, hot/cold-aisle containment, blanking panels, higher inlet temperatures, variable-speed CRAC/CRAH fans, air-side economizer, water-side economizer, cooling-tower operation, chiller COP, energy savings % |
| **Why It Matters** | Government-backed guidance on quick-win cooling efficiency. Covers air-side and water-side economizers (up to 70% cooling cost savings in winter), variable-frequency drives on cooling fans, blanking panels. Essential for trainer on why operators increase chilled-water setpoint, deploy economizers seasonally, and verify fan speed modulation. Plain-language audience focus; good for shift-briefing content. |
| **License/TOS** | U.S. government public domain; freely available and reproducible. |

---

### 3.2 DOE Best Practices Guide for Energy-Efficient Data Center Design (July 2024)

| Field | Value |
|-------|-------|
| **Title** | Best Practices Guide for Energy-Efficient Data Center Design |
| **Publisher** | U.S. Department of Energy (DOE) Building Technologies Office |
| **URL** | https://www.energy.gov/sites/default/files/2024-07/best-practice-guide-data-center-design.pdf |
| **Access** | Public PDF (government) |
| **Date/Version** | July 2024 (latest edition) |
| **RAG Tags** | air management, free cooling (air-side, water-side, hybrid), chilled-water systems, liquid cooling, controls, efficiency metrics (PUE, DCIE, COP), economizer design, cooling-tower integration, Part-Load Performance, chiller staging |
| **Why It Matters** | Comprehensive, current best-practices guide covering chiller selection, air/water-side economizer design (50°F DBT/45°F WBT threshold per ASHRAE 90.1), cooling-tower sizing, free-cooling optimization, and part-load efficiency. Covers direct liquid cooling for high-density racks. Critical for trainer on why chiller plant design decisions matter: economizer integration with chiller loop, plate heat-exchanger approach, simultaneous chiller + economizer operation in shoulder seasons. Published July 2024; reflects latest standards. |
| **License/TOS** | U.S. government public domain; reproducible. |

---

### 3.3 DOE Guide to Minimizing Compressor-Based Cooling

| Field | Value |
|-------|-------|
| **Title** | Guide to Minimizing Compressor-based Cooling |
| **Publisher** | U.S. Department of Energy (FEMP: Federal Energy Management Program) |
| **Institution** | Lawrence Berkeley National Laboratory (LBNL) |
| **URL** | https://www.energy.gov/sites/prod/files/2013/10/f3/dc_compressorguide.pdf |
| **Access** | Public PDF (government) |
| **Date/Version** | 2013; foundational but still relevant |
| **RAG Tags** | free cooling, economizer, ASHRAE allowable ranges, alternative cooling (waterside, airside), direct liquid cooling, compressor-free operation, CRAC vs. chiller tradeoffs, part-load performance |
| **Why It Matters** | Focused guidance on when to use (or avoid) compressor-based cooling (chillers, CRAC units). Explains why free cooling matters for cost and efficiency, and how ASHRAE allowable temperature ranges (wider than recommended) enable more economizer hours. Valuable for trainer on decision logic: when chiller is running vs. when cooling tower alone suffices. |
| **License/TOS** | U.S. government; public domain. |

---

### 3.4 EPA Data Center Utility Program: Energy-Efficiency Programs for Utilities

| Field | Value |
|-------|-------|
| **Title** | UNDERSTANDING AND DESIGNING ENERGY-EFFICIENCY PROGRAMS FOR DATA CENTERS |
| **Publisher** | U.S. Environmental Protection Agency (EPA) |
| **Program** | ENERGY STAR |
| **URL** | https://www.energystar.gov/ia/products/power_mgt/ES_Data_Center_Utility_Guide.pdf |
| **Access** | Public PDF (government) |
| **Date/Version** | Circa 2015; utility-program design focus |
| **RAG Tags** | chiller efficiency, VFD retrofit, economizer incentive programs, HVAC optimization, equipment selection, variability in data-center cooling, utility rebates, behavioral change |
| **Why It Matters** | Utility-company perspective on incentivizing data-center efficiency improvements (chiller upgrades, economizer retrofits, VFD retrofits). Covers operational best practices, equipment choices, metering. Helps trainer understand financing and change-management context for chiller upgrades and new technology adoption. |
| **License/TOS** | U.S. government; public domain. |

---

### 3.5 LBNL Self-Benchmarking Guide for Data Centers: Metrics & Actions

| Field | Value |
|-------|-------|
| **Title** | Self-benchmarking Guide for Data Centers: Metrics, Benchmarks, Actions |
| **Publisher** | Lawrence Berkeley National Laboratory (LBNL) |
| **URL** | https://eta-publications.lbl.gov/sites/default/files/lbnl-3393e.pdf |
| **Access** | Public PDF (government) |
| **Date/Version** | Circa 2015; still-current metrics definitions |
| **RAG Tags** | PUE (power usage effectiveness), DCiE (data center infrastructure efficiency), cooling metrics (COP, DCIE), air management metrics (temperature, humidity, airflow), economizer utilization, water usage effectiveness (WUE) |
| **Why It Matters** | Defines how to measure chiller and cooling-system performance. Covers COP, cooling-system sizing factor, economizer utilization %. Essential for trainer on interpretation of NOC dashboards, KPI tracking, and performance trending. Shows how to calculate water-savings from economizers, measure temperature splits, and identify inefficiency. |
| **License/TOS** | Government/national lab; public domain. |

---

### 3.6 Trane: Water-Side Economizer Design Strategies

| Field | Value |
|-------|-------|
| **Title** | Cooling with Economizer and Free Cooling Strategies |
| **Publisher** | Trane Technologies |
| **URL** | https://elibrary.tranetechnologies.com/public/commercial-hvac/Literature/White%20Paper/DC-WPR006A-EN_06302026.pdf |
| **Access** | Public PDF (manufacturer whitepaper) |
| **Date/Version** | 2020s; current design practice |
| **RAG Tags** | water-side economizer, plate heat exchanger, approach temperature (3°F typical), full free cooling (low ambient), hybrid cooling (partial), ASHRAE 90.4 compliance, simultaneous chiller + economizer operation, cooling-tower scheduling |
| **Why It Matters** | Detailed engineering on water-side economizer design and operation. Covers plate heat-exchanger approach (3°F standard), conditions for full vs. partial free cooling, ASHRAE 90.4 requirement for integrated operation (not either/or), and tower water temperature scheduling. Critical for trainer on why operators must coordinate chiller + economizer during shoulder seasons, and how to diagnose economizer bypass/integration issues. |
| **License/TOS** | Trane commercial whitepaper; public access via manufacturer. Educational use permissible; cite Trane. |

---

### 3.7 Purdue: Variable-Speed Chiller Control for Variable Primary Flow

| Field | Value |
|-------|-------|
| **Title** | Variable-Speed Centrifugal Chiller Control for Variable Primary Flow (VPF) Applications |
| **Publisher** | Purdue University / ICEC (International Compressor Engineering Conference) |
| **URL** | https://docs.lib.purdue.edu/cgi/viewcontent.cgi?article=2921&context=icec |
| **Access** | Public PDF (academic repository) |
| **Date/Version** | 2010s; peer-reviewed research |
| **RAG Tags** | variable-speed compressor, inlet guide vanes (IGV), surge margin, pressure coefficient, capacity coefficient, compressor map, model-based control, multi-input-multi-output (MIMO), part-load optimization |
| **Why It Matters** | Research-backed explanation of variable-speed chiller control logic. Covers why IGV position and speed must be coordinated, how surge margin is maintained on a compressor map, and optimal efficiency regions. Valuable for trainer deep-dive on why OptiView adjusts both speed and vane position, and how magnetic-bearing chillers achieve high part-load efficiency. Peer-reviewed; well-cited. |
| **License/TOS** | Purdue academic repository; public access. Educational use permissible. |

---

### 3.8 Peterson Engineers: Avoiding Centrifugal Chiller Surge

| Field | Value |
|-------|-------|
| **Title** | Avoiding Centrifugal Chiller Surge |
| **Publisher** | Peterson Engineering (industry consultant) |
| **URL** | https://s3.us-east-1.amazonaws.com/p2s-production/uploads/2018-11-Engineers-Notebook_Peterson_Avoiding-Centrifugal-Chiller-Surge.pdf |
| **Access** | Public PDF (archived, S3-hosted) |
| **Date/Version** | 2018; still-current operational guidance |
| **RAG Tags** | surge, surge margin, inlet guide vanes, variable speed, lift, capacity control sequence, low-load operation, load staging, hot-gas bypass limits (ASHRAE 90), preventive controls |
| **Why It Matters** | Practical guide to avoiding surge during chiller operation. Explains surge mechanism, how IGVs and speed control prevent surge, capacity control sequencing (speed first, then IGVs), and staging rules for variable-speed chillers. Essential for trainer on operator awareness: why chiller must not be allowed to surge (audible compressor noise, potential damage), and how control systems prevent it. Covers ASHRAE 90 limits on hot-gas bypass (≤10% for large chillers). |
| **License/TOS** | Industry consultant document; public archive. Educational use permissible. |

---

### 3.9 Cooling Technology Institute (CTI) Standards & Certification

| Field | Value |
|-------|-------|
| **Title** | CTI STD-201RS: Performance Rating of Evaporative Heat Rejection Equipment |
| **Publisher** | Cooling Technology Institute |
| **Standard** | CTI STD-201RS (and STD-201OM Operations Manual) |
| **URL** | https://assets.speakcdn.com/assets/2793/answersforfrequentlyaskedquestions.pdf (FAQ) |
| **Standard Info** | https://www.cti.org/cti-thermal-certification |
| **Access** | Standard paywalled; FAQ and overview public |
| **Date/Version** | 2017 edition (STD-201RS); current |
| **RAG Tags** | cooling-tower thermal certification, evaporative condenser, mechanical-draft tower, performance rating, certified models, test methodology, thermal capacity, wet-bulb effectiveness |
| **Why It Matters** | Industry standard for cooling-tower thermal performance. CTI-certified towers provide third-party verification that thermal capacity matches published ratings. Essential for trainer on tower selection, performance expectations at various wet-bulb conditions, and verification during commissioning. FAQ explains certification program and limits. |
| **License/TOS** | CTI standards (paywalled); overview and FAQ public. Educational reference permissible. |

---

### 3.10 ASHRAE TC 9.9 Power Equipment Thermal Guidelines

| Field | Value |
|-------|-------|
| **Title** | Data Center Power Equipment Thermal Guidelines and Best Practices |
| **Publisher** | ASHRAE Technical Committee 9.9 |
| **URL** | https://www.ashrae.org/file%20library/technical%20resources/bookstore/ashrae_tc0909_power_white_paper_22_june_2016_revised.pdf |
| **Access** | Public PDF (ASHRAE public resource) |
| **Date/Version** | 2016 (revised); TC 9.9 authority |
| **RAG Tags** | economization, air-side economizer, water-side economizer, 50°F DBT / 45°F WBT threshold, recommended vs. allowable temperature ranges, chiller staging, free-cooling hours %, load pulsing, temperature excursions |
| **Why It Matters** | ASHRAE TC 9.9 guidance on economizer operation and impact on facility design. Covers why higher allowable temperature ranges (wider than recommended) enable more economizer hours and energy savings. Discusses temperature excursions and their effect on equipment reliability. Valuable for trainer on facility-design rationale and operator decisions on when to engage free cooling. |
| **License/TOS** | ASHRAE; public educational resource. Ingest permissible with attribution. |

---

## 4. ELECTRICAL & UPS / POWER QUALITY (AS RELATED TO CHILLER)

### 4.1 Vertiv: Why Liquid Cooling Investment Needs Dedicated Power Protection

| Field | Value |
|-------|-------|
| **Title** | Why your liquid cooling investment needs dedicated power protection |
| **Publisher** | Vertiv (UPS/cooling manufacturer) |
| **URL** | https://www.vertiv.com/it-emea/insights/articles/blog-posts/why-your-liquid-cooling-investment-needs-dedicated-power-protection/ |
| **Access** | Public landing page / blog post |
| **Date/Version** | 2020s; current best-practice discussion |
| **RAG Tags** | UPS dedicated to cooling, CDU (cooling distribution unit), pump motor inrush, voltage sag, undervoltage sensitivity (VFD dropout), harmonic distortion, ATS transfer time, battery ride-through, 30-second thermal damage window |
| **Why It Matters** | Critical for trainer on why cooling power is mission-critical. Explains risk of sharing UPS between IT and mechanical loads: pump motor inrush can trip UPS, voltage sag can drop VFD contactors within 10–15%, cutting coolant flow for 30 seconds—enough for permanent GPU damage. Advocates dedicated mechanical UPS with controlled motor starts and zero-transfer-time battery backup. Relevant to trainer incident drills on power failure response. |
| **License/TOS** | Vertiv commercial blog; public access. Educational reference permissible. |

---

### 4.2 Trane & Eaton: Built to Power Data Centers at Scale

| Field | Value |
|-------|-------|
| **Title** | BUILT TO POWER DATA CENTERS AT SCALE (Trane Reference Design with Eaton UPS) |
| **Publisher** | Trane Technologies & Eaton Corporation |
| **URL** | https://www.trane.com/content/dam/trane-commercial/north-america/en/document/reference/trane-referencedesign-eaton.pdf |
| **Access** | Public PDF (manufacturer reference design) |
| **Date/Version** | 2020s design whitepaper |
| **RAG Tags** | UPS double-conversion, voltage regulation, frequency regulation, VFD power quality, harmonic mitigation, brownout/swell ride-through, CDU dedicated UPS, generator coordination, EnergyAware functionality |
| **Why It Matters** | Real-world reference design for large data centers with CDU liquid cooling. Covers Eaton 9395/93PM UPS providing clean power to both IT and CDUs, coordinated ride-through during utility transients, and prevention of sudden electrical step changes. Essential for trainer on electrical system architecture, why cooling is on separate UPS tier, and generator start/synchronization. Includes practical configurations. |
| **License/TOS** | Trane/Eaton reference design; public access. Educational use permissible. |

---

### 4.3 IEEE: Design of Modular Power Center for Data Center IT Systems

| Field | Value |
|-------|-------|
| **Title** | The Design of a Modular Power Center to Supply IT Systems of Data Centers |
| **Publisher** | IEEE Industry Applications Society |
| **URL** | https://ias.ieee.org/wp-content/uploads/2026/09/THE-DESIGN-OF-A-MODULAR-POWER-CENTER-TO-SUPPLY-IT-SYSTEMS-OF-DATA-CENTERS.pdf |
| **Access** | Public PDF (IEEE conference paper archive) |
| **Date/Version** | 2020s IEEE publication |
| **RAG Tags** | ATS (automatic transfer switch), UPS, generator, PDU (power distribution unit), monitoring (voltage, current, frequency, battery state), alarm thresholds, phase balance, bypass status, fuel reserve |
| **Why It Matters** | Technical architecture for reliable data-center power delivery. Covers UPS battery runtime planning, ATS transfer time (50–100 ms), generator start (5–15 s), PDU load distribution, and continuous monitoring (per-circuit current, imbalance, ground faults). Relevant to trainer on power-chain coordination and operator awareness of UPS state, battery capacity, and generator readiness. |
| **License/TOS** | IEEE publication; open access. Educational use permissible. |

---

### 4.4 Flex: Power Quality - Unseen Challenges in Data Centers

| Field | Value |
|-------|-------|
| **Title** | Power quality: Behind some of the biggest data center challenges |
| **Publisher** | Flex (contract manufacturer) |
| **URL** | https://flex.com/resources/power-quality-the-unseen-phenomenon-behind-some-of-the-biggest-data-center-challenges |
| **Access** | Public blog/resource |
| **Date/Version** | 2020s; AI/HPC load focus |
| **RAG Tags** | harmonics, subharmonics, load pulsing, VFD harmonics, UPS failure modes, power-factor degradation, cooling system stability, generator transients, Flex CESS solution |
| **Why It Matters** | Advanced power-quality issues specific to high-density AI/HPC workloads. Discusses subharmonics (load-pulsing artifact) that can destabilize DC/DC converters, degrade power quality, and shorten equipment lifespan. Cooling-system sensitivity to voltage/frequency instability. Valuable for trainer on emerging operational complexity and why power monitoring (THD, harmonics, load dynamics) is increasingly critical for reliability. |
| **License/TOS** | Flex commercial resource; public access. Educational reference permissible. |

---

## 5. MAGNETIC-BEARING CHILLER TECHNOLOGY & EFFICIENCY

### 5.1 DOE: Magnetic-Bearing Chiller Compressors

| Field | Value |
|-------|-------|
| **Title** | Magnetic-Bearing Chiller Compressors |
| **Publisher** | U.S. Department of Energy (FEMP) |
| **URL** | https://www.energy.gov/cmei/femp/magnetic-bearing-chiller-compressors |
| **Access** | Public landing page + case study |
| **Date/Version** | 2010s FEMP case study; still-current technology |
| **RAG Tags** | oil-free compressor, magnetic bearing (radial, axial), variable-speed drive, part-load efficiency (peak at 27–33% load), vibration reduction, noise reduction, low maintenance (no oil changes), retrofit capability |
| **Why It Matters** | Government endorsement of MBC technology. Explains why magnetic bearings eliminate oil friction losses, reduce vibration/noise, and enable high part-load efficiency. Covers retrofit-vs.-new-install decision logic. Critical for trainer on why YMC² magnetic-bearing design is industry-leading for data-center applications (especially high-availability, low-load operation). |
| **License/TOS** | U.S. government; public domain. |

---

### 5.2 GSA: Next-Generation Chillers (MBC vs. VSS Comparison)

| Field | Value |
|-------|-------|
| **Title** | GPG-009: Variable Speed Magnetic Bearing Chiller |
| **Publisher** | U.S. General Services Administration (GSA) Green Building Programs |
| **URL** | https://www.gsa.gov/system/files/09-Next-Generation%20Chillers.pdf |
| **Access** | Public PDF (government) |
| **Date/Version** | 2010s; foundational MBC evaluation |
| **RAG Tags** | MBC efficiency curve (peak 27–33% load), VFD (variable-frequency drive) screw chiller comparison, condenser water temperature limits (MBC 65°F vs. VSS 55°F), chiller staging strategy, O&M training requirements, mission-critical applications |
| **Why It Matters** | Direct comparison of MBC (magnetic-bearing centrifugal) vs. VSS (variable-speed screw) chillers for mission-critical data centers. Shows MBC peak efficiency at partial load, narrower condenser-water temperature tolerance (requires tighter control), and advantages/tradeoffs. Essential for trainer on why MBC chillers require different operational discipline than traditional chillers, and how to optimize staging. |
| **License/TOS** | U.S. government; public domain. |

---

### 5.3 US Patent 6463748: MBC Control Apparatus & Method

| Field | Value |
|-------|-------|
| **Title** | Apparatus and method for controlling a magnetic bearing centrifugal chiller |
| **Publisher** | U.S. Patent Office |
| **Patent** | 6463748 |
| **URL** | https://exa.ai/library/legal/patent/v8n0j8s2h1f |
| **Access** | Public patent (USPTO) |
| **Date/Version** | 1990s patent; foundational MBC control |
| **RAG Tags** | magnetic bearing unit (MBU), microprocessor control, radial/axial bearing orbits, speed control, capacity control, surge prevention, active magnetic-bearing feedback loop, compressor rotor levitation |
| **Why It Matters** | Foundational patent for active magnetic-bearing control in centrifugal chillers. Explains real-time bearing-orbit monitoring, microprocessor adjustment of bearing currents, and integration with VSD (variable speed drive). Valuable for deep technical understanding of how MBC continuously self-adjusts to maintain stable operation. |
| **License/TOS** | U.S. government patent; public domain. |

---

### 5.4 Research: Using Magnetic-Bearing Orbit Data for Efficiency Optimization

| Field | Value |
|-------|-------|
| **Title** | Using Magnetic Bearing Orbit Information to Maximize Centrifugal Compressor Efficiency at Off-Design Conditions |
| **Publisher** | Industry research / conference paper |
| **URL** | https://exa.ai/library/publication/dtgd9f34mtf |
| **Access** | Public research archive |
| **Date/Version** | 2010s research |
| **RAG Tags** | bearing orbit feedback, compressor efficiency, surge margin, rotating stall, incipient-stall operation, flow recirculation, variable-geometry diffuser, active control loop |
| **Why It Matters** | Advanced research on using magnetic-bearing position feedback to optimize compressor efficiency. Explains how MBC can operate close to surge safely (incipient stall with minimal flow recirculation) by monitoring bearing disturbances. Valuable for trainer on why MBC can be so efficient at low load: feedback control allows operation at the edge of safe zone without risk. |
| **License/TOS** | Research publication; public access. Educational use permissible. |

---

## 6. HEAT-EXCHANGER & WATERBOX DESIGN

### 6.1 Trane: Heat Exchanger Options for CenTraVac Chillers (Engineering Bulletin CTV-PRB018)

| Field | Value |
|-------|-------|
| **Title** | Engineering Bulletin: Heat Exchanger Options for CenTraVac Centrifugal Chillers |
| **Publisher** | Trane Technologies |
| **Bulletin** | CTV-PRB018-EN |
| **URL** | https://rumfordportal.com/wp-content/uploads/2017/07/CTV-PRB018-EN_11132012.pdf |
| **Access** | Public PDF (archived) |
| **Date/Version** | November 2012 |
| **RAG Tags** | marine waterbox, removable waterbox, waterbox hinges, tube cleaning, sacrificial anode, magnesium/zinc anode, epoxy coating, tube fouling, scale prevention, water treatment, cleaning intervals |
| **Why It Matters** | Detailed guidance on waterbox design for optimal maintenance and fouling control. Covers marine-style removable waterbox (hinged end-plate), anode placement and replacement without disconnecting pipes, protective coatings (Belzona superior to epoxy), and cleaning intervals. Essential for trainer on maintenance scenarios: how to diagnose and clean fouled condenser tubes, coordinate with water-treatment program, and plan preventive maintenance. |
| **License/TOS** | Trane engineering bulletin; archived public access. Educational reference permissible. |

---

### 6.2 Daikin: Centrifugal Chiller Installation, Operation & Maintenance

| Field | Value |
|-------|-------|
| **Title** | Installation, Operation and Maintenance Manual (Water-Cooled Centrifugal Chillers EWWD-FZ) |
| **Publisher** | Daikin Industries |
| **URL** | https://www.daikin.es/content/dam/document-library/installation-manuals/as/water-cooled-centrifugal-chillers/ewwd-fzxs/EWWD-FZ_D-EIMWC00908-16_Installation%20and%20operation%20manuals_English.pdf |
| **Access** | Public PDF (manufacturer) |
| **Date/Version** | 2016; current Daikin design |
| **RAG Tags** | waterbox, tube material (copper, titanium, stainless), evaporator, condenser, piping isolation, air venting, cavitation prevention, filtration, water treatment, freeze protection, pre-cleaning, chemical compatibility |
| **Why It Matters** | Comprehensive installation and operations guide for water-cooled centrifugal chiller. Covers piping design (minimize elbows/vertical changes), isolation mounts (vibration), strainers/filters (particle exclusion), air venting, tube-cleaning procedures, and water-treatment fundamentals. Valuable for trainer on commissioning checklist, pre-startup verification, and troubleshooting water-related issues (cavitation, corrosion, scaling). |
| **License/TOS** | Daikin manufacturer manual; public access. Educational reference permissible. |

---

### 6.3 Trane: Centrifugal Water Chillers Air-Conditioning Clinic

| Field | Value |
|-------|-------|
| **Title** | Centrifugal Water Chillers Air Conditioning Clinic |
| **Publisher** | Trane Technologies |
| **Form** | TRG-TRC010-EN |
| **URL** | https://www.tranebelgium.com/files/book-doc/10/en/10.n4mz18g9.pdf |
| **Access** | Public PDF (manufacturer) |
| **Date/Version** | 2012; foundational chiller clinic |
| **RAG Tags** | air infiltration impact (pressure, efficiency, surge risk), daily visual inspection, water treatment, tube cleaning (sludge, scale), heat-transfer surface maintenance, oil analysis, refrigerant charge assessment, moisture/acidity/metal monitoring |
| **Why It Matters** | Practical operations clinic on chiller care and maintenance. Covers why air infiltration must be prevented (reduces cooling surface, increases pressure/power, can trigger surge), importance of daily inspection, water treatment role, tube-cleaning procedures, and predictive maintenance through oil analysis. Valuable for trainer on shift-check deck items and operator awareness of maintenance consequences. |
| **License/TOS** | Trane commercial clinic material; public access. Educational use permissible. |

---

## 7. CHILLER CONTROL & CAPACITY MODULATION

### 7.1 YORK: System Operation Description (YVAM with OptiView)

| Field | Value |
|-------|-------|
| **Title** | System operation description - YORK YVAM Centrifugal Chiller with OptiView Control Center |
| **Publisher** | Johnson Controls / YORK |
| **URL** | https://docs.johnsoncontrols.com/chillers/r/YORK/en-US/YVAM-with-OptiView-Control-Center/625/System-fundamentals/System-operation-description |
| **Access** | Public landing page / documentation portal |
| **Date/Version** | Current YORK documentation |
| **RAG Tags** | compressor lift, speed control sequencing, variable geometry diffuser (VGD), inlet guide vane (IGV) closing, anti-surge minimum frequency, stall prevention, leaving chilled liquid temperature (LCHLT) setpoint, capacity control logic |
| **Why It Matters** | Official YORK explanation of chiller capacity control strategy: speed first (until minimum lift required), then VGD closes (when further speed reduction would cause surge). Covers active anti-surge minimum frequency calculation and continuous updating. Critical for trainer on understanding why chiller control sequences speed and vane position, and why surge margin is actively managed. |
| **License/TOS** | Johnson Controls; public portal access. Educational use permissible. |

---

### 7.2 US Patent 5355691: Dynamic Surge Boundary Control

| Field | Value |
|-------|-------|
| **Title** | Control method and apparatus for a centrifugal chiller using a variable speed impeller motor drive |
| **Publisher** | U.S. Patent Office |
| **Patent** | 5355691 |
| **URL** | https://exa.ai/library/legal/patent/j4ht3ktrwc1 |
| **Access** | Public patent (USPTO) |
| **Date/Version** | 1990s foundational patent |
| **RAG Tags** | dynamic surge boundary control (SBC), pressure coefficient, capacity coefficient, compressor performance map, IGV + speed control coordination, surge detection (motor current), SBC curve adjustment, pressure-error deadband |
| **Why It Matters** | Foundational patent for dynamic surge boundary control in variable-speed chillers. Explains how a compressor operating map (pressure vs. capacity) is used to define a surge-control curve that keeps the chiller away from actual surge. Covers how surge detection (motor current spikes) triggers speed increase and SBC curve adjustment. Essential for deep understanding of how OptiView/YMC² prevents surge. |
| **License/TOS** | U.S. government patent; public domain. |

---

## 8. NREL: WORLD'S MOST ENERGY-EFFICIENT DATA CENTER (CHILLER-LESS DESIGN)

### 8.1 DCDM1: Lessons Learned from NREL HPC Data Center

| Field | Value |
|-------|-------|
| **Title** | DCDM1: Lessons Learned from the World's Most Energy Efficient Data Center |
| **Publisher** | Lawrence Berkeley National Laboratory (LBNL) / NREL |
| **URL** | https://datacenters.lbl.gov/sites/default/files/Lessons_Learned_NREL.pdf |
| **Access** | Public PDF (national lab) |
| **Date/Version** | 2014 NREL ESIF data center; operational results 4+ years |
| **RAG Tags** | chiller-less design, direct liquid cooling, warm-water supply (24°C), warm-water return (35–40°C), waste-heat capture, heat reuse (office/lab), PUE 1.04, on-site water savings |
| **Why It Matters** | Demonstration that chiller-less, direct-liquid-cooling data centers can achieve PUE 1.04 with waste-heat reuse. Shows extreme end of cooling-design spectrum: no mechanical chiller needed because warm-water return (35–40°C) is useful for building heating. Valuable for trainer perspective on cooling design choices, chiller vs. chiller-less, and waste-heat opportunities. Not typical for most data centers but demonstrates best-in-class efficiency. |
| **License/TOS** | LBNL/NREL public domain; freely reproducible. |

---

### 8.2 NREL: Thermosyphon Cooler Hybrid System (Water Savings)

| Field | Value |
|-------|-------|
| **Title** | Thermosyphon Cooler Hybrid System for Water Savings in an Energy-Efficient HPC Data Center |
| **Publisher** | Lawrence Berkeley National Laboratory (LBNL) / NREL |
| **URL** | https://datacenters.lbl.gov/sites/default/files/Thermosyphon%20Cooler%20Hybrid%20System%20for%20Water%20Savings%20Paper.pdf |
| **Access** | Public PDF (national lab) |
| **Date/Version** | 2014–2016 operational trial results |
| **RAG Tags** | thermosyphon cooler (TSC), dry cooler, hybrid cooling tower + dry cooler, water usage effectiveness (WUE), on-site water savings, 24-month results, 2.1M gallons saved |
| **Why It Matters** | Demonstrates water-savings strategy for data centers with liquid cooling: hybrid TSC (dry cooler, refrigerant-based passive cycle) + cooling tower. Shows how dry cooler can supplement tower during cooler months, reducing water use by ~50% (WUE 0.70 L/kWh vs. 1.27 L/kWh tower-only). Valuable for trainer on emerging water-conservation trends and economic trade-offs. |
| **License/TOS** | LBNL/NREL public domain. |

---

### 8.3 NREL: Liquid Cooling Your Data Center

| Field | Value |
|-------|-------|
| **Title** | Liquid in the Rack: Liquid Cooling Your Data Center |
| **Publisher** | Lawrence Berkeley National Laboratory (LBNL) / NREL |
| **URL** | https://datacenters.lbl.gov/sites/default/files/Liquid_Cooling_Your_Data_Center-NREL-EE.pdf |
| **Access** | Public PDF (national lab) |
| **Date/Version** | 2010s foundational guide |
| **RAG Tags** | direct liquid cooling, chiller-less, CDU (cooling distribution unit), component-level cooling, heat-exchanger approach, pump efficiency, high-density racks (60–80 kW), waste-heat reuse, hybrid cooling |
| **Why It Matters** | Comprehensive guide to liquid-cooling design and operation at NREL HPC facility. Covers why direct liquid cooling is essential for high-density racks, cooling-distribution-unit design (heat exchangers, flow control, filtration), and waste-heat capture. Contrasts with traditional chiller-based systems. Valuable for trainer perspective on emerging cooling technologies and evolution toward liquid cooling. |
| **License/TOS** | LBNL/NREL public domain. |

---

## Known Gaps & Limitations

| Gap | Impact | Status |
|-----|--------|--------|
| **YORK YMC² IOM** (Form 160.78-IOM or similar) | Complete installation-sequence documentation for technician training | Behind Johnson Controls login portal; not publicly accessible. Recommend requesting from JCI support or trainer's existing maintenance contracts. |
| **YORK YMC² Mod B** (newer magnetic-bearing generation) | Latest magnetic-bearing design details | Limited public documentation found; refer to Form 160.84-OM1 (Mod B operations guide). |
| **ASHRAE 90.1** (full edition) | Commercial building economizer requirements (informative for data-center crossover) | Paywalled; reference card and summaries public. Use free excerpts. |
| **CTI STD-203 & STD-201** (full standards) | Field-erected tower design & thermal certification details | Paywalled by CTI; overview and FAQ public. Standards purchase required for full ingest. |
| **Uptime Tier Standard: Topology** (full standard) | Detailed fault-tolerance and redundancy topologies (Tier I–IV) | Paywalled; public landing pages and summaries available. Standard purchase required. |
| **Magnetic-bearing patent portfolio** | Detailed control algorithms for orbit monitoring | Patent US 5355691 & 6463748 public; subsequent patents and trade secrets proprietary. |
| **Real-world YMC² plant design case studies** | Documented data-center installations, lessons learned | Limited public domain case studies; available through ASHRAE conferences, LBNL, NREL, GSA GPG. |

---

## Ingest Recommendations

### High Priority (Must-Have for Trainer Grounding)
1. **160.78-N1** (Installation & Reassembly) — foundational chiller knowledge
2. **160.78-O1 & 160.78-O2** (Operations & VSD) — daily operator procedures
3. **ASHRAE 90579-2021** (Thermal Guidelines) — facility design basis & environmental setpoints
4. **Uptime Tier Standard (public summaries)** — redundancy & availability context
5. **DOE Best Practices (July 2024)** — current industry-standard cooling design
6. **Form 160.00-AD5** (Water Materials Guide) — waterbox/corrosion knowledge
7. **Peterson: Avoiding Surge** — operator awareness (surge risk, control logic)

### Medium Priority (Valuable Context)
8. **EPA ENERGY STAR Top 12** — quick-win efficiency measures
9. **Trane: Water-Side Economizer** — free-cooling operation logic
10. **CTI STD-201 FAQ** — cooling-tower performance expectations
11. **Magnetic-bearing patent US 6463748** — MBC control fundamentals
12. **NREL chiller-less design papers** — emerging technology perspective
13. **Vertiv: Dedicated CDU UPS** — power-reliability context

### Lower Priority (Reference / Advanced Topics)
14. **ASHRAE 2023 HVAC Chapter 20** — comprehensive facility design (paywalled)
15. **GSA GPG-009 (MBC vs. VSS)** — chiller technology comparison
16. **IEEE Modular Power Center** — electrical architecture depth
17. **Purdue VFD control** — advanced control theory
18. **Daikin/Trane clinics** — competitor perspectives on design/maintenance

---

## License & Attribution Notes

- **Government sources** (EPA, DOE, NREL, LBNL, NIST, GSA, IEEE): Public domain or freely licensed; full ingest permissible with attribution.
- **ASHRAE standards**: Paywalled; reference cards, excerpts, and summaries public. Educational ingest with attribution permissible; avoid full-text reproduction without license.
- **Johnson Controls / YORK documents**: Commercial; public access via manufacturer portal. Educational derivative work (trainer) likely fair-use; verify per customer terms.
- **Research papers & conference**: Peer-reviewed papers generally public-access; permissible for educational training.
- **Industry whitepapers** (Trane, Vertiv, Flex): Public marketing materials; ingest permissible with citation.
- **Patents**: U.S. government public domain; full ingest permissible.

---

## Next Steps

1. **Prioritize high-value sources** (list above) for RAG vector ingest.
2. **Verify access** to paywalled standards (ASHRAE 90.4, CTI STD-201, Uptime Tier); negotiate institutional licenses if needed.
3. **Request proprietary YORK docs** (IOM, Mod B guides) from Johnson Controls support or maintenance contractor.
4. **Build domain-specific thesaurus** (e.g., LCHLT, IGV, VGD, MBC, surge, economizer, wet-bulb, etc.) to improve retrieval.
5. **Index by operational scenario** (startup, shutdown, surge recovery, economizer engagement, UPS failover) to support context-aware trainer responses.
6. **Cross-reference standards** (ASHRAE → Uptime → DOE) to establish facility-design dependency chain for trainer explanations.

---

**Catalog Date:** October 2026  
**Verified URLs:** 25+ primary sources across YORK product, DC standards, heat-rejection, electrical  
**Gaps Identified:** 3 major (YMC² IOM, full ASHRAE/CTI standards, Uptime topology)  
**Recommended Ingest:** High priority 7 sources, Medium priority 6, Lower priority 5
