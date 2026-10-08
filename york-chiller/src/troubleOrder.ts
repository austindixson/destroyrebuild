export type TroubleDestination = { kind: 'case'; index: number } | { kind: 'complete' }

/** New array for one presentation. Each option keeps its correct flag. */
export function shuffleChoices<T>(options: readonly T[], random: () => number = Math.random): T[] {
  const next = options.slice()
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const current = next[i]
    next[i] = next[j]
    next[j] = current
  }
  return next
}

export function openTroubleView(allSolved: boolean, index: number): TroubleDestination {
  if (allSolved) return { kind: 'complete' }
  return { kind: 'case', index }
}

function stepDelta(direction: 'next' | 'prev'): number {
  switch (direction) {
    case 'next':
      return 1
    case 'prev':
      return -1
    default: {
      const unknown: never = direction
      return unknown
    }
  }
}

/**
 * Before every incident is cleared, Next and Previous wrap so each case can be reached.
 * After that, Next past the last case opens the completion view. Previous does not wrap.
 */
export function troubleStep(
  index: number,
  count: number,
  direction: 'next' | 'prev',
  allSolved: boolean,
): TroubleDestination {
  const raw = index + stepDelta(direction)
  if (!allSolved) return { kind: 'case', index: (raw + count) % count }
  if (raw >= count) return { kind: 'complete' }
  if (raw < 0) return { kind: 'case', index: 0 }
  return { kind: 'case', index: raw }
}
