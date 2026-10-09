import { remainingMs } from './deadline.ts'
import { redactReason } from './leak.ts'
import { usableModelText } from './parse.ts'
import { releaseHold, tryHold } from './slots.ts'
import type { LlmAnswer, LlmRequest } from './types.ts'

export interface Adapter {
  id: string
  model: string
  budgetMs?: number
  limit?: number
  enabled(): boolean
  complete(req: LlmRequest, signal: AbortSignal): Promise<string>
}

/** The last enabled tier starts on the time left when at least this much remains. */
export const LAST_TIER_FLOOR_MS = 40_000

/** Follow-up grok cap. The readings prompt is short, so this stays under the round-0 grok budget. */
export const FOLLOW_GROK_MS = 40_000

function followCap(tierMs: number, tierId: string): number {
  if (tierId === 'grok') return Math.min(tierMs, FOLLOW_GROK_MS)
  return tierMs
}

/** Round 0 uses the tier budget. A follow-up grok uses the short cap. Other follow-ups need the full budget. */
export function roundBudgetMs(signal: AbortSignal, tierMs: number, round: number | undefined, tierId = ''): number {
  if (!round || round < 1) return tierMs
  const cap = followCap(tierMs, tierId)
  const left = remainingMs(signal)
  if (!Number.isFinite(left) || left >= cap) return cap
  return 0
}

/** The last enabled tier runs on the time left when that remainder is at least 40 s. */
function lastTierRuns(later: Adapter[], left: number): boolean {
  if (later.some((item) => item.enabled())) return false
  return left >= LAST_TIER_FLOOR_MS
}

function followRank(id: string): number {
  if (id === 'grok') return 0
  if (id === 'cursor') return 1
  return 2
}

function followOrder(adapters: Adapter[]): Adapter[] {
  return [...adapters].sort((a, b) => followRank(a.id) - followRank(b.id))
}

function orderFor(adapters: Adapter[], req: LlmRequest): Adapter[] {
  if ((req.round ?? 0) < 1) return adapters
  if (req.tier) console.log(`york-api follow tier=${req.tier}`)
  return followOrder(adapters)
}

function priorTimeout(id: string, round: number | undefined, skip: readonly string[]): boolean {
  if ((round ?? 0) < 1) return false
  return skip.includes(id)
}

function followOver(adapter: Adapter, signal: AbortSignal, round: number | undefined): boolean {
  const budget = adapter.budgetMs
  if (!budget) return false
  if (roundBudgetMs(signal, budget, round, adapter.id) > 0) return false
  console.log(`york-api cli ${adapter.id} skipped reason=budget remaining=${remainingMs(signal)}`)
  return true
}

function overBudget(adapter: Adapter, later: Adapter[], signal: AbortSignal, req: LlmRequest): boolean {
  const budget = adapter.budgetMs
  if (!budget) return false
  if ((req.round ?? 0) >= 1) return followOver(adapter, signal, req.round)
  const left = remainingMs(signal)
  if (lastTierRuns(later, left)) return false
  if (left >= budget) return false
  console.log(`york-api cli ${adapter.id} skipped reason=budget remaining=${left}`)
  return true
}

function noteTimeout(message: string, id: string, timedOut: string[]): void {
  if (!/^timeout budget=\d+$/.test(message)) return
  if (timedOut.includes(id)) return
  timedOut.push(id)
}

function canReask(adapter: Adapter, signal: AbortSignal): boolean {
  const budget = adapter.budgetMs
  if (!budget) return false
  return remainingMs(signal) >= budget
}

function jsonRetry(req: LlmRequest): LlmRequest {
  return {
    ...req,
    user: `${req.user}\n\nThe last reply was prose. Reply with one JSON object and no other text.`,
  }
}

type Hold = 'free' | 'held'

function claim(adapter: Adapter): Hold | null {
  if (!adapter.limit) return 'free'
  if (tryHold(adapter.id, adapter.limit)) return 'held'
  console.log(`york-api cli ${adapter.id} skipped reason=busy`)
  return null
}

async function takeReply(adapter: Adapter, req: LlmRequest, signal: AbortSignal): Promise<string> {
  const text = (await adapter.complete(req, signal)).trim()
  if (!text) throw new Error('empty')
  if (usableModelText(text)) return text
  if (!canReask(adapter, signal)) throw new Error('unusable')
  console.log(`york-api cli ${adapter.id} reask reason=prose`)
  const again = (await adapter.complete(jsonRetry(req), signal)).trim()
  if (!again || !usableModelText(again)) throw new Error('unusable')
  return again
}

export async function cascade(adapters: Adapter[], req: LlmRequest, signal: AbortSignal): Promise<LlmAnswer> {
  const order = orderFor(adapters, req)
  const timedOut = [...(req.timedOut ?? [])]
  let lastError = 'no provider'
  for (let index = 0; index < order.length; index += 1) {
    const adapter = order[index]
    if (!adapter) continue
    if (signal.aborted) throw new Error('aborted')
    if (!adapter.enabled()) continue
    if (priorTimeout(adapter.id, req.round, timedOut)) {
      console.log(`york-api cli ${adapter.id} skipped reason=timeout`)
      continue
    }
    const later = order.slice(index + 1)
    if (overBudget(adapter, later, signal, req)) continue
    const hold = claim(adapter)
    if (!hold) continue
    try {
      const text = await takeReply(adapter, req, signal)
      return { text, provider: adapter.id, model: adapter.model, timedOut }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error'
      lastError = message
      noteTimeout(message, adapter.id, timedOut)
      console.log(`york-api cli ${adapter.id} failed reason=${redactReason(message)}`)
    } finally {
      if (hold === 'held') releaseHold(adapter.id)
    }
  }
  throw new Error(lastError)
}
