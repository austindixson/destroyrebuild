# FM-REBUILD-YORK-7: Opus design review

**Reviewer:** Opus (cloud agent)
**Design under review:** `FM-REBUILD-YORK-7-design.md` (Grok Bot, 2026-10-08)
**Repo snapshot verified:** HEAD of `main`, same commit `e029b46`

---

## Verdict: ship-as-phased

The design is thorough, correctly identifies the sim gaps that block useful AI interaction, and phases work so that Phase 0 delivers real trainer value before any LLM cost appears. The tool-bus / confirm-card safety model is the strongest part. Ship Phase 0 after the revisions below; ship Phase 1 after Phase 0 exits green. Phase 2 is gated on manual licensing (Q1) and should not start until that answer arrives.

---

## What is strong

1. **Phase 0 before any LLM.** The design correctly prioritises fixing the sim and building the `PlantController` before adding AI. This means Phase 0 ships testable value (deterministic clock, CH-02 control, capacity model, IT-load input) even if the AI work is deferred or cancelled. Every gap identified in §0 is real (verified below).

2. **Client-side tool execution with server orchestration.** Keeping the sim in the browser and running tools through a single `PlantController` avoids drift between a server sim copy and the client. The stateless server (transcript sent by client) keeps service B simple. The design explicitly accepts the tradeoff that a malicious client can forge tool results.

3. **Safety gates are well-layered (§4.5).** Read/Write/Confirm tiers, client-generated confirm card text (not model-generated), 3-write-per-turn cap, AI write tools blocked during the Incident clock timer, and `actor: "ai"` in the action log. The confirm-card text coming from fixed STE templates is the right call — it removes the model's ability to mislead.

4. **Grading by data, LLM only writes words (§6.2).** Pass/fail from goal tests on snapshot and action log, not from model judgment, makes coaching deterministic and cheap. The hint ladder (question → pointer → answer) is a clean UX.

5. **STE checked in code (§7.1).** Reusing `ste-check.mjs` rules on AI output at runtime with a one-rewrite cap is practical. Fixed STE strings for refusals, confirm cards, and error states means the most important messages are never generated.

6. **Citation architecture (§3.6).** Server-assigned source IDs that the model references, with server-side validation that unknown markers are removed and that numbers must trace to a cited chunk or snapshot field — this is the correct pattern for grounded answers.

7. **Trainer-content-first RAG (Phase 1).** Indexing `content.ts` is zero licensing risk, zero cost, and lets the full tool loop ship before manual ingestion adds complexity.

8. **Railway constraint respected.** The design correctly identifies that `railway.toml` forbids a root `start` script and that the static service must stay as Railpack/Caddy. A second service with private-network proxy is the right workaround.

---

## What is wrong or underspecified

### W1. `PlantController` spec is thin (§3.2)

The design says `PlantController` is "the only way to change plant state" and "owns `running`" but does not specify:
- The snapshot-stack depth (§7.4 says "keep last 20 states" but §3.2 does not).
- Whether Undo restores the full sim state or only the last write-tool delta.
- How the action log is bounded (unbounded array in a long session is a memory leak).
- The `change` event contract — does it fire once per controller call, or once per tick?

**Risk:** Implementors will make different assumptions. Write a short interface contract in the design before building.

### W2. Capacity model is hand-waved (§3.2, Phase 0 exit gate)

The Phase 0 exit gate says "+1.5 MW with one chiller raises hall supply within 60 sim-seconds; starting CH-02 brings it back." But the design does not specify:
- The per-unit capacity value (trainer value — but what value?).
- How load is split between CH-01 and CH-02 when both run.
- Whether CH-02 has its own LCHLT or shares the single sim setpoint.
- The thermal time constant of the hall (is it instant, or is there mass?).

The exit gate is testable, but only if the model's parameters are specified first. §9 Q8 asks whether to use trainer values or manual tables — that question must be answered before Phase 0 starts.

### W3. Transcript size on long sessions (§3.1)

