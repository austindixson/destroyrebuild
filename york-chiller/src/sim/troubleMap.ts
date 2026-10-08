import type { IncidentKind } from './plantSim'

/** Incident-clock case ids. Keep this list equal to TROUBLE_CASES. */
export const TROUBLE_CASE_IDS = [
  'high-head',
  'hall-hot-chiller-idle',
  'landing',
  'no-start',
  'bms-fight',
] as const

export type TroubleCaseId = (typeof TROUBLE_CASE_IDS)[number]

export function isTroubleCaseId(id: string): id is TroubleCaseId {
  return (TROUBLE_CASE_IDS as readonly string[]).includes(id)
}

/**
 * Map a case to a board incident once, when the trainee enters that case.
 * The no-start case requires CH-02 off so the inhibit path is the drill.
 * Other failover paths keep a unit that is already running.
 */
export function troubleIncident(id: TroubleCaseId): { kind: IncidentKind; forceUnitOff?: string } {
  switch (id) {
    case 'high-head':
      return { kind: 'high-head' }
    case 'hall-hot-chiller-idle':
      return { kind: 'hall-hot' }
    case 'landing':
      return { kind: 'landing' }
    case 'no-start':
      return { kind: 'failover', forceUnitOff: 'CH-02' }
    case 'bms-fight':
      return { kind: 'bms-fight' }
    default: {
      const unknown: never = id
      return unknown
    }
  }
}
