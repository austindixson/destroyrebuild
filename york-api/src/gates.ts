export type ToolGate = 'R' | 'W' | 'C'

/** Must match yorkToolCatalog() in the trainer. A unit test checks the pair. */
export const TOOL_GATES: Record<string, ToolGate> = {
  'plant.getSnapshot': 'R',
  'plant.getActionLog': 'R',
  'plant.getAlarms': 'R',
  'plant.explain': 'R',
  'plant.setWeather': 'W',
  'plant.setOutdoorDryBulb': 'W',
  'plant.setLchltSetpoint': 'W',
  'plant.setValve': 'W',
  'plant.setItLoad': 'W',
  'chiller.start': 'W',
  'chiller.stop': 'C',
  'incident.inject': 'C',
  'incident.clear': 'C',
  'optiview.message': 'W',
  'sim.setClock': 'W',
  'sim.reset': 'C',
  'sim.undo': 'W',
  'plant.configureFleet': 'W',
}

export function gateFor(name: string): ToolGate | null {
  return TOOL_GATES[name] ?? null
}
