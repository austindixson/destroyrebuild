export interface Inflight {
  tryAcquire(): boolean
  release(): void
}

export function createInflight(max: number): Inflight {
  let current = 0
  return {
    tryAcquire() {
      if (current >= max) return false
      current += 1
      return true
    },
    release() {
      if (current > 0) current -= 1
    },
  }
}

export function defaultInflight(): Inflight {
  const raw = Number(process.env.YORK_MAX_INFLIGHT ?? 4)
  const max = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 4
  return createInflight(max)
}
