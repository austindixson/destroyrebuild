/**
 * Lightweight data-center plant sim for the trainer UI.
 *
 * Trainer capacity model (not a Johnson Controls rating, not a manual table):
 *
 *   Each unit has capacityMw. Phase 0 uses 5.0 MW per unit.
 *   runningCapacityMw = sum of capacityMw for units with running === true
 *   chillerLoadMw = itLoadMw * (1 - freeCoolPct / 100)
 *   unmetMw = max(0, chillerLoadMw - runningCapacityMw)
 *   Load splits across running units in proportion to capacityMw.
 *   CH-01 and CH-02 share one LCHLT setpoint. There is no per-unit setpoint.
 *
 *   Steady LCHLT rise = unmetMw * 2.4 °F per MW
 *   The rise is a first-order lag with time constant 20 s:
 *     capacityLagF += (targetRise - capacityLagF) * (1 - exp(-dt / 20))
 *   lchltAct = lchltSet + tracking + capacityLagF + bmsFight
 *   hallSupplyF = 72 + (lchltAct - lchltSet) * 0.8
 *
 *   The lag runs only when there is no scripted incident, or during bms-fight.
 *   Landing, failover, high-head, and hall-hot keep their scripted board values.
 *
 * bms-fight (trainer): adds 1.5 °F * sin(2π t / 12 s) to lchltAct only.
 * lchltSet stays at the operator setpoint. Period 12 s. Amplitude 1.5 °F.
 *
 * Fans (tower and dry cooler) stay computed outputs. Phase 0 does not write them.
 *
 * Outdoor coupling (trainer values, not a York operating manual):
 *   oat <= 48°F: LCHLT target 60°F (band 58–62). CHW valve 51%. CW valve 70%. Glycol valve 90%.
 *   48°F < oat < 92°F: LCHLT target 55°F (band 52–58). Valves stay at 72% / 78% / 70%.
 *   oat >= 92°F: LCHLT target 50°F (band 46–52). CHW valve 77%. CW valve 90%. Glycol valve 25%.
 *   setOutdoor moves a target only while that loop is not pinned.
 *   An operator write pins the loop. A value outside the LCHLT band, or a valve that
 *   fights the weather target, raises an alarm. The alarm does not change the write.
 *
 * fleet: N units — the unit list is the extension point. The next slice is a bank
 * of N=18, then 36, with lead/lag staging. That slice is not built here.
 * Phase 0 still draws only CH-01 and CH-02. Capacity already sums every running unit.
 */

export type ChillerMode = 'lead' | 'lag' | 'standby' | 'offline' | 'alarm'

export type TimeScale = 1 | 2 | 5

export const INCIDENT_KINDS = ['high-head', 'hall-hot', 'landing', 'failover', 'bms-fight'] as const

export type IncidentKind = (typeof INCIDENT_KINDS)[number]

export function isIncidentKind(value: string): value is IncidentKind {
  return (INCIDENT_KINDS as readonly string[]).includes(value)
}

export const TRAINER = {
  /** MW one running unit can remove. Trainer value, not a machine rating. */
  chillerCapacityMw: 5,
  /** Steady °F of LCHLT actual rise per MW of unmet chiller load. */
  lchltRiseFPerMw: 2.4,
  /** Hall supply °F per °F of (lchltAct - lchltSet). */
  hallPerLchltF: 0.8,
  /** First-order time constant for the capacity rise, seconds. */
  hallTauS: 20,
  /** Peak °F added to lchltAct during bms-fight. */
  bmsFightAmplitudeF: 1.5,
  /** Full cycle of the bms-fight swing, seconds. */
  bmsFightPeriodS: 12,
  itLoadMinMw: 2,
  itLoadMaxMw: 8,
  itLoadCenterDefaultMw: 4.2,
  /** Unmet MW that raises the capacity alarm. Below this the sine can sit on the edge. */
  unmetAlarmMw: 0.15,
  lchltMinF: 42,
  lchltMaxF: 65,
  /** Outdoor dry-bulb at or below this uses the cold trainer band. */
  coldOatF: 48,
  /** Outdoor dry-bulb at or above this uses the hot trainer band. */
  hotOatF: 92,
  lchltColdCenterF: 60,
  lchltColdLoF: 58,
  lchltColdHiF: 62,
  lchltMildCenterF: 55,
  lchltMildLoF: 52,
  lchltMildHiF: 58,
  lchltHotCenterF: 50,
  lchltHotLoF: 46,
  lchltHotHiF: 52,
  /** Valve percent away from the weather target that raises a fight alarm. */
  valveFightPct: 15,
} as const

export interface ChillerUnitState {
  id: string
  running: boolean
  /** Trainer MW. Not a Johnson Controls rating. */
  capacityMw: number
}

export interface UnitSnapshot extends ChillerUnitState {
  mode: ChillerMode
  /** Percent full-load amps. The board labels this % FLA. */
  rla: number
  condPsig: number
  mbc: 'LEVITATED' | 'LANDED' | 'FAULT'
}