The server is stateless and the client sends the transcript. The design caps tool rounds at 6 per message, but does not cap transcript length. A trainee who runs 50 messages will send a large context window. This matters for cost (§3.5 estimates 2k history tokens — that is only true for early messages) and for context-window limits.

**Fix:** Specify a sliding window or summarisation strategy for the transcript. The summary document (§ Cost and ops) assumes ~2k history tokens but that only holds if the transcript is trimmed.

### W4. `incident.clear` restores a fixed state, not pre-incident state (§4.2)

The design notes: "today this also forces CH-01 on and CH-02 off; the confirm text must say so, or the controller must restore pre-incident state." The current code (verified, `app.ts` line 511–515):

```typescript
this.sim.incident = null
this.sim.ch01Running = true
this.sim.ch02Running = false
```

This always resets to a fixed configuration regardless of what was running before the incident. The design acknowledges this but does not decide which fix to apply. The `PlantController` design should specify: does `clear` restore the pre-incident snapshot (from the stack), or does it always reset to the default? The coaching scenarios need predictable behaviour here.

### W5. `bms-fight` incident is underspecified for sim (§4.3, Incident clock)

The design says `bms-fight` needs a "setpoint oscillation incident" as a new sim input. But the Incident clock `TROUBLE_CASES` entry for `bms-fight` describes LCHLT moving up and down and CRAH valves moving too often. The design does not specify:
- The oscillation parameters (amplitude, period).
- Whether the AI can trigger `bms-fight` via `incident.inject` and what the board looks like.
- Whether the oscillation affects `lchltSet` or `lchltAct` or both.

This is the only one of the 5 Incident clock cases where the sim currently has no board state, so it needs more detail.

### W6. No explicit tool for CH-02 stop (§4.2–4.3)

The tool catalog shows `chiller.start` and `chiller.stop` with `unit: CH-02` under §4.3 (new sim inputs). But the confirm gate only lists CH-01 stop as **C**. CH-02 stop should also be **C** — stopping any running chiller during a scenario is destructive. The table in §4.2 only has `unit: CH-01` for `chiller.start`.

**Fix:** §4.2 should list CH-02 explicitly, or the table should say `unit: CH-01 | CH-02` on every chiller tool row.

### W7. `ui.navigate` gate is ambiguous (§4.2)

The tool is listed as **W** "but only when the trainee asked, or with a 'Show me' button. Never yank the view mid-drill." This is a semantic constraint that cannot be enforced by the client gate logic alone — it requires the server/model to decide whether the trainee "asked." In practice, the model will sometimes navigate uninvited.

**Fix:** Either make `ui.navigate` always a confirm (**C**), or define a simple client-side rule (e.g., "navigate is **C** during an active scenario, **W** otherwise").

### W8. SSE and tool-round protocol not specified (§3.1)

The design says the server streams via SSE and sends `awaiting_tools` to pause for client tool execution. But it does not specify:
- The SSE event types and payload schemas.
- How the client signals tool results back (a POST to a continuation endpoint?).
- Whether the server keeps the SSE connection open during tool execution or closes and re-opens.
- Timeout/retry behaviour if the client disconnects mid-round.

This is a significant implementation surface that needs at least an event-type list and a sequence diagram.

---

## Phase 0 sim gaps: agree/disagree

| Design claim (§0) | Code evidence | Verdict |
|---|---|---|
| IT load is a fixed sine wave with no input | `plantSim.ts:78` — `baseIt = 4.2 + sin(t/18)*0.55 + sin(t/7)*0.15`, never modified by external input | **Agree** |
| Hall temperature does not respond to chiller capacity | `plantSim.ts:81` — `hallSupplyF = 72 + (lchltAct - lchltSet) * 0.8`. No term for running capacity vs load. Adding 1.5 MW changes `hallReturnF` via `itLoadMw * 0.35` but does not overwhelm the plant | **Agree** |
| CH-02 has no direct control | `ch02Running` is only set in chaos buttons (`app.ts:514,518`); no UI start/stop for CH-02 | **Agree** |
| Tower and dry fans are computed outputs | `plantSim.ts:91–92` — `dryFanPct` and `towerFanPct` are local variables in `tick()`, never written by user input | **Agree** |
| `App.running` and `sim.ch01Running` can disagree | Landing incident (`plantSim.ts:129`) sets `this.ch01Running = false` inside `tick()` but nothing touches `App.running`. OptiView chip shows "In operation" (from `App.running`) while the board shows the chiller is landed | **Agree** |
| `troubleHtml()` sets the incident while it renders | `app.ts:1275` — `if (mapIncident[t.id]) this.sim.incident = mapIncident[t.id]` is inside the render method, called on every re-render of the trouble view | **Agree** |
| `bms-fight` has no sim incident | `app.ts:1269–1274` — the `mapIncident` record has no entry for `bms-fight` | **Agree** |
| Sim clock has no pause and no seed | `plantSim.ts:48,75` — uses `performance.now()` directly. No pause, no time-scale, no seed | **Agree** |

