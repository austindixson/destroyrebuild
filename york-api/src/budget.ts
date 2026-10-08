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

export function createBudget(dailyCap: number, perMinute: number): Budget {
  const hits = new Map<string, number[]>()
  const daily = new Map<string, DailyRow>()
  return {
    allow(ip, round, now) {
      const recent = (hits.get(ip) ?? []).filter((stamp) => now - stamp < 60_000)
      if (recent.length >= perMinute) return { ok: false, nearCap: false }
      recent.push(now)
      hits.set(ip, recent)
      if (round > 0) return { ok: true, nearCap: false }
      const day = new Date(now).toISOString().slice(0, 10)
      const row = daily.get(ip)
      const count = row && row.day === day ? row.count + 1 : 1
      if (count > dailyCap) return { ok: false, nearCap: false }
      daily.set(ip, { day, count })
      return { ok: true, nearCap: count >= Math.ceil(dailyCap * 0.8) }
    },
  }
}