export interface PlantSnapshot {
  t: number
  itLoadMw: number
  hallSupplyF: number
  hallReturnF: number
  lchltSet: number
  /** Trainer LCHLT target for this dry-bulb. Not a York manual value. */
  lchltTargetF: number
  lchltBandLoF: number
  lchltBandHiF: number
  lchltAct: number
  cwetF: number
  oatF: number
  wbF: number
  towerFanPct: number
  dryFanPct: number
  chwDpPsi: number
  cwDpPsi: number
  glycolDpPsi: number
  chwValvePct: number
  cwValvePct: number
  glycolValvePct: number
  chwGain: number
  cwHeadGain: number
  glycolGain: number
  freeCoolPct: number
  chwTargetPsi: number
  chwrF: number
  chwsF: number
  chwrPsi: number
  chwsPsi: number
  cwrF: number
  cwsF: number
  cwrPsi: number
  cwsPsi: number
  glyR: number
  glyS: number
  glyRPsi: number
  glySPsi: number
  reason: string
  /** Visible pair. Derived from the unit list so the existing board stays stable. */
  ch01: { mode: ChillerMode; rla: number; condPsig: number; mbc: 'LEVITATED' | 'LANDED' | 'FAULT' }
  ch02: { mode: ChillerMode; rla: number; condPsig: number; mbc: 'LEVITATED' | 'LANDED' | 'FAULT' }
  /** Every unit. Phase 0 has two. A later fleet slice can pass more. */
  units: UnitSnapshot[]
  /** Sum of capacityMw for running units. Trainer value. */
  runningCapacityMw: number
  /** Chiller load above running capacity. Trainer value. */
  unmetMw: number
  alarm: string | null
  weather: 'mild' | 'design' | 'extreme'
}

export interface PlantState {
  t: number
  paused: boolean
  timeScale: TimeScale
  seed: number
  lchltSet: number
  chwValvePct: number
  cwValvePct: number
  glycolValvePct: number
  oatF: number
  weather: PlantSnapshot['weather']
  incident: IncidentKind | null
  units: ChillerUnitState[]
  itLoadCenterMw: number
  rampFromMw: number
  rampToMw: number
  rampStartT: number
  rampSeconds: number
  capacityLagF: number
  lchltPinned: boolean
  chwPinned: boolean
  cwPinned: boolean
  glycolPinned: boolean
}

export interface PlantSimOptions {
  units?: ChillerUnitState[]
  seed?: number
}

/**
 * Build a trainer fleet. Phase 0 uses count 2 (CH-01 running, CH-02 standby).
 * fleet: N units — next slice is N=18, then 36, with lead/lag staging. Not built here.
 * This helper only assigns ids, the trainer MW, and how many units start running.
 */
export function trainerFleet(
  count: number,
  runningCount = 1,
  capacityMw = TRAINER.chillerCapacityMw,
): ChillerUnitState[] {
  const n = Math.max(1, Math.min(99, Math.round(count)))
  const running = Math.max(0, Math.min(n, Math.round(runningCount)))
  const cap = Math.max(0, capacityMw)
  return Array.from({ length: n }, (_, index) => ({
    id: `CH-${String(index + 1).padStart(2, '0')}`,
    running: index < running,
    capacityMw: cap,
  }))
}

function cloneUnits(units: ChillerUnitState[]): ChillerUnitState[] {
  return units.map((unit) => ({ id: unit.id, running: unit.running, capacityMw: unit.capacityMw }))
}

export class PlantSim {
  private t = 0
  private paused = false
  private timeScale: TimeScale = 1
  private seed: number
  private lchltSet = 55
  /** True after an operator write that is not the weather target. */
  private lchltPinned = false
  private chwPinned = false
  private cwPinned = false
  private glycolPinned = false
  /** Balancing-valve opening. Header ΔP follows flow through the valve. */
  private chwValvePct = 72
  private cwValvePct = 78
  /** Closed glycol loop to the outdoor dry cooler. */
  private glycolValvePct = 70
  /** Outdoor dry bulb. The tower follows wet bulb; the dry cooler follows this. */
  private oatF = 75
  private weather: PlantSnapshot['weather'] = 'mild'
  private incident: IncidentKind | null = null
  private units: ChillerUnitState[]
  private itLoadCenterMw: number = TRAINER.itLoadCenterDefaultMw
  private rampFromMw: number = TRAINER.itLoadCenterDefaultMw
  private rampToMw: number = TRAINER.itLoadCenterDefaultMw
  private rampStartT = 0
  private rampSeconds = 0
  private capacityLagF = 0

  constructor(options: PlantSimOptions = {}) {
    this.seed = options.seed ?? 0
    const units = options.units ?? trainerFleet(2, 1)
    this.units = cloneUnits(units.length > 0 ? units : trainerFleet(2, 1))
  }

  captureState(): PlantState {
    return {
      t: this.t,
      paused: this.paused,
      timeScale: this.timeScale,
      seed: this.seed,
      lchltSet: this.lchltSet,
      chwValvePct: this.chwValvePct,
      cwValvePct: this.cwValvePct,
      glycolValvePct: this.glycolValvePct,
      oatF: this.oatF,
      weather: this.weather,
      incident: this.incident,
      units: cloneUnits(this.units),
      itLoadCenterMw: this.itLoadCenterMw,
      rampFromMw: this.rampFromMw,
      rampToMw: this.rampToMw,
      rampStartT: this.rampStartT,
      rampSeconds: this.rampSeconds,
      capacityLagF: this.capacityLagF,
      lchltPinned: this.lchltPinned,
      chwPinned: this.chwPinned,
      cwPinned: this.cwPinned,
      glycolPinned: this.glycolPinned,
    }
  }