### Anything missing from Phase 0

1. **`hallSupplyF` is partially load-aware but not capacity-aware.** The design says "Hall temperature does not respond to chiller capacity" — verified. But `hallReturnF` does include `itLoadMw * 0.35`, so a load increase does warm the return slightly. The capacity model needs to close the loop: if load exceeds running capacity, `lchltAct` should rise above setpoint, which then raises `hallSupplyF`. This is implied but not stated as a formula.

2. **No action log exists today.** The design (§3.2) calls for an action log that records who did what and when. Today there is only `optiLog` (an array of display strings in `App`). The Phase 0 deliverable should include the structured action log (`{ actor, action, args, t, snapshotBefore, snapshotAfter }`), not just the `PlantController`.

3. **Valve reset on clear.** Today, clearing an incident resets `ch01Running` and `ch02Running` but not valve positions, LCHLT setpoint, or weather. The design notes this under `incident.clear` (§4.2) but it is not in the Phase 0 scope list. If the controller snapshot stack is built in Phase 0, this is free. If not, it should be called out.

4. **`failover` always forces `ch02Running = false` before injecting.** `app.ts:518` — `if (v === 'failover') this.sim.ch02Running = false`. This means failover always shows the inhibit path. Once CH-02 control exists (Phase 0), the failover scenario needs to handle the case where CH-02 was already running. The design's scenario spec (§6.5, "Lead trip, standby inhibit") presumes CH-02 is off, but the controller should handle both paths.

---

## Architecture: tool bus + second Railway service + Caddy proxy

### Risks

1. **Caddy misroute.** A bad `handle` block ordering or a missing `{$YORK_API_HOST}` variable breaks either the static site or the API. The current `Caddyfile` has a specific ordering (`/york-chiller/*` before the catch-all). Adding `/api/york/*` must go before both. The design mentions this risk (§10) and recommends a Playwright smoke test on deploy — good.

2. **Two services to deploy.** Railway private networking is simple, but deploy ordering matters: if service B is down, the chat panel must degrade gracefully (show the trainer without AI). The design does not specify the client behaviour when the API is unreachable.

3. **SSE through Caddy.** Caddy reverse-proxies SSE correctly by default (`flush_interval -1`), but Railway's infrastructure proxy may buffer. Verify SSE streaming through the full path (client → Railway edge → Caddy → service B) during Phase 1.

### Simpler alternatives considered

The design already evaluates B1–B4 and rejects B3 (serverless — poor fit for SSE + multi-round + in-memory index) and B4 (client-side key — leaks manual text). B2 (separate subdomain) adds CORS complexity for no gain. **B1 is the right choice.** No simpler alternative exists that keeps secrets off the client, keeps the Railpack constraint, and supports SSE + tool loops.

One possible simplification: if the corpus stays small (Phase 1 only, no manuals), the "in-memory hybrid search" could be a pre-built JSON index shipped with service B's container image rather than a separate build step. This avoids the private bucket for Phase 1.

---

## Safety gates: holes

