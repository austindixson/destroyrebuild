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

function cursorBudget(later: Adapter[]): number {
  for (const item of later) {
    if (item.id === 'cursor' && item.budgetMs) return item.budgetMs
  }
  return 0
}

function leavesCursorShort(adapter: Adapter, later: Adapter[], left: number): boolean {
  const budget = adapter.budgetMs
  const rescue = cursorBudget(later)
  if (!budget || !rescue || adapter.id === 'cursor') return false
  if (left < rescue) return false
  return left < budget + rescue
}

function overBudget(adapter: Adapter, later: Adapter[], signal: AbortSignal, round: number | undefined): boolean {
  if ((round ?? 0) >= 1) return false
  const budget = adapter.budgetMs
  if (!budget) return false
  const left = remainingMs(signal)
  if (left >= budget && !leavesCursorShort(adapter, later, left)) return false
  console.log(`york-api cli ${adapter.id} skipped reason=budget remaining=${left}`)
  return true
}

function canReask(adapter: Adapter, signal: AbortSignal): boolean {
  const budget = adapter.budgetMs
  if (!budget) return false
  return remainingMs(signal) >= budget
}

function jsonRetry(req: LlmRequest): LlmRequest {
  return {
    system: req.system,
    user: `${req.user}\n\nThe last reply was prose. Reply with one JSON object and no other text.`,
    round: req.round,
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
  let lastError = 'no provider'
  for (let index = 0; index < adapters.length; index += 1) {
    const adapter = adapters[index]
    if (!adapter) continue
    if (signal.aborted) throw new Error('aborted')
    if (!adapter.enabled()) continue
    if (overBudget(adapter, adapters.slice(index + 1), signal, req.round)) continue
    const hold = claim(adapter)
    if (!hold) continue
    try {
      const text = await takeReply(adapter, req, signal)
      return { text, provider: adapter.id, model: adapter.model }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error'
      lastError = message
      console.log(`york-api cli ${adapter.id} failed reason=${redactReason(message)}`)
    } finally {
      if (hold === 'held') releaseHold(adapter.id)
    }
  }
  throw new Error(lastError)
}