  restoreState(state: PlantState) {
    this.t = state.t
    this.paused = state.paused
    this.timeScale = state.timeScale
    this.seed = state.seed
    this.lchltSet = state.lchltSet
    this.chwValvePct = state.chwValvePct
    this.cwValvePct = state.cwValvePct
    this.glycolValvePct = state.glycolValvePct
    this.oatF = state.oatF
    this.weather = state.weather
    this.incident = state.incident
    this.units = cloneUnits(state.units)
    this.itLoadCenterMw = state.itLoadCenterMw
    this.rampFromMw = state.rampFromMw
    this.rampToMw = state.rampToMw
    this.rampStartT = state.rampStartT
    this.rampSeconds = state.rampSeconds
    this.capacityLagF = state.capacityLagF
    this.lchltPinned = state.lchltPinned
    this.chwPinned = state.chwPinned
    this.cwPinned = state.cwPinned
    this.glycolPinned = state.glycolPinned
  }

  getIncident(): IncidentKind | null {
    return this.incident
  }

  getLchltSet(): number {
    return this.lchltSet
  }

  getOatF(): number {
    return this.oatF
  }

  getChwValvePct(): number {
    return this.chwValvePct
  }

  getCwValvePct(): number {
    return this.cwValvePct
  }

  getGlycolValvePct(): number {
    return this.glycolValvePct
  }

  getItLoadCenterMw(): number {
    return this.itLoadCenterMw
  }

  getPaused(): boolean {
    return this.paused
  }

  getTimeScale(): TimeScale {
    return this.timeScale
  }

  getT(): number {
    return this.t
  }

  getUnits(): ChillerUnitState[] {
    return cloneUnits(this.units)
  }

  unitRunning(id: string): boolean {
    return this.units.find((unit) => unit.id === id)?.running ?? false
  }

  setPaused(paused: boolean) {
    this.paused = paused
  }

  setTimeScale(scale: TimeScale) {
    this.timeScale = scale
  }

  setSeed(seed: number) {
    this.seed = seed
  }

  setIncident(kind: IncidentKind | null) {
    this.incident = kind
  }

  setUnitRunning(id: string, running: boolean): boolean {
    const unit = this.units.find((item) => item.id === id)
    if (!unit) return false
    unit.running = running
    return true
  }

  /**
   * Replace the unit list. Returns false when the list is empty or ids repeat.
   * fleet: N units — callers may pass 18 or 36 later. The board does not draw them yet.
   */
  configureUnits(units: ChillerUnitState[]): boolean {
    if (units.length === 0) return false
    const ids = new Set<string>()
    for (const unit of units) {
      if (!unit.id || ids.has(unit.id)) return false
      ids.add(unit.id)
    }
    this.units = units.map((unit) => ({
      id: unit.id,
      running: unit.running,
      capacityMw: Math.max(0, unit.capacityMw),
    }))
    return true
  }

  setHeaderValve(loop: 'chw' | 'cw' | 'gly', pct: number): number {
    const v = Math.max(15, Math.min(100, Math.round(pct)))
    const targets = weatherValveTargets(this.oatF)
    if (loop === 'chw') {
      this.chwValvePct = v
      this.chwPinned = v !== targets.chw
    } else if (loop === 'cw') {
      this.cwValvePct = v
      this.cwPinned = v !== targets.cw
    } else {
      this.glycolValvePct = v
      this.glycolPinned = v !== targets.gly
    }
    return v
  }

  setOutdoor(f: number): number {
    this.oatF = Math.max(15, Math.min(110, Math.round(f)))
    this.weather = weatherBand(this.oatF)
    this.followWeather()
    return this.oatF
  }

  setLchlt(f: number): number {
    const stepped = Math.round(f * 2) / 2
    this.lchltSet = Math.max(TRAINER.lchltMinF, Math.min(TRAINER.lchltMaxF, stepped))
    this.lchltPinned = this.lchltSet !== lchltBand(this.oatF).center
    return this.lchltSet
  }

  /**
   * Landing and failover take CH-01 offline once, when the incident is injected.
   * tick() does not write run state.
   */
  applyIncidentRunState(): void {
    if (this.incident === 'landing' || this.incident === 'failover') {
      this.setUnitRunning('CH-01', false)
    }
  }

  private followWeather(): void {
    const band = lchltBand(this.oatF)
    const valves = weatherValveTargets(this.oatF)
    if (!this.lchltPinned) this.lchltSet = band.center
    if (!this.chwPinned) this.chwValvePct = valves.chw
    if (!this.cwPinned) this.cwValvePct = valves.cw
    if (!this.glycolPinned) this.glycolValvePct = valves.gly
  }

  /**
   * Command the center of the IT load. The live load still breathes around it.
   * targetMw wins over deltaMw. rampSeconds 0 applies the center on this call.
   */
  setItLoad(args: { deltaMw?: number; targetMw?: number; rampSeconds?: number }): number {
    const current = this.centerNow()
    const requested = args.targetMw !== undefined ? args.targetMw : current + (args.deltaMw ?? 0)
    const next = clamp(requested, TRAINER.itLoadMinMw, TRAINER.itLoadMaxMw)
    const ramp = Math.max(0, args.rampSeconds ?? 0)
    this.itLoadCenterMw = next
    if (ramp === 0) {
      this.rampFromMw = next
      this.rampToMw = next
      this.rampSeconds = 0
      this.rampStartT = this.t
      return next
    }
    this.rampFromMw = current
    this.rampToMw = next
    this.rampStartT = this.t
    this.rampSeconds = ramp
    return next
  }

