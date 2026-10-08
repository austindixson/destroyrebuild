import { glycolHeaderDpPsi } from './plantSim'

/**
 * Balance-valve red zones for the trainer.
 *
 * These are trainer limits, not a York manual table. The pipe board paints a
 * reading red at the same steady differential-pressure marks (the live reading
 * also has a small sine, which this zone ignores so the alert does not flicker):
 * - CHW ΔP below 12 psi or above 24 psi
 * - CW ΔP below 8 psi (the curve never reaches the 18 psi high mark)
 * - Glycol ΔP below 8 psi when outdoor dry-bulb is at or below 48°F
 *
 * Steady openings from chwDpAt / cwDpAt / glycolDpAt in plantSim.ts:
 * - CHW 40% is 11.81 psi and 41% is 12.00 psi, so 40% and below is the low zone
 * - CHW 92% is 23.87 psi and 93% is 24.13 psi, so 93% and above is the high zone
 * - CW 44% is 7.96 psi and 45% is 8.08 psi, so 44% and below is the low zone
 * - A wide CW valve stays under 18 psi. It is not a red zone.
 * - Glycol red depends on outdoor temperature because cold glycol is thicker.
 *
 * applyFlowAlarm uses CHW below 42% and CW below 40%. Those faults sit next to
 * these marks. The alert follows the red ΔP mark so the panel and the red
 * number describe the same opening.
 */
export const VALVE_RED = {
  chwDpLowPsi: 12,
  chwDpHighPsi: 24,
  cwDpLowPsi: 8,
  cwDpHighPsi: 18,
  glyDpLowPsi: 8,
  glyOatAtOrBelow: 48,
  chwLowAtOrBelow: 40,
  chwHighAtOrAbove: 93,
  cwLowAtOrBelow: 44,
} as const

export type ValveLoop = 'chw' | 'cw' | 'gly'

export type ValveZone = 'ok' | 'low' | 'high'

const LOOPS: readonly ValveLoop[] = ['chw', 'cw', 'gly']

export interface ValveReading {
  chw: number
  cw: number
  gly: number
  oatF: number
}

export interface ValveAlertState {
  zones: Record<ValveLoop, ValveZone>
  /** Red loop that owns the panel. Null when the panel is hidden. */
  shown: ValveLoop | null
  dismissed: boolean
}

export interface ValveAlertShow {
  loop: ValveLoop
  zone: 'low' | 'high'
  text: string
}

export interface ValveAlertResult {
  state: ValveAlertState
  show: ValveAlertShow | null
  /** True only on the tick that enters a red zone. Later ticks in that zone are false. */
  entered: boolean
}

const CHW_LOW =
  'The hall supply temperature rises, and the CRAHs do not get enough flow. The CHW valve is too far closed, so the CHW ΔP falls below 12 psi.'

const CHW_HIGH =
  'The CHW ΔP is above 24 psi. The CHW valve is almost fully open, and the piping and the coils are the restriction.'

const CW_LOW =
  'Condenser pressure and the condenser approach rise. The CW valve is too far closed, so cooling tower flow is low and the CW ΔP is below 8 psi.'

const GLY_LOW =
  'Flow to the dry cooler is low. The glycol valve is too far closed for this outdoor temperature, so the glycol ΔP is below 8 psi.'

export function seedValveAlert(reading: ValveReading): ValveAlertState {
  return { zones: zonesFor(reading), shown: null, dismissed: false }
}

export function dismissValveAlert(state: ValveAlertState): ValveAlertState {
  return { ...state, shown: null, dismissed: true }
}

export function valveAlertShow(state: ValveAlertState): ValveAlertShow | null {
  const loop = state.shown
  if (!loop) return null
  const zone = state.zones[loop]
  if (zone === 'ok') return null
  return { loop, zone, text: valveAlertText(loop, zone) }
}

/** One alert when a valve enters red. The same zone does not alert again until it leaves. */
export function reduceValveAlert(state: ValveAlertState, reading: ValveReading): ValveAlertResult {
  const zones = zonesFor(reading)
  const enteredId = enteredLoop(state.zones, zones)
  let shown = enteredId ?? keepOrDowngrade(state.shown, zones)
  let dismissed = state.dismissed
  if (enteredId) dismissed = false
  if (!enteredId && dismissed) shown = null
  if (allClear(zones)) {
    shown = null
    dismissed = false
  }
  const next: ValveAlertState = { zones, shown, dismissed }
  return { state: next, show: valveAlertShow(next), entered: enteredId !== null }
}

export function valveZone(loop: ValveLoop, pct: number, oatF: number): ValveZone {
  switch (loop) {
    case 'chw':
      return chwZone(pct)
    case 'cw':
      return cwZone(pct)
    case 'gly':
      return glyZone(pct, oatF)
    default: {
      const unknown: never = loop
      return unknown
    }
  }
}

function zonesFor(reading: ValveReading): Record<ValveLoop, ValveZone> {
  return {
    chw: chwZone(reading.chw),
    cw: cwZone(reading.cw),
    gly: glyZone(reading.gly, reading.oatF),
  }
}

function chwZone(pct: number): ValveZone {
  if (pct <= VALVE_RED.chwLowAtOrBelow) return 'low'
  if (pct >= VALVE_RED.chwHighAtOrAbove) return 'high'
  return 'ok'
}

function cwZone(pct: number): ValveZone {
  if (pct <= VALVE_RED.cwLowAtOrBelow) return 'low'
  return 'ok'
}

function glyZone(pct: number, oatF: number): ValveZone {
  if (oatF > VALVE_RED.glyOatAtOrBelow) return 'ok'
  if (glycolHeaderDpPsi(pct, oatF) < VALVE_RED.glyDpLowPsi) return 'low'
  return 'ok'
}

function enteredLoop(prev: Record<ValveLoop, ValveZone>, next: Record<ValveLoop, ValveZone>): ValveLoop | null {
  let found: ValveLoop | null = null
  for (const loop of LOOPS) {
    if (prev[loop] !== next[loop] && next[loop] !== 'ok') found = loop
  }
  return found
}

function keepOrDowngrade(shown: ValveLoop | null, next: Record<ValveLoop, ValveZone>): ValveLoop | null {
  if (shown && next[shown] !== 'ok') return shown
  if (!shown) return null
  return firstRed(next)
}

function firstRed(zones: Record<ValveLoop, ValveZone>): ValveLoop | null {
  for (const loop of LOOPS) {
    if (zones[loop] !== 'ok') return loop
  }
  return null
}

function allClear(zones: Record<ValveLoop, ValveZone>): boolean {
  for (const loop of LOOPS) {
    if (zones[loop] !== 'ok') return false
  }
  return true
}

function valveAlertText(loop: ValveLoop, zone: 'low' | 'high'): string {
  switch (loop) {
    case 'chw':
      return zone === 'high' ? CHW_HIGH : CHW_LOW
    case 'cw':
      return CW_LOW
    case 'gly':
      return GLY_LOW
    default: {
      const unknown: never = loop
      return unknown
    }
  }
}
