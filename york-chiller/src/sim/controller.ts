/**
 * PlantController contract
 *
 * The only mutation path for plant state. The York UI and future AI tools call these
 * methods. Views read snapshots. They do not write PlantSim fields.
 *
 * change event
 *   Fires once per successful mutating call, after the write and a zero-dt sample.
 *   Type: 'change'. detail: PlantChangeDetail.
 *   tick() advances the clock for the frame loop and does not emit change.
 *
 * Snapshot stack
 *   Depth SNAPSHOT_STACK_DEPTH (20). Each entry is the full controller memory:
 *   sim clock, pause, time scale, seed, inputs, unit list, thermal lag, and the OptiView log.
 *   undo() restores that memory, including the sim clock. undo() does not push another entry.
 *
 * Action log
 *   Last ACTION_LOG_LIMIT (100) records:
 *   { actor, action, args, t, snapshotBefore, snapshotAfter }
 *   t is the sim clock. The snapshots are board samples, not the internal memory.
 *
 * incident.clear
 *   Restores the pre-incident memory captured on the first inject while the plant was clear.
 *   It does not force CH-01 on and CH-02 off. Confirm copy in the UI must say this.
 *
 * Confirm gates live in the UI. stopChiller and clearIncident run when called.
 * The human UI asks first. A later AI confirm card calls the same methods after the click.
 *
 * running
 *   True when CH-01 is running. OptiView "In operation" must use this, not a second flag.
 *   Landing and failover clear CH-01 inside the sim sample, so the flag follows the board.
 *
 * fleet: N units
 *   startChiller / stopChiller / configureFleet take a unit id. They do not assume N=2.
 *   The next slice is a bank of N=18, then 36, with lead/lag staging. Not built in Phase 0.
 *   The visible board still operates CH-01 and CH-02. Running capacity is the sum.
 *
 * Fans stay read-only. There is no fan write method.
 *
 * Outdoor targets
 *   setOutdoor and setWeather move the trainer LCHLT target and the valve targets
 *   while those loops are not pinned. An operator setpoint pins that loop.
 *   A pinned value that fights the outdoor target raises an alarm. It does not snap back.
 *
 * Landing and failover clear CH-01 once inside injectIncident. tick() does not write run state.
 */

import {
  PlantSim,
  trainerFleet,
  type ChillerUnitState,
  type IncidentKind,
  type PlantSnapshot,
  type PlantState,
  type TimeScale,
} from './plantSim.ts'

export type { TimeScale }

export const SNAPSHOT_STACK_DEPTH = 20
export const ACTION_LOG_LIMIT = 100
const OPTI_LOG_LIMIT = 40

export type Actor = 'user' | 'ai' | 'system'

export type StopMode = 'soft' | 'safety'

export type WeatherPreset = 'cold' | 'mild' | 'hot'

export interface OptiLine {
  text: string
  kind?: string
}

export interface ActionRecord {
  actor: Actor
  action: string
  args: unknown
  t: number
  snapshotBefore: PlantSnapshot
  snapshotAfter: PlantSnapshot
}

/** Payload of the `change` event. One event per successful mutating call. */
export interface PlantChangeDetail {
  action: string
  actor: Actor
  snapshot: PlantSnapshot
  /** CH-01 run state. OptiView "In operation" follows this. */
  running: boolean
}

export interface PlantResult {
  ok: boolean
  message: string
  snapshot: PlantSnapshot
  running: boolean
}

interface ControllerMemory {
  sim: PlantState
  optiLog: OptiLine[]
}

interface StackEntry {
  memory: ControllerMemory
  /** Pre-incident pointer as it was before the action. Undo puts it back. */
  preIncident: ControllerMemory | null
}

export interface PlantControllerOptions {
  seed?: number
  units?: ChillerUnitState[]
}

const WEATHER_F: Record<WeatherPreset, number> = {
  cold: 40,
  mild: 75,
  hot: 100,
}

function outdoorMessage(applied: number): string {
  return `Outdoor dry bulb is ${applied}°F. Trainer targets follow this dry-bulb unless you already set them.`
}

export class PlantController extends EventTarget {
  private sim: PlantSim
  private optiLog: OptiLine[]
  private stack: StackEntry[] = []
  private actionLog: ActionRecord[] = []
  private preIncident: ControllerMemory | null = null
  private cached: PlantSnapshot
  /** Collapses a slider drag into one undo step and one action-log row. */
  private lastCoalesce: { action: string; at: number } | null = null

  constructor(options: PlantControllerOptions = {}) {
    super()
    this.sim = new PlantSim({ seed: options.seed, units: options.units ?? trainerFleet(2, 1) })
    this.optiLog = [
      { text: 'CH-01 is online. The BMS link is a simulation.' },
      { text: 'The NOC watch is in trainer mode.', kind: 'warn' },
    ]
    this.cached = this.sim.tick(0)
  }

