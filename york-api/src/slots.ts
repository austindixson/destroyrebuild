const held = new Map<string, number>()

export function resetHolds(): void {
  held.clear()
}

/** Peek. True when another call can take a slot. */
export function canHold(id: string, limit: number): boolean {
  return (held.get(id) ?? 0) < limit
}

export function tryHold(id: string, limit: number): boolean {
  if (!canHold(id, limit)) return false
  held.set(id, (held.get(id) ?? 0) + 1)
  return true
}

export function releaseHold(id: string): void {
  const now = held.get(id) ?? 0
  if (now <= 1) held.delete(id)
  else held.set(id, now - 1)
}