  /**
   * Advance the sim clock by dtSeconds of wall time, then sample the board.
   * Paused time does not move. timeScale multiplies the step. Omit dt to sample without moving.
   */
  tick(dtSeconds = 0): PlantSnapshot {
    const dt = this.paused ? 0 : Math.max(0, dtSeconds) * this.timeScale
    this.t += dt
    return this.compute(dt)
  }

  private centerNow(): number {
    if (this.rampSeconds <= 0) return this.itLoadCenterMw
    const span = this.rampSeconds
    const u = Math.min(1, Math.max(0, (this.t - this.rampStartT) / span))
    return this.rampFromMw + (this.rampToMw - this.rampFromMw) * u
  }

  private itLoadMwNow(): number {
    const center = this.centerNow()
    const phase = this.t + this.seed
    const breathe = Math.sin(phase / 18) * 0.55 + Math.sin(phase / 7) * 0.15
    return clamp(center + breathe, TRAINER.itLoadMinMw, TRAINER.itLoadMaxMw)
  }

  private compute(dt: number): PlantSnapshot {
    const draft = this.sampleBoard()
    this.applyIncident(draft)
    this.applyCapacity(draft, dt)
    this.applyFlowAlarm(draft)
    this.applyCapacityAlarm(draft)
    this.applyFightAlarm(draft)
    return this.assembleSnapshot(draft)
  }

  private sampleBoard(): BoardDraft {
    const t = this.t
    const oat = this.oatF
    const wb = wetBulbF(oat)
    const itLoadMw = this.itLoadMwNow()
    const lchltAct = this.lchltSet + 0.4 + Math.sin((t + this.seed) / 5) * 0.25
    const hallSupplyF = 72 + (lchltAct - this.lchltSet) * TRAINER.hallPerLchltF
    const hallReturnF = hallSupplyF + 14 + itLoadMw * 0.35
    const chwFlow = this.chwValvePct / 100
    const cwFlow = this.cwValvePct / 100
    const glyFlow = this.glycolValvePct / 100
    const chwrGuess = lchltAct + 10
    const dryFanPct = dryFanFor(oat, chwrGuess)
    const towerFanPct = Math.max(18, Math.min(100, 25 + (wb - 58) * 2.2 + Math.max(0, itLoadMw - 3.5) * 10))
    const glyOffCooler = oat + 9 + (100 - dryFanPct) * 0.1
    const freeLift = Math.max(0, chwrGuess - glyOffCooler)
    const freeCoolPct = Math.max(0, Math.min(65, freeLift * glyFlow * 4.2))
    const chillerMw = itLoadMw * (1 - freeCoolPct / 100)
    const approach = 6 + (100 - towerFanPct) * 0.09 + (1 - cwFlow) * 5
    const cwsF = wb + approach
    const range = (6 + chillerMw * 1.3) / Math.max(cwFlow, 0.28)
    const cwrF = cwsF + range
    const condTemp = cwrF + 3
    return {
      t,
      oat,
      wb,
      itLoadMw,
      lchltAct,
      hallSupplyF,
      hallReturnF,
      chwDpPsi: chwDpAt(this.chwValvePct),
      cwDpPsi: cwDpAt(this.cwValvePct),
      glycolDpPsi: glycolDpAt(this.glycolValvePct, oat),
      dryFanPct,
      towerFanPct,
      glyOffCooler,
      freeCoolPct,
      chillerMw,
      cwsF,
      cwrF,
      condTemp,
      cond: 71 + (condTemp - 70) * 1.75,
      range,
      cwFlow,
      chwFlow,
      glyFlow,
      capacityApplies: false,
      alarm: null,
      ch01RlaExtra: 0,
      ch01RlaScale: 1,
      ch01RlaFloor: 0,
      ch01RlaForce: null,
      failoverLeadId: null,
      modeOverride: new Map(),
      mbcOverride: new Map(),
      runningCapacityMw: 0,
      unmetMw: 0,
    }
  }

  private applyIncident(draft: BoardDraft): void {
    switch (this.incident) {
      case null:
        draft.capacityApplies = true
        break
      case 'high-head':
        applyHighHead(draft)
        break
      case 'hall-hot':
        applyHallHot(draft, this.lchltSet)
        break
      case 'landing':
        applyLanding(draft)
        break
      case 'failover':
        this.applyFailover(draft)
        break
      case 'bms-fight':
        draft.capacityApplies = true
        draft.alarm = 'The LCHLT actual moves up and down. The panel setpoint stays in place.'
        break
      default: {
        const unknown: never = this.incident
        throw new Error(`Unknown incident ${String(unknown)}`)
      }
    }
  }

  private applyFailover(draft: BoardDraft): void {
    draft.modeOverride.set('CH-01', 'offline')
    draft.mbcOverride.set('CH-01', 'LANDED')
    draft.ch01RlaForce = 0
    const others = this.standbyUnits()
    if (others.length === 0) {
      draft.alarm = 'The lead chiller is offline. The standby start has an inhibit.'
      draft.modeOverride.set('CH-02', 'alarm')
      draft.hallSupplyF += 6
      return
    }
    const lead = others[0]
    draft.failoverLeadId = lead.id
    draft.alarm = failoverLoadAlarm(lead.id)
  }

  private standbyUnits(): ChillerUnitState[] {
    return this.units.filter((unit) => unit.id !== 'CH-01' && unit.running)
  }