1. **Model-crafted scenario specs (§6.1, Phase 3 stretch).** The design says "the client validates it against the same schema and caps." But a model-crafted `ScenarioSpec` could set `setup` tools to push the sim to an extreme state (e.g., max IT load + all chillers off + hot weather simultaneously). The schema validation must include semantic caps, not just type checks — max `itLoadMw` delta, at least one chiller running at start, etc. This is flagged as a stretch goal; if it ships, the validation spec must be written first.

2. **No rate limit on confirm-card dismissal.** A user who rapidly clicks "Do the stop" on multiple queued confirm cards could fire several destructive actions in quick succession. The 3-write-per-turn cap applies to model turns, not to queued confirms. Consider a debounce or a per-second cap on C-gate actions.

3. **Undo scope.** The design says "Undo restores the previous controller state." If a write tool changes weather *and* the sim ticks forward, undo must restore the full sim state, not just the weather input. This requires snapshotting the deterministic clock time as well. The snapshot stack depth (20 states) is mentioned in §7.4 but not in the controller spec (W1 above).

4. **`ui.highlight` is listed as R-like but could be disorienting.** If the model calls `ui.highlight` on every hint step during coaching, the trainee sees repeated visual pulses they did not ask for. Consider a per-session highlight limit or a mute toggle.

---

## RAG source catalog impact on phasing

Haiku's RAG source catalog ([PR #16](https://github.com/austindixson/destroyrebuild/pull/16)) verified ~36 URLs across 8 domains. The catalog and ingest queue are solid research artefacts. This section evaluates how they change the Phase 1 / Phase 2 boundary and whether any Tier-1 public PDFs can enter the pipeline before full JCI IOM rights are resolved.

### What the catalog confirms

The design (§5) assumes two corpora: trainer content (Phase 1) and JCI manuals (Phase 2, blocked on Q1). The catalog shows the real corpus landscape is wider:

| Category | Catalog count | Public PDFs | Key observation |
|---|---|---|---|
| YORK YMC² product docs | 7 | 5 public, 1 ManualsLib, 1 behind JCI login | Forms 160.78-O1, 160.78-N1, 160.00-O4, 160.00-AD5, 160.76-EG1 are publicly hosted on `docs.johnsoncontrols.com`. The IOM (160.78-IOM) is behind a login. |
| DC standards (ASHRAE, Uptime) | 4 | Reference cards/summaries public; full texts paywalled | ASHRAE 90579-2021 reference card is free. Full 90.4-2025 available via mirrors. |
| Heat rejection / free cooling | 10 | 8 public (DOE, EPA, Trane, Peterson, LBNL) | US government docs are public domain. Trane/Peterson whitepapers are public. |
| Electrical / UPS / power | 4 | All public | Vertiv, Trane/Eaton, IEEE, Flex — all publicly accessible. |
| MBC technology | 4 | All public (DOE, GSA, patents) | US patents are public domain. DOE/GSA case studies are government publications. |
| Heat exchanger / waterbox | 3 | All public | Trane, Daikin manufacturer docs. |
| Chiller control / modulation | 2 | All public | JCI portal landing page, US patent. |
| NREL chiller-less | 3 | All public (LBNL/NREL) | Government/national-lab public domain. |

### Tier-1 public PDFs can start before JCI IOM rights (Phase 1.5)

The design's Phase 2 is defined as "Manual RAG" and is gated entirely on Q1 (manual licensing). But the catalog reveals that several high-value Tier-1 sources are **not** JCI proprietary manuals — they are US government publications, ASHRAE public reference cards, and manufacturer whitepapers with no licensing barrier:

**Sources that can enter immediately (no Q1 dependency):**

1. **DOE Best Practices Guide for Energy-Efficient Data Center Design (July 2024)** — public domain, ~60 relevant pages. Covers chiller staging, economizer logic, part-load performance. Directly supports coaching scenarios on "why start the second chiller" and "when to use free cooling."

2. **Peterson: Avoiding Centrifugal Chiller Surge** — public PDF, ~15 pages. Covers surge mechanism, IGV control, load staging. Supports the existing `high-head` incident and teaches the "why" behind not defeating safeties.

3. **EPA ENERGY STAR Top 12** — government public domain, ~8 pages. Quick-reference efficiency guidance. Supports shift-deck teaching.

