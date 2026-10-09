const held = new Map<string, number>()

export function resetHolds(): void {
  held.clear()
}

export function tryHold(id: string, limit: number): boolean {
  const now = held.get(id) ?? 0
  if (now >= limit) return false
  held.set(id, now + 1)
  return true
}

export function releaseHold(id: string): void {
  const now = held.get(id) ?? 0
  if (now <= 1) held.delete(id)
  else held.set(id, now - 1)
}