  private applyCapacity(draft: BoardDraft, dt: number): void {
    draft.runningCapacityMw = sumRunningMw(this.units)
    draft.unmetMw = Math.max(0, draft.chillerMw - draft.runningCapacityMw)
    if (!draft.capacityApplies) return
    this.integrateLag(dt, draft.unmetMw)
    draft.lchltAct += this.capacityLagF
    if (this.incident === 'bms-fight') {
      draft.lchltAct +=
        TRAINER.bmsFightAmplitudeF * Math.sin((2 * Math.PI * draft.t) / TRAINER.bmsFightPeriodS)
    }
    draft.hallSupplyF = 72 + (draft.lchltAct - this.lchltSet) * TRAINER.hallPerLchltF
    draft.hallReturnF = draft.hallSupplyF + 14 + draft.itLoadMw * 0.35
  }

  private integrateLag(dt: number, unmetMw: number): void {
    if (dt <= 0) return
    const target = unmetMw * TRAINER.lchltRiseFPerMw
    const alpha = 1 - Math.exp(-dt / TRAINER.hallTauS)
    this.capacityLagF += (target - this.capacityLagF) * alpha
  }

  private applyFlowAlarm(draft: BoardDraft): void {
    if (this.incident || draft.alarm) return
    if (printedChwDpPsi(this.chwValvePct) < CHW_DP_LOW_PSI) {
      const starve = (CHW_FLOW_SPAN_PCT - this.chwValvePct) / CHW_FLOW_SPAN_PCT
      draft.hallSupplyF += starve * 6
      draft.hallReturnF += starve * 7
      draft.alarm = 'The CHW ΔP is low. The header valve does not give the CRAHs enough flow.'
      return
    }
    if (this.cwValvePct < 40) {
      draft.cond += (40 - this.cwValvePct) * 0.55
      draft.alarm = 'The CW ΔP is low. The cooling tower flow is low, and the head will increase.'
      return
    }
    if (this.oatF < TRAINER.coldOatF && this.glycolValvePct < 30 && draft.freeCoolPct < 8) {
      draft.alarm = 'The glycol valve is shut. The dry cooler can remove part of this load.'
    }
  }

  private applyFightAlarm(draft: BoardDraft): void {
    if (this.incident || draft.alarm) return
    const fight = fightAlarmText({
      oatF: this.oatF,
      lchltSet: this.lchltSet,
      lchltPinned: this.lchltPinned,
      glycolValvePct: this.glycolValvePct,
      glycolPinned: this.glycolPinned,
      freeCoolPct: draft.freeCoolPct,
      chwValvePct: this.chwValvePct,
      chwPinned: this.chwPinned,
      cwValvePct: this.cwValvePct,
      cwPinned: this.cwPinned,
    })
    if (!fight) return
    draft.alarm = fight
  }

  private applyCapacityAlarm(draft: BoardDraft): void {
    if (this.incident || draft.alarm) return
    if (!draft.capacityApplies || draft.unmetMw <= TRAINER.unmetAlarmMw) return
    draft.alarm = 'The IT load is above the running chiller capacity. Start the standby chiller or decrease the load.'
  }

  private assembleSnapshot(draft: BoardDraft): PlantSnapshot {
    const units = this.composeUnits(draft)
    const ch01 = unitFace(units, 'CH-01')
    const ch02 = unitFace(units, 'CH-02')
    const band = lchltBand(draft.oat)
    const chwTargetPsi = chwTargetPsiFor(draft.oat)
    const chwGain = gainPer10(chwDpAt, this.chwValvePct)
    const glycolGain = gainPer10((pct) => glycolDpAt(pct, draft.oat), this.glycolValvePct)
    const fansPinned = fansArePinned(draft.towerFanPct, draft.oat)
    const cwHeadGain = cwHeadGainPsi(draft.range, draft.cwFlow, fansPinned)
    const reason = plantReason({
      oat: draft.oat,
      wb: draft.wb,
      chwTargetPsi,
      chwValve: this.chwValvePct,
      chwGain,
      glycolGain,
      cwHeadGain,
      freeCoolPct: draft.freeCoolPct,
      fansPinned,
      dryFanPct: draft.dryFanPct,
    })
    const towerFanPct = Math.max(0, Math.min(100, draft.towerFanPct))
    const chwDpPsi = round(draft.chwDpPsi, 1)
    const cwDpPsi = round(draft.cwDpPsi, 1)
    const glycolDpPsi = round(draft.glycolDpPsi, 1)
    return {
      t: draft.t,
      itLoadMw: round(draft.itLoadMw, 2),
      hallSupplyF: round(draft.hallSupplyF, 1),
      hallReturnF: round(draft.hallReturnF, 1),
      lchltSet: this.lchltSet,
      lchltTargetF: band.center,
      lchltBandLoF: band.lo,
      lchltBandHiF: band.hi,
      lchltAct: round(draft.lchltAct, 1),
      cwetF: round(draft.wb, 1),
      oatF: draft.oat,
      wbF: round(draft.wb, 1),
      towerFanPct: round(towerFanPct, 0),
      dryFanPct: round(draft.dryFanPct, 0),
      chwDpPsi,
      cwDpPsi,
      glycolDpPsi,
      chwValvePct: this.chwValvePct,
      cwValvePct: this.cwValvePct,
      glycolValvePct: this.glycolValvePct,
      chwGain: round(chwGain, 1),
      cwHeadGain,
      glycolGain: round(glycolGain, 1),
      freeCoolPct: round(draft.freeCoolPct, 0),
      chwTargetPsi,
      chwsF: round(draft.lchltAct, 1),
      chwrF: round(draft.lchltAct + 8 + (1 - draft.chwFlow) * 10, 1),
      chwrPsi: 52,
      chwsPsi: round(52 - chwDpPsi, 1),
      cwsF: round(draft.cwsF, 1),
      cwrF: round(draft.cwrF, 1),
      cwsPsi: round(48, 1),
      cwrPsi: round(48 - cwDpPsi, 1),
      glyS: round(draft.glyOffCooler, 1),
      glyR: round(draft.glyOffCooler + 6 + draft.chillerMw * (1 - draft.glyFlow) * 2, 1),
      glySPsi: round(36 + glycolDpPsi, 1),
      glyRPsi: 36,
      reason: `${reason} Trainer LCHLT target is ${band.center.toFixed(0)}°F.`,
      ch01: { mode: ch01.mode, rla: ch01.rla, condPsig: ch01.condPsig, mbc: ch01.mbc },
      ch02: { mode: ch02.mode, rla: ch02.rla, condPsig: ch02.condPsig, mbc: ch02.mbc },
      units,
      runningCapacityMw: round(draft.runningCapacityMw, 2),
      unmetMw: round(draft.unmetMw, 2),
      alarm: draft.alarm,
      weather: this.weather,
    }
  }