4. **ASHRAE 90579-2021 reference card** — free public PDF, 2–4 pages. Defines the thermal envelope (18–27°C recommended). Explains why the LCHLT setpoint matters for hall temperature.

5. **GSA GPG-009: MBC vs VSS comparison** — government public domain, ~8 pages. Explains why MBC part-load efficiency peaks at 27–33% load — directly relevant to the trainer's "low RLA with hot hall" scenario.

**Recommendation: add a Phase 1.5 between Phase 1 and Phase 2.**

- **Phase 1** stays as designed: trainer-content RAG from `content.ts`, zero licensing risk, full tool loop.
- **Phase 1.5 (new):** Ingest the public-domain Tier-1 sources listed above (~100 pages total). These use the same hybrid-search pipeline that Phase 2 builds, so Phase 1.5 is a low-risk rehearsal of the ingest tooling. Citation kind would be `public-reference` (distinct from `manual` and `trainer`). No JCI licensing question.
- **Phase 2** stays as designed: JCI manual ingest, gated on Q1.

This gives the coach real "why" citations from authoritative sources before the JCI question is resolved. The DOE guide alone would let the coach cite government-backed best practices for chiller staging and economiser engagement — the two scenarios that the design's Phase 3 coaching depends on most.

### Sources the catalog lists that should NOT enter early

- **Form 160.78-O1 and 160.78-O2** are publicly accessible on the JCI portal and ManualsLib, but they are Johnson Controls commercial documents. The catalog marks them as "educational ingest likely fair-use" — that is the catalog author's judgment, not a legal opinion. These should stay gated on Q1 alongside the IOM.
- **ASHRAE 90.4-2025 full standard** is available via mirrors (antpedia.com), but this is a paywalled standard redistributed without clear authorisation. Use only the public addendum and reference summaries.
- **Uptime Tier full standard** is paywalled. Use only the public landing-page summaries.

### Ingest realism

The queue estimates 500–600 pages for Tier 1 with 8–12 hours of parse/vector time. That estimate is reasonable for a batch job on the captain's machine. But:

1. **The queue conflates "Tier 1" with "Phase 1."** The queue's Tier 1 includes Forms 160.78-O1 and 160.78-O2 (JCI manuals), which are gated on Q1. The queue should separate "Tier 1, no licensing barrier" from "Tier 1, needs Q1."

2. **Page counts are approximate.** The catalog says "100–150 pages" for Form 160.78-O1 but does not record the actual page count from the fetched PDF. The ingest script should log the actual page count during extraction and compare to estimates.

3. **No chunk-quality gate.** The design (§5.3–5.4) specifies hybrid BM25 + embeddings. The catalog does not address chunk quality — how to handle scanned pages (OCR), embedded diagrams (figures with no alt-text), or multi-column tables that `pdftotext` misparses. The design's §5.3 mentions OCR tagging and table handling, which is good, but the ingest queue should flag which sources are likely to have these issues (the engineering guides and patents probably have dense diagrams).

4. **The "domain thesaurus" suggestion in the queue (LCHLT, IGV, VGD, MBC, etc.) is valuable.** The trainer's `GLOSSARY` in `content.ts` already defines 25+ terms. The ingest pipeline should re-use that glossary for query expansion, not build a separate thesaurus.

### Licensing summary after catalog review

| Source class | Q1 needed? | Phase |
|---|---|---|
| Trainer content (`content.ts`) | No | 1 |
| US government docs (DOE, EPA, LBNL, GSA, patents) | No — public domain | 1.5 |
| ASHRAE public reference cards and summaries | No — free publications | 1.5 |
| Manufacturer whitepapers (Trane, Peterson, Vertiv, Flex) | No — public marketing materials, cite source | 1.5 |
| JCI Forms 160.78-O1, O2, N1, AD5, EG1 | **Yes — Q1** | 2 |
| JCI IOM (160.78-IOM, behind login) | **Yes — Q1 + portal access** | 2 |
| Paywalled standards (ASHRAE 90.4, Uptime Tier, CTI) | Purchase decision | 2 or later |

