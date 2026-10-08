export interface BudgetDecision {
  ok: boolean
  nearCap: boolean
}

export interface Budget {
  allow(ip: string, round: number, now: number): BudgetDecision
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

export function createBudget(dailyCap: number, perMinute: number, globalDailyCap: number): Budget {
  const hits = new Map<string, number[]>()
  const daily = new Map<string, DailyRow>()
  let global: DailyRow = { day: '', count: 0 }
  return {
    allow(ip, round, now) {
      if (round < 0) return { ok: false, nearCap: false }
      const recent = (hits.get(ip) ?? []).filter((stamp) => now - stamp < 60_000)
      if (recent.length >= perMinute) return { ok: false, nearCap: false }
      recent.push(now)
      hits.set(ip, recent)
      const day = dayKey(now)
      const count = nextCount(daily.get(ip), day)
      if (count > dailyCap) return { ok: false, nearCap: false }
      const globalCount = nextCount(global, day)
      if (globalCount > globalDailyCap) return { ok: false, nearCap: false }
      daily.set(ip, { day, count })
      global = { day, count: globalCount }
      const nearIp = count >= Math.ceil(dailyCap * 0.8)
      const nearGlobal = globalCount >= Math.ceil(globalDailyCap * 0.8)
      return { ok: true, nearCap: nearIp || nearGlobal }
    },
  }
}