  private composeUnits(draft: BoardDraft): UnitSnapshot[] {
    return rankRunning(this.units).map((unit) => unitSnapshot(unit, draft))
  }
}

interface BoardDraft {
  t: number
  oat: number
  wb: number
  itLoadMw: number
  lchltAct: number
  hallSupplyF: number
  hallReturnF: number
  chwDpPsi: number
  cwDpPsi: number
  glycolDpPsi: number
  dryFanPct: number
  towerFanPct: number
  glyOffCooler: number
  freeCoolPct: number
  chillerMw: number
  cwsF: number
  cwrF: number
  condTemp: number
  cond: number
  range: number
  cwFlow: number
  chwFlow: number
  glyFlow: number
  capacityApplies: boolean
  alarm: string | null
  ch01RlaExtra: number
  ch01RlaScale: number
  ch01RlaFloor: number
  ch01RlaForce: number | null
  failoverLeadId: string | null
  modeOverride: Map<string, ChillerMode>
  mbcOverride: Map<string, UnitSnapshot['mbc']>
  runningCapacityMw: number
  unmetMw: number
}

interface FightInput {
  oatF: number
  lchltSet: number
  lchltPinned: boolean
  glycolValvePct: number
  glycolPinned: boolean
  freeCoolPct: number
  chwValvePct: number
  chwPinned: boolean
  cwValvePct: number
  cwPinned: boolean
}

interface RankedUnit extends ChillerUnitState {
  role: ChillerMode
}

export function lchltBand(oatF: number): { center: number; lo: number; hi: number } {
  if (oatF <= TRAINER.coldOatF) {
    return { center: TRAINER.lchltColdCenterF, lo: TRAINER.lchltColdLoF, hi: TRAINER.lchltColdHiF }
  }
  if (oatF >= TRAINER.hotOatF) {
    return { center: TRAINER.lchltHotCenterF, lo: TRAINER.lchltHotLoF, hi: TRAINER.lchltHotHiF }
  }
  return { center: TRAINER.lchltMildCenterF, lo: TRAINER.lchltMildLoF, hi: TRAINER.lchltMildHiF }
}

function weatherValveTargets(oatF: number): { chw: number; cw: number; gly: number } {
  if (oatF <= TRAINER.coldOatF) return { chw: 51, cw: 70, gly: 90 }
  if (oatF >= TRAINER.hotOatF) return { chw: 77, cw: 90, gly: 25 }
  return { chw: 72, cw: 78, gly: 70 }
}

function weatherBand(oat: number): PlantSnapshot['weather'] {
  if (oat >= 95) return 'extreme'
  if (oat >= 78) return 'design'
  return 'mild'
}

function wetBulbF(oat: number): number {
  return Math.min(oat - 8, oat - 4 - Math.max(0, 70 - oat) * 0.15)
}

function dryFanFor(oat: number, chwrGuess: number): number {
  if (oat + 12 < chwrGuess) return Math.max(25, Math.min(100, 55 + (55 - oat) * 1.4))
  return 20
}

function applyHighHead(draft: BoardDraft): void {
  draft.towerFanPct = 100
  draft.cwsF += 10
  draft.cwrF += 10
  draft.cond += 28
  draft.ch01RlaExtra = 22
  draft.alarm = 'High condenser pressure. The cooling tower cannot reject enough heat.'
  draft.modeOverride.set('CH-01', 'alarm')
}

function applyHallHot(draft: BoardDraft, lchltSet: number): void {
  draft.hallSupplyF += 9
  draft.hallReturnF += 11
  draft.chwDpPsi = HALL_HOT_CHW_DP_PSI
  draft.ch01RlaScale = 0.45
  draft.ch01RlaFloor = 18
  draft.lchltAct = lchltSet + 0.2
  draft.alarm = 'The hall is hot. Examine the CHW path and the CRAHs. The chiller load is low.'
}

function applyLanding(draft: BoardDraft): void {
  draft.modeOverride.set('CH-01', 'alarm')
  draft.mbcOverride.set('CH-01', 'LANDED')
  draft.ch01RlaForce = 0
  draft.alarm = 'The MBC recorded a power-fail landing. Examine the UPS and the ATS.'
}

function failoverLoadAlarm(id: string): string {
  if (id === 'CH-02') return 'Failover is active. CH-02 has the load.'
  return `Failover is active. ${id} has the load.`
}