---

## RAG: trainer-content-first, then private JCI manuals

### Licensing (Phase 2 blocker)

Q1 is the hard gate. The design correctly treats this as a blocker and offers a fallback (form + section pointers only, no excerpts). Specific concerns:

- **Short excerpts (≤ 300 chars) are likely fair use for educational purposes**, but JCI's terms of use for the O&M forms may restrict digital reproduction. The captain must confirm with JCI or legal, not assume.
- **The index contains chunk text** (§5.2). If the index leaks, the full manual text is exposed. The private-bucket storage and the CI guard for PDFs in `dist/` are necessary but insufficient — also guard the index artifact. The design mentions this but does not specify access controls on the bucket.
- **No "download full manual" link is served.** Good. The design explicitly prevents this. But the API response includes excerpts — ensure the response schema enforces the 300-char cap server-side, not just in the prompt.

### Citation integrity

The citation architecture is solid (server-assigned IDs, server-side validation, numeric guard). One gap:

- **Trainer-content citations point to `content.ts` entries by ID** (e.g., `TROUBLE_CASES.landing.teach`). If `content.ts` changes between builds, a cached citation ID could point to different text. Since the trainer-content index is built at build time from the TS source (§5.1), this is fine for a single deploy. But if the client and server are on different deploy versions (during a rolling deploy), the citation IDs could mismatch. Specify that the trainer-content index includes a build hash, and the client sends its build hash with each request so the server can reject a version mismatch.

### STE checks in code

The design says "move the rule logic of `ste-check.mjs` into a shared module so service B runs the same checks on output" (§7.1). The current `ste-check.mjs` is a standalone Node script with ~400 lines of scanning logic including JS string extraction, HTML stripping, and sentence splitting. For runtime use in service B, you need only the core checks (word count, contraction regex, passive regex, phrasal verb list) applied to plain text sentences. The JS/HTML parsing is not needed at runtime because the AI output is already plain text.

**Risk:** If someone ports the entire script including the JS scanner into the runtime module, it adds unnecessary complexity. Specify that only the sentence-level checks are shared; the file-scanning harness stays dev-only.

---

## Teaching / coach: grading in code vs model prose

### Eval gaps

1. **Goal test DSL (§6.1).** The `goals[].test` field is described as a "small DSL on snapshot + actionLog" but the DSL is not specified. This is the core of deterministic grading — if the DSL is too weak, scenarios fall back to LLM judgment; if too complex, scenarios are hard to author. Specify at least the operators (field comparisons, action-log assertions, time constraints) before Phase 3.

2. **Hint quality has no eval.** The hint ladder (question → pointer → answer) is generated by the LLM. The design has eval gates for citations (Phase 2 gold set) and scenario pass/fail (Phase 3 Playwright), but no eval for hint quality. A bad hint ("What gauge shows the thing?") is not caught by any gate. Consider a small eval set of expected hint patterns for 2–3 scenarios.

3. **Debrief eval.** "Debrief cites ≥ 1 manual or trainer source per mistake" is the Phase 3 exit gate. This is testable via Playwright (check that each mistake paragraph has a citation marker). But it does not test whether the cited source is *relevant* to the mistake. A citation to an unrelated glossary entry would pass the gate. Consider: the gold set should include expected citation IDs per mistake, not just "any citation."

4. **Cost per scenario.** The Phase 3 exit gate says "≤ 8 LLM calls per scenario" and "cost per scenario within the target set in Q5." But Q5 has no answer yet. Define a strawman budget (e.g., $0.20 per scenario) so the coach design targets a number.

---

## Cost and ops realism

The per-message estimate (~$0.005–$0.05) is reasonable at current mid-tier model prices for 7k input / 400 output tokens × 1–3 rounds. The range is wide because model choice matters 10×.

Concerns:

1. **Prompt caching assumption.** The design mentions prompt caching (system prompt + tool schemas are static). Not all providers support this, and the thin adapter (§3.4) means the provider can change by env var. The cost estimate should distinguish "with caching" from "without caching" so the budget cap is set correctly.

