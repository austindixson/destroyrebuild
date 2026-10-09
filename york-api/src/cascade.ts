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

/** Follow-up cap for claude when a later tier can still take its full budget. */
export const FOLLOW_CLAUDE_MS = 30_000

const FOLLOW_SLACK_MS = 1_000

/** True when this follow-up or round-0 claude turn should take the time left minus 1 s. */
const claudeRest = new WeakMap<AbortSignal, boolean>()

function slackRoom(left: number): number {
  return Math.max(0, Math.floor(left) - FOLLOW_SLACK_MS)
}

function laterFullFits(later: Adapter[], left: number, leadMs: number): boolean {
  if (!Number.isFinite(left)) return true
  for (const item of later) {
    const budget = item.budgetMs
    if (!item.enabled() || !budget) continue
    if (left - leadMs >= budget) return true
  }
  return false
}

function openLater(later: Adapter[], round: number, skip: readonly string[]): Adapter[] {
  if (round < 1) return later
  return later.filter((item) => !skip.includes(item.id))
}

function followClaudeMs(signal: AbortSignal): number {
  const left = remainingMs(signal)
  if (!Number.isFinite(left)) return FOLLOW_CLAUDE_MS
  const room = slackRoom(left)
  if (claudeRest.get(signal) === true) return room
  return Math.min(FOLLOW_CLAUDE_MS, room)
}

function claudeBudgetMs(signal: AbortSignal, tierMs: number, round: number | undefined): number {
  if (round && round >= 1) return followClaudeMs(signal)
  if (claudeRest.get(signal) !== true) return tierMs
  const left = remainingMs(signal)
  if (!Number.isFinite(left)) return tierMs
  return slackRoom(left)
}

/** Round 0 uses the tier budget. A follow-up claude takes 30 s when a later tier fits after that cap, and the time left minus 1 s when none does. */
export function roundBudgetMs(signal: AbortSignal, tierMs: number, round: number | undefined, tierId = ''): number {
  if (tierId === 'claude') return claudeBudgetMs(signal, tierMs, round)
  if (!round || round < 1) return tierMs
  const left = remainingMs(signal)
  if (!Number.isFinite(left) || left >= tierMs) return tierMs
  return 0
}

/** Arms the claude remainder. Round 0 returns true when cursor's full budget cannot follow the 15 s cap. */
function armClaude(signal: AbortSignal, adapter: Adapter, later: Adapter[], round: number | undefined, skip: readonly string[]): boolean {
  if (adapter.id !== 'claude') return false
  const step = round ?? 0
  const left = remainingMs(signal)
  if (step >= 1) {
    claudeRest.set(signal, !laterFullFits(openLater(later, step, skip), left, FOLLOW_CLAUDE_MS))
    return false
  }
  const cursor = later.find((item) => item.id === 'cursor' && item.enabled())
  const cursorMs = cursor?.budgetMs ?? 0
  const lead = adapter.budgetMs ?? 0
  const rest = cursorMs > 0 && Number.isFinite(left) && left - lead < cursorMs
  claudeRest.set(signal, rest)
  return rest
}

/** The last enabled tier runs on the time left when that remainder is at least 40 s. */
function lastTierRuns(later: Adapter[], left: number): boolean {
  if (later.some((item) => item.enabled())) return false
  return left >= LAST_TIER_FLOOR_MS
}

function followRank(id: string): number {
  if (id === 'claude') return 0
  if (id === 'grok') return 1
  if (id === 'cursor') return 2
  return 3
}

function followOrder(adapters: Adapter[]): Adapter[] {
  return [...adapters].sort((a, b) => followRank(a.id) - followRank(b.id))
}

function orderFor(adapters: Adapter[], req: LlmRequest): Adapter[] {
  if ((req.round ?? 0) < 1) return claudeFirst(adapters, req)
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

function overBudget(adapter: Adapter, later: Adapter[], signal: AbortSignal, req: LlmRequest, skipCursor: boolean): boolean {
  const budget = adapter.budgetMs
  if (!budget) return false
  if ((req.round ?? 0) >= 1) return followOver(adapter, signal, req.round)
  const left = remainingMs(signal)
  if (skipCursor && adapter.id === 'cursor') {
    console.log(`york-api cli ${adapter.id} skipped reason=budget remaining=${left}`)
    return true
  }
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
  const order = orderFor(adapters, req)
  const timedOut = [...(req.timedOut ?? [])]
  let lastError = 'no provider'
  let skipCursor = false
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
    if (overBudget(adapter, later, signal, req, skipCursor)) continue
    if (armClaude(signal, adapter, later, req.round, timedOut)) skipCursor = true
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