  /** CH-01 is in operation. This is the OptiView run flag. */
  get running(): boolean {
    return this.sim.unitRunning('CH-01')
  }

  get snapshot(): PlantSnapshot {
    return this.cached
  }

  get incident(): IncidentKind | null {
    return this.sim.getIncident()
  }

  get lchltSet(): number {
    return this.sim.getLchltSet()
  }

  get oatF(): number {
    return this.sim.getOatF()
  }

  get chwValvePct(): number {
    return this.sim.getChwValvePct()
  }

  get cwValvePct(): number {
    return this.sim.getCwValvePct()
  }

  get glycolValvePct(): number {
    return this.sim.getGlycolValvePct()
  }

  get itLoadCenterMw(): number {
    return this.sim.getItLoadCenterMw()
  }

  get paused(): boolean {
    return this.sim.getPaused()
  }

  get timeScale(): TimeScale {
    return this.sim.getTimeScale()
  }

  get optiLogLines(): readonly OptiLine[] {
    return this.optiLog
  }

  get canUndo(): boolean {
    return this.stack.length > 0
  }

  get hasPreIncident(): boolean {
    return this.preIncident !== null
  }

  get stackDepth(): number {
    return this.stack.length
  }

  unitRunning(id: string): boolean {
    return this.sim.unitRunning(id)
  }

  /**
   * Advance the clock by wall-clock seconds (already scaled inside the sim) and return the board.
   * Does not emit change and does not write the action log.
   */
  tick(dtSeconds = 0): PlantSnapshot {
    this.cached = this.sim.tick(dtSeconds)
    return this.cached
  }

  getActionLog(sinceT?: number): readonly ActionRecord[] {
    if (sinceT === undefined) return this.actionLog
    return this.actionLog.filter((row) => row.t >= sinceT)
  }

  getAlarms(): { alarm: string | null; log: readonly OptiLine[] } {
    return { alarm: this.cached.alarm, log: this.optiLog }
  }

  setWeather(preset: WeatherPreset, actor: Actor = 'user'): PlantResult {
    const f = WEATHER_F[preset]
    return this.mutate('setWeather', { preset }, actor, () => {
      const applied = this.sim.setOutdoor(f)
      return outdoorMessage(applied)
    })
  }

  setOutdoorDryBulb(f: number, actor: Actor = 'user'): PlantResult {
    const clamped = clamp(Math.round(f), 20, 110)
    return this.mutate('setOutdoorDryBulb', { f: clamped }, actor, () => {
      const applied = this.sim.setOutdoor(clamped)
      return outdoorMessage(applied)
    })
  }

  setLchltSetpoint(f: number, actor: Actor = 'user'): PlantResult {
    return this.mutate('setLchltSetpoint', { f }, actor, () => {
      const applied = this.sim.setLchlt(f)
      this.pushOpti(`Setpoint ${applied.toFixed(1)}°F LCHLT`)
      this.collapseRepeatOpti('Setpoint')
      return `Setpoint ${applied.toFixed(1)}°F LCHLT.`
    })
  }

  setValve(loop: 'chw' | 'cw' | 'gly', pct: number, actor: Actor = 'user'): PlantResult {
    return this.mutate('setValve', { loop, pct }, actor, () => {
      const applied = this.sim.setHeaderValve(loop, pct)
      return `The ${loop} valve is at ${applied}%.`
    })
  }

  setItLoad(
    args: { deltaMw?: number; targetMw?: number; rampSeconds?: number },
    actor: Actor = 'user',
  ): PlantResult {
    return this.mutate('setItLoad', args, actor, () => {
      const applied = this.sim.setItLoad(args)
      return `IT load target is ${applied.toFixed(1)} MW.`
    })
  }

  /**
   * Start a unit by id. CH-01 cannot start during landing or failover.
   * Unknown ids return ok: false and do not change the plant.
   */
  startChiller(unitId: string, actor: Actor = 'user'): PlantResult {
    if (!this.sim.getUnits().some((unit) => unit.id === unitId)) {
      return this.reject('startChiller', { unitId }, 'This trainer has no unit with that name.')
    }
    const incident = this.sim.getIncident()
    if (unitId === 'CH-01' && (incident === 'landing' || incident === 'failover')) {
      return this.reject(
        'startChiller',
        { unitId },
        'Do not start CH-01 while this incident is active. Clear the incident first.',
      )
    }
    return this.mutate('startChiller', { unitId }, actor, () => {
      this.sim.setUnitRunning(unitId, true)
      if (unitId === 'CH-01') {
        this.pushOpti('The panel accepts the start. The MBC levitates the rotor. The VSD increases speed.')
      } else {
        this.pushOpti(`${unitId} starts. The MBC levitates the rotor.`)
      }
      return `${unitId} starts.`
    })
  }

