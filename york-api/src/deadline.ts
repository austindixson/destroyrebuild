const deadlines = new WeakMap<AbortSignal, number>()

export function stampDeadline(signal: AbortSignal, at: number): void {
  deadlines.set(signal, at)
}

export function remainingMs(signal: AbortSignal, now = Date.now()): number {
  const at = deadlines.get(signal)
  if (at === undefined) return Number.POSITIVE_INFINITY
  return Math.max(0, at - now)
}
