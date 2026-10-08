import {
  CHW_DP_HIGH_PSI,
  CHW_DP_LOW_PSI,
  cwHeaderDpPsi,
  glycolHeaderDpPsi,
  printedChwDpPsi,
} from './plantSim'

/**
 * Balance-valve red zones for the trainer.
 *
 * These are trainer limits, not a York manual table. The zone uses the same
 * 0.1 psi round the pipe board prints. A raw 7.96 psi prints as 8.0, and 8.0
 * is not below 8, so that opening is not red.
 *
 * Rounded edges from the header curves:
 * - CHW 40% prints 11.8 psi and 41% prints 12.0 psi
 * - CHW 92% prints 23.9 psi and 93% prints 24.1 psi
 * - CW 43% prints 7.8 psi and 44% prints 8.0 psi
 * - A wide CW valve stays under 18 psi, so CW has no high zone
 * - Glycol 22% at 40°F prints 7.9 psi and 23% prints 8.1 psi
 *
 * Hall-hot replaces the CHW ΔP with 9.5 psi. If that printed value is not in
 * the same zone as the valve curve, this alert stays quiet so it does not
 * contradict the board. The home CHW card is the only place that adds wobble.
 *
 * The home CHW low banner uses printedChwDpPsi and the same 12 psi limit.
 * CW below 40% is a separate banner.
 */
export const VALVE_RED = {
  chwDpLowPsi: CHW_DP_LOW_PSI,
  chwDpHighPsi: CHW_DP_HIGH_PSI,
  cwDpLowPsi: 8,
  cwDpHighPsi: 18,
  glyDpLowPsi: 8,
  glyOatAtOrBelow: 48,
} as const

export type ValveLoop = 'chw' | 'cw' | 'gly'

export type ValveZone = 'ok' | 'low' | 'high'

const LOOPS: readonly ValveLoop[] = ['chw', 'cw', 'gly']

export interface ValveReading {
  chw: number
  cw: number
  gly: number
  oatF: number
  /** Printed header ΔP. When it disagrees with the valve curve, the alert stays quiet. */
  chwDp?: number
  cwDp?: number
  glyDp?: number
}

export interface ValveAlertState {
  zones: Record<ValveLoop, ValveZone>
  /** Red loop that owns the panel. Null when the panel is hidden, including after dismiss. */
  shown: ValveLoop | null
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
  'The hall supply temperature rises, and the CRAHs do not get enough flow. The CHW valve is too far closed, so the CHW ΔP falls below the trainer limit of 12 psi.'

const CHW_HIGH =
  'The CHW ΔP is above the trainer limit of 24 psi. The CHW valve is almost fully open, and the piping and the coils are the restriction.'

const CW_LOW =
  'Condenser pressure and the CW return temperature rise. The CW valve is too far closed, so cooling tower flow is low and the CW ΔP is below the trainer limit of 8 psi.'

const GLY_LOW =
  'Flow to the dry cooler is low. The glycol valve is too far closed for this outdoor temperature, so the glycol ΔP is below the trainer limit of 8 psi.'

export function seedValveAlert(reading: ValveReading): ValveAlertState {
  return { zones: zonesFor(reading), shown: null }
}

export function dismissValveAlert(state: ValveAlertState): ValveAlertState {
  return { ...state, shown: null }
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
  if (allClear(zones)) shown = null
  const next: ValveAlertState = { zones, shown }
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
    chw: agree(chwZone(reading.chw), reading.chwDp, VALVE_RED.chwDpLowPsi, VALVE_RED.chwDpHighPsi),
    cw: agree(cwZone(reading.cw), reading.cwDp, VALVE_RED.cwDpLowPsi, VALVE_RED.cwDpHighPsi),
    gly: agree(glyZone(reading.gly, reading.oatF), reading.glyDp, VALVE_RED.glyDpLowPsi, Number.POSITIVE_INFINITY),
  }
}

function shownPsi(dp: number): number {
  return Math.round(dp * 10) / 10
}

function dpZone(dp: number, low: number, high: number): ValveZone {
  if (dp < low) return 'low'
  if (dp > high) return 'high'
  return 'ok'
}

/** A printed ΔP in a different zone hides the valve alert. */
function agree(curve: ValveZone, boardDp: number | undefined, low: number, high: number): ValveZone {
  if (curve === 'ok' || boardDp === undefined) return curve
  if (dpZone(boardDp, low, high) !== curve) return 'ok'
  return curve
}

function chwZone(pct: number): ValveZone {
  return dpZone(printedChwDpPsi(pct), VALVE_RED.chwDpLowPsi, VALVE_RED.chwDpHighPsi)
}

function cwZone(pct: number): ValveZone {
  return dpZone(shownPsi(cwHeaderDpPsi(pct)), VALVE_RED.cwDpLowPsi, VALVE_RED.cwDpHighPsi)
}

function glyZone(pct: number, oatF: number): ValveZone {
  if (oatF > VALVE_RED.glyOatAtOrBelow) return 'ok'
  if (shownPsi(glycolHeaderDpPsi(pct, oatF)) < VALVE_RED.glyDpLowPsi) return 'low'
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