  /** Stop a unit by id. The UI confirms before it calls this. */
  stopChiller(unitId: string, mode: StopMode, actor: Actor = 'user'): PlantResult {
    if (!this.sim.getUnits().some((unit) => unit.id === unitId)) {
      return this.reject('stopChiller', { unitId, mode }, 'This trainer has no unit with that name.')
    }
    if (mode !== 'soft' && mode !== 'safety') {
      return this.reject('stopChiller', { unitId, mode }, 'Use a soft stop or a safety stop.')
    }
    return this.mutate('stopChiller', { unitId, mode }, actor, () => {
      this.sim.setUnitRunning(unitId, false)
      if (mode === 'soft') {
        this.pushOpti(`${unitId} soft stop. The speed decreases under control.`)
      } else {
        this.pushOpti(`${unitId} safety stop.`, 'alarm')
      }
      return mode === 'soft' ? `${unitId} soft stop.` : `${unitId} safety stop.`
    })
  }

  /**
   * Apply a fault. The first inject while the plant is clear saves the pre-incident memory.
   * forceUnitOff stops that unit first. The no-start drill passes CH-02. Chaos buttons do not.
   */
  injectIncident(kind: IncidentKind, actor: Actor = 'user', options?: { forceUnitOff?: string }): PlantResult {
    if (options?.forceUnitOff && !this.sim.getUnits().some((unit) => unit.id === options.forceUnitOff)) {
      return this.reject('injectIncident', { kind, ...options }, 'This trainer has no unit with that name.')
    }
    return this.mutate('injectIncident', { kind, forceUnitOff: options?.forceUnitOff }, actor, () => {
      if (this.sim.getIncident() === null) this.preIncident = this.capture()
      if (options?.forceUnitOff) this.sim.setUnitRunning(options.forceUnitOff, false)
      this.sim.setIncident(kind)
      this.sim.applyIncidentRunState()
      this.pushOpti('The incident is active. The board is live.', 'alarm')
      return 'The incident is active. The board is live.'
    })
  }

  /**
   * Restore the plant to the memory from before the fault, including the sim clock.
   * Returns ok: false when no inject has stored that memory.
   */
  clearIncident(actor: Actor = 'user'): PlantResult {
    if (!this.preIncident) {
      return this.reject('clearIncident', {}, 'The trainer has no incident snapshot to restore.')
    }
    const memory = this.preIncident
    return this.mutate('clearIncident', {}, actor, () => {
      this.restore(memory)
      this.preIncident = null
      this.pushOpti('The trainer restores the plant to the state before the fault.')
      return 'The trainer restores the plant to the state before the fault.'
    })
  }

  optiviewMessage(kind: 'hall-warning' | 'page-noc', actor: Actor = 'user'): PlantResult {
    return this.mutate('optiviewMessage', { kind }, actor, () => {
      if (kind === 'hall-warning') {
        this.pushOpti('Warning. Condenser approach and hall risk.', 'warn')
        return 'Warning. Condenser approach and hall risk.'
      }
      this.pushOpti('The NOC ticket is open.', 'alarm')
      return 'The NOC ticket is open.'
    })
  }

  setClock(args: { paused?: boolean; scale?: TimeScale }, actor: Actor = 'user'): PlantResult {
    if (args.scale !== undefined && args.scale !== 1 && args.scale !== 2 && args.scale !== 5) {
      return this.reject('setClock', args, 'Use a time scale of 1, 2, or 5.')
    }
    return this.mutate('setClock', args, actor, () => {
      if (args.paused !== undefined) this.sim.setPaused(args.paused)
      if (args.scale !== undefined) this.sim.setTimeScale(args.scale)
      if (this.sim.getPaused()) return 'The trainer pauses the sim clock.'
      return `The trainer sets the sim clock to ${this.sim.getTimeScale()}×.`
    })
  }

  /** Put the trainer back on the default two-unit plant. The UI does not show this yet. */
  reset(actor: Actor = 'user'): PlantResult {
    return this.mutate('reset', {}, actor, () => {
      const seed = this.sim.captureState().seed
      this.sim.restoreState(new PlantSim({ seed, units: trainerFleet(2, 1) }).captureState())
      this.preIncident = null
      this.pushOpti('The trainer restores the default plant.')
      return 'The trainer restores the default plant.'
    })
  }

  /**
   * Replace the unit list. Phase 0 UI does not call this.
   * fleet: N units — a later slice stages a bank of 18, then 36.
   */
  configureFleet(units: ChillerUnitState[], actor: Actor = 'user'): PlantResult {
    return this.mutate('configureFleet', { count: units.length }, actor, () => {
      const ok = this.sim.configureUnits(units)
      if (!ok) return false
      return `The trainer now has ${units.length} units.`
    })
  }

