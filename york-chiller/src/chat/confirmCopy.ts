export interface ConfirmCard {
  title: string
  body: string
  yes: string
  no: string
}

function unitId(args: Record<string, unknown>): string {
  return typeof args.unit === 'string' && args.unit.trim() ? args.unit.trim() : 'this unit'
}

function stopCopy(args: Record<string, unknown>): ConfirmCard {
  const unit = unitId(args)
  if (args.mode === 'safety') {
    return {
      title: 'Safety stop',
      body: `Do a safety stop on ${unit}? This stop takes the unit offline now.`,
      yes: 'Do the stop',
      no: 'Cancel',
    }
  }
  return {
    title: 'Soft stop',
    body: `Do a soft stop on ${unit}? The hall can get hot if no other chiller runs.`,
    yes: 'Do the stop',
    no: 'Cancel',
  }
}

function injectCopy(args: Record<string, unknown>): ConfirmCard {
  const kind = typeof args.kind === 'string' && args.kind.trim() ? args.kind.trim() : 'this fault'
  return {
    title: 'Apply a fault',
    body: `Apply the fault ${kind} on the live board? The plant will change.`,
    yes: 'Apply the fault',
    no: 'Cancel',
  }
}

function clearCopy(): ConfirmCard {
  return {
    title: 'Clear the incident',
    body: 'Clear the incident? The plant returns to the state before the fault.',
    yes: 'Clear the incident',
    no: 'Cancel',
  }
}

function resetCopy(): ConfirmCard {
  return {
    title: 'Restore the plant',
    body: 'Restore the default plant? This removes the current board.',
    yes: 'Restore the plant',
    no: 'Cancel',
  }
}

/** Fixed card text. The model does not write this copy. */
export function confirmCopy(name: string, args: Record<string, unknown>): ConfirmCard | null {
  if (name === 'chiller.stop') return stopCopy(args)
  if (name === 'incident.inject') return injectCopy(args)
  if (name === 'incident.clear') return clearCopy()
  if (name === 'sim.reset') return resetCopy()
  return null
}