2. **1,000 messages/day ≈ $5–$50/day** assumes one instance. If the site is public and anonymous (Q6), a viral day could spike to 10k+ messages. The daily budget cap (§3.5) is the right mitigation, but the polite-off message should appear before the budget is exhausted (e.g., at 80% of cap), not after.

3. **Embedding cost is not estimated.** Phase 2 ingestion runs offline, but the query-time embedding (one embedding per user query for hybrid search) is a per-request cost. At current embedding prices this is negligible (<$0.001 per query), but it should be explicit.

4. **Railway service B cost.** A small Node service on Railway costs ~$5–10/month for a single instance with low traffic. This is negligible relative to LLM costs. But the design should specify the instance size and whether auto-scaling is needed.

---

## STE rule for York UI

The design does not violate the STE rule. All fixed UI strings (refusals, confirm cards, error states, budget messages) are hand-written in STE and stored in `content.ts`. AI-generated output is checked at runtime with the same rules as the dev-time `ste-check.mjs`. Verbatim manual excerpts are explicitly exempted as quotes.

One note: the design says the system prompt "includes the STE rules" (§7.1). The STE rules from `ste-check.mjs` include ~50 imperative verbs, ~70 phrasal verb forms, passive voice detection, and word-count limits. Putting all of this in the system prompt may consume significant tokens. Consider: include only the summary rules in the system prompt (sentence length limits, approved verb list, no contractions, active voice) and run the full regex checks server-side as a post-filter. The design already does this ("STE check runs on every answer, with one rewrite") — just ensure the system prompt is a short summary, not a dump of the full regex list.

---

## Ordered revision list

### Must-fix before build

| # | Item | Design section | Effort |
|---|---|---|---|
| 1 | Specify `PlantController` interface contract: method signatures, event contract, snapshot-stack depth, action-log structure and bounds | §3.2 | Small — one interface definition |
| 2 | Specify capacity model parameters: per-unit MW, load-split logic, hall thermal time constant, formula linking load > capacity to `lchltAct` rise | §3.2, Phase 0 | Small — a paragraph of equations |
| 3 | Decide `incident.clear` behaviour: restore pre-incident snapshot vs reset to default. Document in §4.2 | §4.2 | Trivial — one sentence |
| 4 | Specify `bms-fight` sim behaviour: oscillation target (`lchltSet` vs `lchltAct`), amplitude, period | §4.3 | Small |
| 5 | Add transcript windowing/summarisation strategy to §3.1; update the cost estimate for long sessions | §3.1, §3.5 | Small |
| 6 | Specify SSE event types, tool-result POST endpoint, reconnect/timeout behaviour | §3.1 | Medium — a short protocol spec |
| 7 | Add CH-02 to every chiller tool row with correct gate (C for stop, W for start) | §4.2 | Trivial — table edit |
| 8 | Make `ui.navigate` gate rule explicit and enforceable by the client | §4.2 | Trivial — one sentence |
| 9 | Specify goal-test DSL operators (field comparison, action-log assertion, time constraint) | §6.1 | Small |
| 10 | Answer Q8 (capacity model numbers) before Phase 0 starts | §9 | Decision, not design work |
| 11 | Add Phase 1.5 (public-domain Tier-1 sources) to the phase plan; separate the RAG source queue into "no licensing barrier" vs "needs Q1" | §8, catalog | Small — table update |

### Nice-to-have before build

| # | Item | Design section |
|---|---|---|
| 12 | Add a build-hash check to trainer-content citations to handle rolling deploys | §5.1 |
| 13 | Specify client degradation when API is unreachable (show trainer without chat, no error wall) | §3.3 |
| 14 | Add a per-second debounce on C-gate confirm actions | §4.5 |
| 15 | Add a `ui.highlight` mute toggle or per-session limit | §4.2 |
| 16 | Split cost estimate into "with prompt caching" and "without" rows | §3.5 |
| 17 | Add an 80%-of-budget warning before the hard cap | §3.5 |
| 18 | Specify that only the sentence-level STE checks are shared to runtime; the JS scanner stays dev-only | §7.1 |
| 19 | Add hint-quality eval set (2–3 scenarios with expected hint patterns) | §6, §8 Phase 3 |
| 20 | Specify semantic caps for model-crafted scenario specs (max load delta, minimum running chillers) | §6.1 |
| 21 | Add chunk-quality gate to the ingest pipeline for sources with diagrams, multi-column tables, or scanned pages | §5.3, catalog |
| 22 | Reuse the `content.ts` GLOSSARY for query expansion in the ingest pipeline instead of building a separate thesaurus | §5.5, catalog |