  /** Restore the previous full memory, including the sim clock. */
  undo(actor: Actor = 'user'): PlantResult {
    const entry = this.stack.pop()
    if (!entry) return this.reject('undo', {}, 'The trainer has no earlier state.')
    const before = this.cached
    this.restore(entry.memory)
    this.preIncident = entry.preIncident
    this.cached = this.sim.tick(0)
    this.pushOpti('The trainer undoes the last change.')
    this.pushLog({
      actor,
      action: 'undo',
      args: {},
      t: this.cached.t,
      snapshotBefore: before,
      snapshotAfter: this.cached,
    })
    this.emit('undo', actor)
    return {
      ok: true,
      message: 'The trainer undoes the last change.',
      snapshot: this.cached,
      running: this.running,
    }
  }

  private mutate(
    action: string,
    args: unknown,
    actor: Actor,
    apply: () => string | false,
  ): PlantResult {
    const beforeMemory = this.capture()
    const beforePreIncident = this.preIncident
    const beforeSnap = this.cached
    const message = apply()
    if (message === false) {
      this.restore(beforeMemory)
      this.preIncident = beforePreIncident
      return this.reject(action, args, 'The trainer rejects this action.')
    }
    const coalesced = this.consumeCoalesce(action)
    if (!coalesced) this.pushStack(beforeMemory, beforePreIncident)
    this.cached = this.sim.tick(0)
    if (coalesced) {
      const last = this.actionLog[this.actionLog.length - 1]
      if (last && last.action === action) {
        last.args = args
        last.actor = actor
        last.t = this.cached.t
        last.snapshotAfter = this.cached
      } else {
        this.pushLog({ actor, action, args, t: this.cached.t, snapshotBefore: beforeSnap, snapshotAfter: this.cached })
      }
    } else {
      this.pushLog({ actor, action, args, t: this.cached.t, snapshotBefore: beforeSnap, snapshotAfter: this.cached })
    }
    this.emit(action, actor)
    return { ok: true, message, snapshot: this.cached, running: this.running }
  }

  private reject(action: string, args: unknown, message: string): PlantResult {
    this.pushLog({
      actor: 'system',
      action,
      args,
      t: this.cached.t,
      snapshotBefore: this.cached,
      snapshotAfter: this.cached,
    })
    return { ok: false, message, snapshot: this.cached, running: this.running }
  }

  private capture(): ControllerMemory {
    return {
      sim: this.sim.captureState(),
      optiLog: this.optiLog.map((line) => ({ ...line })),
    }
  }

  private restore(memory: ControllerMemory) {
    this.sim.restoreState(memory.sim)
    this.optiLog = memory.optiLog.map((line) => ({ ...line }))
  }

  /** True when this call continues a slider gesture and the stack already holds the start. */
  private consumeCoalesce(action: string): boolean {
    const now = Date.now()
    const continuous = action === 'setItLoad' || action === 'setLchltSetpoint' || action === 'setValve'
    const hit =
      continuous &&
      this.lastCoalesce?.action === action &&
      now - this.lastCoalesce.at < 600 &&
      this.stack.length > 0
    this.lastCoalesce = continuous ? { action, at: now } : null
    return hit
  }

  private collapseRepeatOpti(prefix: string) {
    const lines = this.optiLog
    if (lines.length < 2) return
    const last = lines[lines.length - 1]
    const prev = lines[lines.length - 2]
    if (last.text.startsWith(prefix) && prev.text.startsWith(prefix)) lines.splice(lines.length - 2, 1)
  }

  private pushStack(memory: ControllerMemory, preIncident: ControllerMemory | null) {
    this.stack.push({ memory, preIncident })
    if (this.stack.length > SNAPSHOT_STACK_DEPTH) {
      this.stack.splice(0, this.stack.length - SNAPSHOT_STACK_DEPTH)
    }
  }

  private pushLog(record: ActionRecord) {
    this.actionLog.push(record)
    if (this.actionLog.length > ACTION_LOG_LIMIT) {
      this.actionLog.splice(0, this.actionLog.length - ACTION_LOG_LIMIT)
    }
  }

  private pushOpti(text: string, kind?: string) {
    this.optiLog.push(kind ? { text, kind } : { text })
    if (this.optiLog.length > OPTI_LOG_LIMIT) {
      this.optiLog.splice(0, this.optiLog.length - OPTI_LOG_LIMIT)
    }
  }

  private emit(action: string, actor: Actor) {
    const detail: PlantChangeDetail = {
      action,
      actor,
      snapshot: this.cached,
      running: this.running,
    }
    this.dispatchEvent(new CustomEvent<PlantChangeDetail>('change', { detail }))
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}