function sumRunningMw(units: ChillerUnitState[]): number {
  return units.reduce((sum, unit) => sum + (unit.running ? unit.capacityMw : 0), 0)
}

function fightAlarmText(input: FightInput): string | null {
  const lchlt = lchltFightText(input)
  if (lchlt) return lchlt
  const chw = chwFightText(input)
  if (chw) return chw
  const cw = cwFightText(input)
  if (cw) return cw
  return glycolFightText(input)
}

function lchltFightText(input: FightInput): string | null {
  if (!input.lchltPinned || !lchltOutsideBand(input.lchltSet, input.oatF)) return null
  const center = lchltBand(input.oatF).center
  return `The LCHLT setpoint fights the outdoor target. The trainer target is ${center.toFixed(0)}°F.`
}

function chwFightText(input: FightInput): string | null {
  const target = weatherValveTargets(input.oatF).chw
  if (!input.chwPinned || Math.abs(input.chwValvePct - target) <= TRAINER.valveFightPct) return null
  return `The CHW valve fights the outdoor target. The trainer target is ${target}%.`
}

function cwFightText(input: FightInput): string | null {
  if (!input.cwPinned || input.oatF < TRAINER.hotOatF || input.cwValvePct >= 60) return null
  return 'The CW valve fights the outdoor target. The cooling tower needs flow in hot weather.'
}

function glycolFightText(input: FightInput): string | null {
  if (!input.glycolPinned || input.oatF < TRAINER.hotOatF) return null
  if (input.glycolValvePct <= 50 || input.freeCoolPct >= 8) return null
  return 'The glycol valve fights the outdoor target. Hot air cannot give free cooling.'
}

function lchltOutsideBand(setpoint: number, oatF: number): boolean {
  const band = lchltBand(oatF)
  return setpoint < band.lo || setpoint > band.hi
}

function chwTargetPsiFor(oat: number): number {
  if (oat >= TRAINER.hotOatF) return 20
  if (oat <= TRAINER.coldOatF) return 14
  return 17
}

function fansArePinned(towerFanPct: number, oat: number): boolean {
  return towerFanPct >= 98 && oat >= 90
}

function cwHeadGainPsi(range: number, cwFlow: number, fansPinned: boolean): number {
  const scale = fansPinned ? 0.35 : 1
  const next = (range * cwFlow) / Math.min(cwFlow + 0.1, 1)
  return Math.round((range - next) * 1.75 * scale * 10) / 10
}

function rankRunning(units: ChillerUnitState[]): RankedUnit[] {
  let leadAssigned = false
  const ranked: RankedUnit[] = []
  for (const unit of units) {
    const role = baseRole(unit.running, leadAssigned)
    if (role === 'lead') leadAssigned = true
    ranked.push({ id: unit.id, running: unit.running, capacityMw: unit.capacityMw, role })
  }
  return ranked
}

function baseRole(running: boolean, leadAssigned: boolean): ChillerMode {
  if (!running) return 'standby'
  if (!leadAssigned) return 'lead'
  return 'lag'
}

function unitSnapshot(unit: RankedUnit, draft: BoardDraft): UnitSnapshot {
  return {
    id: unit.id,
    running: unit.running,
    capacityMw: unit.capacityMw,
    mode: modeForUnit(unit, draft.modeOverride),
    rla: rlaForUnit(unit, draft),
    condPsig: condForUnit(unit, draft.cond),
    mbc: mbcForUnit(unit, draft.mbcOverride),
  }
}

function modeForUnit(unit: RankedUnit, override: Map<string, ChillerMode>): ChillerMode {
  const forced = override.get(unit.id)
  if (forced) return forced
  return unit.role
}

function rlaForUnit(unit: RankedUnit, draft: BoardDraft): number {
  const share = shareMw(unit, draft)
  const head = headForUnit(unit.id, draft.condTemp)
  let rla = unit.running ? 28 + share * 9 + head : 0
  if (unit.id === 'CH-01') rla = adjustCh01Rla(rla, draft)
  if (draft.failoverLeadId === unit.id) rla = 55 + draft.itLoadMw * 5
  return round(clamp(rla, 0, 110), 0)
}

function shareMw(unit: RankedUnit, draft: BoardDraft): number {
  if (!unit.running || draft.runningCapacityMw <= 0) return 0
  return draft.chillerMw * (unit.capacityMw / draft.runningCapacityMw)
}

function headForUnit(id: string, condTemp: number): number {
  if (id !== 'CH-01') return 0
  return Math.max(0, condTemp - 85) * 0.85
}

function adjustCh01Rla(rla: number, draft: BoardDraft): number {
  let next = rla * draft.ch01RlaScale + draft.ch01RlaExtra
  if (draft.ch01RlaFloor > 0) next = Math.max(draft.ch01RlaFloor, next)
  if (draft.ch01RlaExtra > 0) next = Math.min(105, next)
  if (draft.ch01RlaForce !== null) return draft.ch01RlaForce
  return next
}

function mbcForUnit(unit: RankedUnit, override: Map<string, UnitSnapshot['mbc']>): UnitSnapshot['mbc'] {
  const forced = override.get(unit.id)
  if (forced) return forced
  if (unit.running) return 'LEVITATED'
  return 'LANDED'
}

function condForUnit(unit: RankedUnit, cond: number): number {
  if (unit.id === 'CH-01') return round(cond, 0)
  const offset = unit.running ? 4 : 12
  return round(cond - offset, 0)
}