---

## Questions for captain

These merge with the design's §9 list. Items marked **(existing)** are already in §9; items marked **(new)** are additions from this review.

1. **(existing, Q1)** Manual rights. Do we have permission to index JCI forms and show short excerpts? This blocks Phase 2. If the answer is "no excerpts," the fallback (form + section pointers only) is viable but weaker.

2. **(existing, Q2)** Approve B1 (second Railway service). Where does the API code live — `york-api/` in this repo or a new repo? (Recommendation: same repo, `york-api/` directory, shared CI.)

3. **(existing, Q3)** Model/provider. Pick by eval set against 2–3 candidates, behind the adapter. Any provider to exclude?

4. **(existing, Q4)** Fans writable? (Recommendation: keep fans read-only in Phase 0–1. The current computed fans model automatic control realistically. Add override as a Phase 3 option if scenarios need it.)

5. **(existing, Q5)** Daily budget cap and target cost per message / per scenario.

6. **(existing, Q6)** Public and anonymous, or gated?

7. **(existing, Q7)** Transcript retention: 30 days with no IP, or none?

8. **(existing, Q8, now a Phase 0 blocker)** Capacity model numbers. Must be answered before Phase 0 starts, not deferred. Use trainer values clearly labelled as such.

9. **(existing, Q9)** AI navigation: "Show me" button only, or autonomous? (Recommendation: "Show me" button only.)

10. **(existing, Q10)** Model-built scenarios: hand-written specs only until the semantic-cap validation is specified.

11. **(existing, Q11)** Placement: nav item, floating dock, or both?

12. **(new)** `incident.clear` behaviour: restore pre-incident sim state, or always reset to the fixed default (CH-01 lead, CH-02 standby, no incident)?

13. **(new)** Should the API service have a health-check endpoint that the static Caddy can probe, so Caddy can return a clean error page instead of a connection timeout when service B is down?

14. **(new)** SSE through Railway private network: has this been tested? If Railway buffers SSE responses on the internal proxy, the design may need to switch to WebSocket or long-poll as a fallback.

15. **(remove Q3 model preference sub-question if captain has none)** If the captain has no provider preference, remove from the decision list and let the eval set decide.

16. **(new, from catalog)** Approve Phase 1.5: ingest public-domain sources (DOE, EPA, GSA, Peterson, ASHRAE reference card) before Q1 is answered? These carry no licensing risk and let the coach cite authoritative "why" content from day one.

17. **(new, from catalog)** The catalog lists Forms 160.78-O1 and 160.78-O2 as "public access via manufacturer portal." Should we treat publicly hosted JCI docs the same as the gated IOM for Q1 purposes, or is public hosting implicit permission for educational indexing?

---

## Summary

The design is ready to build once the 11 must-fix items are addressed. None of them require rethinking the architecture — they are specification gaps that need a sentence or a paragraph each. Phase 0 is the highest-value work (it improves the trainer with no LLM dependency), and Phase 1 is well-scoped for a first AI integration. Phase 2 depends on an external licensing decision that no amount of engineering can accelerate.

Haiku's RAG source catalog ([PR #16](https://github.com/austindixson/destroyrebuild/pull/16)) widens the available corpus beyond JCI manuals. Approximately 15 public-domain PDFs (DOE, EPA, GSA, LBNL, Peterson, ASHRAE reference cards) can be ingested with zero licensing risk. Adding a Phase 1.5 to ingest these sources gives the coach real "why" citations from authoritative sources before Q1 is resolved — a meaningful improvement to the teaching quality at no legal cost.
