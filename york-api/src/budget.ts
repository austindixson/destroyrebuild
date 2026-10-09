import { budgetKey } from './ip.ts'

export interface BudgetDecision {
  ok: boolean
  nearCap: boolean
}

export interface Budget {
  allow(ip: string, round: number, now: number): BudgetDecision
  size(): { hits: number; daily: number }
}

export interface BudgetTune {
  pruneEvery?: number
  pruneMs?: number
}

interface DailyRow {
  day: string
  count: number
}

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

function nextCount(row: DailyRow | undefined, day: string): number {
  return row && row.day === day ? row.count + 1 : 1
}

function nearCap(count: number, cap: number): boolean {
  return count >= Math.ceil(cap * 0.8)
}

function prune(hits: Map<string, number[]>, daily: Map<string, DailyRow>, day: string, now: number): void {
  for (const [key, stamps] of hits) {
    const recent = stamps.filter((stamp) => now - stamp < 60_000)
    if (recent.length === 0) hits.delete(key)
    else hits.set(key, recent)
  }
  for (const [key, row] of daily) {
    if (row.day !== day) daily.delete(key)
  }
}

export function createBudget(
  dailyCap: number,
  perMinute: number,
  globalDailyCap: number,
  tune: BudgetTune = {},
): Budget {
  const pruneEvery = tune.pruneEvery ?? 100
  const pruneMs = tune.pruneMs ?? 60_000
  const hits = new Map<string, number[]>()
  const daily = new Map<string, DailyRow>()
  let global: DailyRow = { day: '', count: 0 }
  let lastPrune = 0
  let sincePrune = 0
  return {
    size() {
      return { hits: hits.size, daily: daily.size }
    },
    allow(ip, round, now) {
      if (round < 0) return { ok: false, nearCap: false }
      const key = budgetKey(ip)
      const day = dayKey(now)
      sincePrune += 1
      if (lastPrune === 0 || sincePrune >= pruneEvery || now - lastPrune >= pruneMs) {
        lastPrune = now
        sincePrune = 0
        prune(hits, daily, day, now)
      }
      const recent = (hits.get(key) ?? []).filter((stamp) => now - stamp < 60_000)
      if (recent.length >= perMinute) return { ok: false, nearCap: false }
      recent.push(now)
      hits.set(key, recent)
      const count = nextCount(daily.get(key), day)
      if (count > dailyCap) return { ok: false, nearCap: false }
      const globalCount = nextCount(global.day === day ? global : undefined, day)
      if (globalCount > globalDailyCap) return { ok: false, nearCap: false }
      daily.set(key, { day, count })
      global = { day, count: globalCount }
      return { ok: true, nearCap: nearCap(count, dailyCap) || nearCap(globalCount, globalDailyCap) }
    },
  }
}
