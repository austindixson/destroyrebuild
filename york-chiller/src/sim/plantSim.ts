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
} as const

export interface ChillerUnitState {
  id: string
  running: boolean
  /** Trainer MW. Not a Johnson Controls rating. */
  capacityMw: number
}

export interface UnitSnapshot extends ChillerUnitState {
  mode: ChillerMode
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
    if (loop === 'chw') this.chwValvePct = v
    else if (loop === 'cw') this.cwValvePct = v
    else this.glycolValvePct = v
    return v
  }

  setOutdoor(f: number): number {
    this.oatF = Math.max(15, Math.min(110, Math.round(f)))
    this.weather = this.oatF >= 95 ? 'extreme' : this.oatF >= 78 ? 'design' : 'mild'
    return this.oatF
  }

  setLchlt(f: number): number {
    const stepped = Math.round(f * 2) / 2
    this.lchltSet = Math.max(TRAINER.lchltMinF, Math.min(TRAINER.lchltMaxF, stepped))
    return this.lchltSet
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
    const t = this.t
    const oat = this.oatF
    const wb = Math.min(oat - 8, oat - 4 - Math.max(0, 70 - oat) * 0.15)
    const itLoadMw = this.itLoadMwNow()
    let lchltAct = this.lchltSet + 0.4 + Math.sin((t + this.seed) / 5) * 0.25
    let hallSupplyF = 72 + (lchltAct - this.lchltSet) * TRAINER.hallPerLchltF
    let hallReturnF = hallSupplyF + 14 + itLoadMw * 0.35
    const chwFlow = this.chwValvePct / 100
    const cwFlow = this.cwValvePct / 100
    const glyFlow = this.glycolValvePct / 100
    let chwDpPsi = chwDpAt(this.chwValvePct) + Math.sin((t + this.seed) / 9) * 0.3
    let cwDpPsi = cwDpAt(this.cwValvePct) + Math.sin((t + this.seed) / 11) * 0.2
    let glycolDpPsi = glycolDpAt(this.glycolValvePct, oat)
    const chwrGuess = lchltAct + 10
    let dryFanPct = oat + 12 < chwrGuess ? Math.max(25, Math.min(100, 55 + (55 - oat) * 1.4)) : 20
    let towerFanPct = Math.max(18, Math.min(100, 25 + (wb - 58) * 2.2 + Math.max(0, itLoadMw - 3.5) * 10))
    const glyOffCooler = oat + 9 + (100 - dryFanPct) * 0.1
    const freeLift = Math.max(0, chwrGuess - glyOffCooler)
    let freeCoolPct = Math.max(0, Math.min(65, freeLift * glyFlow * 4.2))
    let chillerMw = itLoadMw * (1 - freeCoolPct / 100)
    let approach = 6 + (100 - towerFanPct) * 0.09 + (1 - cwFlow) * 5
    let cwsF = wb + approach
    let range = (6 + chillerMw * 1.3) / Math.max(cwFlow, 0.28)
    let cwrF = cwsF + range
    let condTemp = cwrF + 3
    let cond = 71 + (condTemp - 70) * 1.75
    let alarm: string | null = null
    let capacityApplies = false
    let ch01RlaExtra = 0
    let ch01RlaScale = 1
    let ch01RlaFloor = 0
    let ch01RlaForce: number | null = null
    let failoverLeadId: string | null = null
    const modeOverride = new Map<string, ChillerMode>()
    const mbcOverride = new Map<string, UnitSnapshot['mbc']>()

    switch (this.incident) {
      case null:
        capacityApplies = true
        break
      case 'high-head':
        towerFanPct = 100
        cwsF += 10
        cwrF += 10
        cond += 28
        ch01RlaExtra = 22
        alarm = 'High condenser pressure. The cooling tower cannot reject enough heat.'
        modeOverride.set('CH-01', 'alarm')
        break
      case 'hall-hot':
        hallSupplyF += 9
        hallReturnF += 11
        chwDpPsi = 9.5
        ch01RlaScale = 0.45
        ch01RlaFloor = 18
        lchltAct = this.lchltSet + 0.2
        alarm = 'The hall is hot. Examine the CHW path and the CRAHs. The chiller load is low.'
        break
      case 'landing':
        this.setUnitRunning('CH-01', false)
        modeOverride.set('CH-01', 'alarm')
        mbcOverride.set('CH-01', 'LANDED')
        ch01RlaForce = 0
        alarm = 'The MBC recorded a power-fail landing. Examine the UPS and the ATS.'
        break
      case 'failover': {
        this.setUnitRunning('CH-01', false)
        modeOverride.set('CH-01', 'offline')
        mbcOverride.set('CH-01', 'LANDED')
        ch01RlaForce = 0
        const others = this.units.filter((unit) => unit.id !== 'CH-01' && unit.running)
        if (others.length === 0) {
          alarm = 'The lead chiller is offline. The standby start has an inhibit.'
          modeOverride.set('CH-02', 'alarm')
          hallSupplyF += 6
        } else {
          failoverLeadId = others[0].id
          alarm =
            others[0].id === 'CH-02'
              ? 'Failover is active. CH-02 has the load.'
              : `Failover is active. ${others[0].id} has the load.`
        }
        break
      }
      case 'bms-fight':
        capacityApplies = true
        alarm = 'The LCHLT actual moves up and down. The panel setpoint stays in place.'
        break
      default: {
        const unknown: never = this.incident
        throw new Error(`Unknown incident ${String(unknown)}`)
      }
    }

    const runningCapacityMw = this.units.reduce((sum, unit) => sum + (unit.running ? unit.capacityMw : 0), 0)
    const unmetMw = Math.max(0, chillerMw - runningCapacityMw)
    if (capacityApplies && dt > 0) {
      const target = unmetMw * TRAINER.lchltRiseFPerMw
      const alpha = 1 - Math.exp(-dt / TRAINER.hallTauS)
      this.capacityLagF += (target - this.capacityLagF) * alpha
    }
    if (capacityApplies) {
      lchltAct += this.capacityLagF
      if (this.incident === 'bms-fight') {
        lchltAct +=
          TRAINER.bmsFightAmplitudeF * Math.sin((2 * Math.PI * t) / TRAINER.bmsFightPeriodS)
      }
      hallSupplyF = 72 + (lchltAct - this.lchltSet) * TRAINER.hallPerLchltF
      hallReturnF = hallSupplyF + 14 + itLoadMw * 0.35
    }

    if (!this.incident && this.chwValvePct < 42) {
      const starve = (42 - this.chwValvePct) / 42
      hallSupplyF += starve * 6
      hallReturnF += starve * 7
      alarm = 'The CHW ΔP is low. The header valve does not give the CRAHs enough flow.'
    } else if (!this.incident && this.cwValvePct < 40) {
      cond += (40 - this.cwValvePct) * 0.55
      alarm = 'The CW ΔP is low. The cooling tower flow is low, and the head will increase.'
    } else if (!this.incident && oat < 48 && this.glycolValvePct < 30 && freeCoolPct < 8) {
      alarm = 'The glycol valve is shut. The dry cooler can remove part of this load.'
    } else if (capacityApplies && !alarm && unmetMw > TRAINER.unmetAlarmMw) {
      alarm = 'The IT load is above the running chiller capacity. Start the standby chiller or decrease the load.'
    }

    const units = this.composeUnits({
      chillerMw,
      condTemp,
      cond,
      ch01RlaExtra,
      ch01RlaScale,
      ch01RlaFloor,
      ch01RlaForce,
      failoverLeadId,
      itLoadMw,
      modeOverride,
      mbcOverride,
      runningCapacityMw,
    })
    const ch01 = unitFace(units, 'CH-01')
    const ch02 = unitFace(units, 'CH-02')

    const chwTargetPsi = oat >= 92 ? 20 : oat <= 48 ? 14 : 17
    const chwGain = gainPer10(chwDpAt, this.chwValvePct)
    const glycolGain = gainPer10((pct) => glycolDpAt(pct, oat), this.glycolValvePct)
    const fansPinned = towerFanPct >= 98 && oat >= 90
    const cwHeadGain =
      Math.round(((range - (range * cwFlow) / Math.min(cwFlow + 0.1, 1)) * 1.75 * (fansPinned ? 0.35 : 1)) * 10) / 10
    const reason = plantReason({
      oat,
      wb,
      chwTargetPsi,
      chwValve: this.chwValvePct,
      chwGain,
      glycolGain,
      cwHeadGain,
      freeCoolPct,
      fansPinned,
      dryFanPct,
    })

    towerFanPct = Math.max(0, Math.min(100, towerFanPct))

    return {
      t,
      itLoadMw: round(itLoadMw, 2),
      hallSupplyF: round(hallSupplyF, 1),
      hallReturnF: round(hallReturnF, 1),
      lchltSet: this.lchltSet,
      lchltAct: round(lchltAct, 1),
      cwetF: round(wb, 1),
      oatF: oat,
      wbF: round(wb, 1),
      towerFanPct: round(towerFanPct, 0),
      dryFanPct: round(dryFanPct, 0),
      chwDpPsi: round(chwDpPsi, 1),
      cwDpPsi: round(cwDpPsi, 1),
      glycolDpPsi: round(glycolDpPsi, 1),
      chwValvePct: this.chwValvePct,
      cwValvePct: this.cwValvePct,
      glycolValvePct: this.glycolValvePct,
      chwGain: round(chwGain, 1),
      cwHeadGain,
      glycolGain: round(glycolGain, 1),
      freeCoolPct: round(freeCoolPct, 0),
      chwTargetPsi,
      chwsF: round(lchltAct, 1),
      chwrF: round(lchltAct + 8 + (1 - chwFlow) * 10, 1),
      chwrPsi: 52,
      chwsPsi: round(52 - chwDpPsi, 1),
      cwsF: round(cwsF, 1),
      cwrF: round(cwrF, 1),
      cwsPsi: round(48, 1),
      cwrPsi: round(48 - cwDpPsi, 1),
      glyS: round(glyOffCooler, 1),
      glyR: round(glyOffCooler + 6 + chillerMw * (1 - glyFlow) * 2, 1),
      glySPsi: round(36 + glycolDpPsi, 1),
      glyRPsi: 36,
      reason,
      ch01: { mode: ch01.mode, rla: ch01.rla, condPsig: ch01.condPsig, mbc: ch01.mbc },
      ch02: { mode: ch02.mode, rla: ch02.rla, condPsig: ch02.condPsig, mbc: ch02.mbc },
      units,
      runningCapacityMw: round(runningCapacityMw, 2),
      unmetMw: round(unmetMw, 2),
      alarm,
      weather: this.weather,
    }
  }

  private composeUnits(input: {
    chillerMw: number
    condTemp: number
    cond: number
    ch01RlaExtra: number
    ch01RlaScale: number
    ch01RlaFloor: number
    ch01RlaForce: number | null
    failoverLeadId: string | null
    itLoadMw: number
    modeOverride: Map<string, ChillerMode>
    mbcOverride: Map<string, UnitSnapshot['mbc']>
    runningCapacityMw: number
  }): UnitSnapshot[] {
    let leadAssigned = false
    return this.units.map((unit) => {
      let mode: ChillerMode
      if (!unit.running) mode = 'standby'
      else if (!leadAssigned) {
        mode = 'lead'
        leadAssigned = true
      } else mode = 'lag'
      const share =
        unit.running && input.runningCapacityMw > 0
          ? input.chillerMw * (unit.capacityMw / input.runningCapacityMw)
          : 0
      const head = unit.id === 'CH-01' ? Math.max(0, input.condTemp - 85) * 0.85 : 0
      let rla = unit.running ? 28 + share * 9 + head : 0
      if (unit.id === 'CH-01') {
        rla = rla * input.ch01RlaScale + input.ch01RlaExtra
        if (input.ch01RlaFloor > 0) rla = Math.max(input.ch01RlaFloor, rla)
        if (input.ch01RlaExtra > 0) rla = Math.min(105, rla)
        if (input.ch01RlaForce !== null) rla = input.ch01RlaForce
      }
      if (input.failoverLeadId === unit.id) rla = 55 + input.itLoadMw * 5
      const overridden = input.modeOverride.get(unit.id)
      if (overridden) mode = overridden
      const mbc = input.mbcOverride.get(unit.id) ?? (unit.running ? 'LEVITATED' : 'LANDED')
      const condPsig =
        unit.id === 'CH-01' ? input.cond : input.cond - (unit.running ? 4 : 12)
      return {
        id: unit.id,
        running: unit.running,
        capacityMw: unit.capacityMw,
        mode,
        rla: round(Math.max(0, Math.min(110, rla)), 0),
        condPsig: round(condPsig, 0),
        mbc,
      }
    })
  }
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

function cwDpAt(pct: number) {
  const f = Math.max(15, Math.min(100, pct)) / 100
  return 4 + Math.pow(f, 1.35) * 12
}

function glycolDpAt(pct: number, oat: number) {
  const f = Math.max(15, Math.min(100, pct)) / 100
  const thicker = 1 + Math.max(0, 55 - oat) * 0.04
  return (3.5 + Math.pow(f, 1.4) * 12) * thicker
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