function unitFace(units: UnitSnapshot[], id: string): UnitSnapshot {
  return (
    units.find((unit) => unit.id === id) ?? {
      id,
      running: false,
      capacityMw: 0,
      mode: 'standby',
      rla: 0,
      condPsig: 0,
      mbc: 'LANDED',
    }
  )
}

function chwDpAt(pct: number) {
  const f = Math.max(15, Math.min(100, pct)) / 100
  return 6 + Math.pow(f, 1.35) * 20
}

/** Hall-hot replaces the CHW header ΔP with this printed value. The valve opening does not change it. */
export const HALL_HOT_CHW_DP_PSI = 9.5

/** Trainer limits on the 0.1 psi figure the pipe board prints. */
export const CHW_DP_LOW_PSI = 12
export const CHW_DP_HIGH_PSI = 24

/** Span used only to scale hall warmth while the printed CHW ΔP is below the low limit. */
const CHW_FLOW_SPAN_PCT = 42

/** Steady CHW header ΔP rounded to the 0.1 psi the pipe board prints. */
export function printedChwDpPsi(pct: number): number {
  return round(chwDpAt(pct), 1)
}

/** Highest CHW slider percent whose printed ΔP is below the trainer low limit. */
export function chwLowOpenPct(): number {
  for (let pct = 100; pct >= 15; pct -= 1) {
    if (printedChwDpPsi(pct) < CHW_DP_LOW_PSI) return pct
  }
  return 15
}

/** Slider lesson. The percent is the same printed-ΔP mark the board and the banner use. */
export function chwLowFlowLesson(): string {
  return `At ${chwLowOpenPct()}% open and below, the CHW ΔP is below the trainer limit of ${CHW_DP_LOW_PSI} psi. This sim then gives the CRAHs too little flow, and the hall gets warmer.`
}

function cwDpAt(pct: number) {
  const f = Math.max(15, Math.min(100, pct)) / 100
  return 4 + Math.pow(f, 1.35) * 12
}

function glycolDpAt(pct: number, oat: number) {
  const f = Math.max(15, Math.min(100, pct)) / 100
  const thicker = 1 + Math.max(0, 55 - oat) * 0.04
  return (3.5 + Math.pow(f, 1.4) * 12) * thicker
}

/**
 * Steady header ΔP in psi, before the 0.1 psi display round.
 * The snapshot stores that round, then applies incident overrides such as hall-hot.
 * The home CHW card adds the live wobble. The pipe board does not.
 */
export function chwHeaderDpPsi(pct: number): number {
  return chwDpAt(pct)
}

export function cwHeaderDpPsi(pct: number): number {
  return cwDpAt(pct)
}

export function glycolHeaderDpPsi(pct: number, oatF: number): number {
  return glycolDpAt(pct, oatF)
}

function gainPer10(at: (pct: number) => number, pct: number) {
  const hi = Math.min(100, pct + 10)
  const lo = Math.max(15, hi - 10)
  return at(hi) - at(lo)
}

function plantReason(p: {
  oat: number
  wb: number
  chwTargetPsi: number
  chwValve: number
  chwGain: number
  glycolGain: number
  cwHeadGain: number
  freeCoolPct: number
  fansPinned: boolean
  dryFanPct: number
}) {
  const pct = Math.round(p.freeCoolPct)
  const heat =
    p.oat <= 48
      ? `At ${p.oat}°F the dry cooler can remove about ${pct}% of the load, so the cooling tower and the chiller decrease load. Hold the CHW ΔP near ${p.chwTargetPsi} psi.`
      : p.oat >= 92
        ? `At ${p.oat}°F glycol from the dry cooler is warmer than the CHWR, so the dry cooler cannot remove this heat. The cooling tower is the heat sink at wet-bulb ${p.wb.toFixed(0)}°F, so hold the CHW ΔP near ${p.chwTargetPsi} psi while the head is high.`
        : `The outdoor temperature is ${p.oat}°F and the cooling tower wet-bulb is ${p.wb.toFixed(0)}°F. The CHW ΔP target is about ${p.chwTargetPsi} psi, and glycol removes only a small part of the heat.`
  const valve =
    p.chwValve < 40
      ? ` The CHW valve is on the steep part of the flow curve, and a 10% stem move is about ${p.chwGain.toFixed(1)} psi.`
      : p.chwValve > 85
        ? ` The CHW valve is almost fully open. A further 10% of stem gives only about ${p.chwGain.toFixed(1)} psi, because the piping and the coils are the restriction.`
        : ''
  const sink = p.fansPinned
    ? ` The cooling tower fans are at maximum speed, so the CW valve changes the head by only about ${p.cwHeadGain.toFixed(1)} psi per 10%.`
    : p.oat <= 48
      ? ` Cold glycol is thick, so a 10% valve move is about ${p.glycolGain.toFixed(1)} psi and changes the heat removal.`
      : ` The CW valve still changes the head by about ${p.cwHeadGain.toFixed(1)} psi per 10%, because the cooling tower has spare fan capacity.`
  return heat + valve + sink
}

function round(n: number, d: number) {
  const p = 10 ** d
  return Math.round(n * p) / p
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

export function rankFor(mastery: number, xp: number): { title: string; tier: number } {
  const score = mastery * 0.7 + (Math.min(xp, 400) / 400) * 30
  if (score >= 85) return { title: 'Plant Lead', tier: 4 }
  if (score >= 60) return { title: 'Shift Operator', tier: 3 }
  if (score >= 30) return { title: 'NOC Trainee', tier: 2 }
  return { title: 'New operator', tier: 1 }
}
