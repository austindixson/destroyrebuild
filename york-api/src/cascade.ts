import { remainingMs } from './deadline.ts'
import { redactReason } from './leak.ts'
import { usableModelText } from './parse.ts'
import { canHold, releaseHold, tryHold } from './slots.ts'
import type { LlmAnswer, LlmRequest } from './types.ts'

export interface Adapter {
  id: string
  model: string
  budgetMs?: number
  limit?: number
  enabled(): boolean
  complete(req: LlmRequest, signal: AbortSignal): Promise<string>
}

function cursorBudget(later: Adapter[]): number {
  for (const item of later) {
    if (item.id === 'cursor' && item.budgetMs) return item.budgetMs
  }
  return 0
}

function cursorCanRun(later: Adapter[]): boolean {
  const cursor = later.find((item) => item.id === 'cursor')
  if (!cursor || !cursor.enabled()) return false
  if (!cursor.limit) return true
  return canHold(cursor.id, cursor.limit)
}

/** Skip claude only under its own budget. A busy cursor slot does not skip claude. */
function skipClaude(later: Adapter[], left: number, budget: number): boolean {
  const cursor = later.find((item) => item.id === 'cursor')
  if (cursor && !cursorCanRun(later)) return false
  return left < budget
}

/** Other tiers still leave room for cursor. Claude uses skipClaude. */
function leavesCursorShort(adapter: Adapter, later: Adapter[], left: number): boolean {
  const budget = adapter.budgetMs
  const rescue = cursorBudget(later)
  if (!budget || !rescue || adapter.id === 'cursor' || adapter.id === 'claude') return false
  if (left < rescue) return false
  return left < budget + rescue
}

function claudeFirst(adapters: Adapter[], req: LlmRequest): Adapter[] {
  if (req.openCase !== true) return adapters
  const index = adapters.findIndex((item) => item.id === 'claude')
  const claude = index > 0 ? adapters[index] : undefined
  if (!claude) return adapters
  return [claude, ...adapters.slice(0, index), ...adapters.slice(index + 1)]
}

/** A last tier starts on the time left when at least this much remains. */
export const LAST_TIER_FLOOR_MS = 40_000

/** Half of the 135 s window. A follow-up past this point starts on claude. */
export const HALF_WINDOW_MS = 67_500

/** Round 0 uses the tier budget. A follow-up uses the shorter of that budget and the time left after the next tier. */
export function roundBudgetMs(signal: AbortSignal, tierMs: number, round: number | undefined, reserveMs = 0): number {
  if (!round || round < 1) return tierMs
  const left = remainingMs(signal)
  if (!Number.isFinite(left)) return tierMs
  const room = Math.max(0, Math.floor(left) - Math.max(0, Math.floor(reserveMs)))
  return Math.min(tierMs, room)
}

/** The last enabled tier runs on the time left when that remainder is at least 40 s. */
function lastTierRuns(later: Adapter[], left: number): boolean {
  if (later.some((item) => item.enabled())) return false
  return left >= LAST_TIER_FLOOR_MS
}

function rotateTo(adapters: Adapter[], id: string): Adapter[] {
  const index = adapters.findIndex((item) => item.id === id)
  if (index <= 0) return adapters
  return [...adapters.slice(index), ...adapters.slice(0, index)]
}

function pastHalf(signal: AbortSignal): boolean {
  const left = remainingMs(signal)
  return Number.isFinite(left) && left < HALF_WINDOW_MS
}

function orderFor(adapters: Adapter[], req: LlmRequest, signal: AbortSignal): Adapter[] {
  if ((req.round ?? 0) >= 1 && pastHalf(signal)) return rotateTo(adapters, 'claude')
  if ((req.round ?? 0) >= 1 && req.tier) return rotateTo(adapters, req.tier)
  return claudeFirst(adapters, req)
}

function nextReserve(later: Adapter[], skip: readonly string[]): number {
  for (const item of later) {
    if (!item.enabled() || !item.budgetMs) continue
    if (skip.includes(item.id)) continue
    return item.budgetMs
  }
  return 0
}

/** Hold the next budget only when this tier and the next tier both still fit. */
function holdBack(budget: number, later: Adapter[], skip: readonly string[], left: number): number {
  const next = nextReserve(later, skip)
  if (!next) return 0
  if (!Number.isFinite(left) || left >= budget + next) return next
  return 0
}

function lastFollowTier(later: Adapter[], skip: readonly string[]): boolean {
  return nextReserve(later, skip) === 0
}

function priorTimeout(id: string, round: number | undefined, skip: readonly string[]): boolean {
  if ((round ?? 0) < 1) return false
  return skip.includes(id)
}

function followOver(
  adapter: Adapter,
  later: Adapter[],
  signal: AbortSignal,
  round: number | undefined,
  skip: readonly string[],
): boolean {
  const budget = adapter.budgetMs
  if (!budget) return false
  const left = remainingMs(signal)
  const reserve = holdBack(budget, later, skip, left)
  if (lastFollowTier(later, skip) && Number.isFinite(left) && left < LAST_TIER_FLOOR_MS) {
    console.log(`york-api cli ${adapter.id} skipped reason=budget remaining=${left}`)
    return true
  }
  if (roundBudgetMs(signal, budget, round, reserve) > 0) return false
  console.log(`york-api cli ${adapter.id} skipped reason=budget remaining=${left}`)
  return true
}

function overBudget(adapter: Adapter, later: Adapter[], signal: AbortSignal, req: LlmRequest, skip: readonly string[]): boolean {
  const budget = adapter.budgetMs
  if (!budget) return false
  if ((req.round ?? 0) >= 1) return followOver(adapter, later, signal, req.round, skip)
  const left = remainingMs(signal)
  if (lastTierRuns(later, left)) return false
  const short = adapter.id === 'claude'
    ? skipClaude(later, left, budget)
    : left < budget || leavesCursorShort(adapter, later, left)
  if (!short) return false
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
  const order = orderFor(adapters, req, signal)
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
    if (overBudget(adapter, later, signal, req, timedOut)) continue
    const hold = claim(adapter)
    if (!hold) continue
    const launch = { ...req, reserveMs: holdBack(adapter.budgetMs ?? 0, later, timedOut, remainingMs(signal)) }
    try {
      const text = await takeReply(adapter, launch, signal)
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
