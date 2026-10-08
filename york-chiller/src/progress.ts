export interface ProgressState {
  explored: string[]
  plantComplete: boolean
  cycleComplete: boolean
  operationComplete: boolean
  optiviewComplete: boolean
  matchBest: number
  quizBest: number
  troubleSolved: string[]
  maintenanceComplete: boolean
  xp: number
}

const KEY = 'ymc2-trainer-progress-v2-dc'

const defaultState = (): ProgressState => ({
  explored: [],
  plantComplete: false,
  cycleComplete: false,
  operationComplete: false,
  optiviewComplete: false,
  matchBest: 0,
  quizBest: 0,
  troubleSolved: [],
  maintenanceComplete: false,
  xp: 0,
})

export function loadProgress(): ProgressState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState()
    return { ...defaultState(), ...JSON.parse(raw) }
  } catch {
    return defaultState()
  }
}

export function saveProgress(state: ProgressState): void {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function masteryPercent(p: ProgressState): number {
  const parts = [
    Math.min(p.explored.length, 8) / 8,
    p.plantComplete ? 1 : 0,
    p.cycleComplete ? 1 : 0,
    p.operationComplete ? 1 : 0,
    p.optiviewComplete ? 1 : 0,
    Math.min(p.matchBest, 8) / 8,
    Math.min(p.quizBest, 10) / 10,
    Math.min(p.troubleSolved.length, 5) / 5,
    p.maintenanceComplete ? 1 : 0,
  ]
  return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100)
}

export function addXp(p: ProgressState, amount: number): ProgressState {
  const next = { ...p, xp: p.xp + amount }
  saveProgress(next)
  return next
}
