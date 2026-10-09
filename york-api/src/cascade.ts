import { remainingMs } from './deadline.ts'
import { redactReason } from './leak.ts'
import type { LlmAnswer, LlmRequest } from './types.ts'

export interface Adapter {
  id: string
  model: string
  budgetMs?: number
  enabled(): boolean
  complete(req: LlmRequest, signal: AbortSignal): Promise<string>
}

function overBudget(adapter: Adapter, signal: AbortSignal): boolean {
  const budget = adapter.budgetMs
  if (!budget) return false
  const left = remainingMs(signal)
  if (left >= budget) return false
  console.log(`york-api cli ${adapter.id} skipped reason=budget remaining=${left}`)
  return true
}

export async function cascade(adapters: Adapter[], req: LlmRequest, signal: AbortSignal): Promise<LlmAnswer> {
  let lastError = 'no provider'
  for (const adapter of adapters) {
    if (signal.aborted) throw new Error('aborted')
    if (!adapter.enabled()) continue
    if (overBudget(adapter, signal)) continue
    try {
      const text = (await adapter.complete(req, signal)).trim()
      if (!text) throw new Error('empty')
      return { text, provider: adapter.id, model: adapter.model }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error'
      lastError = message
      console.log(`york-api cli ${adapter.id} failed reason=${redactReason(message)}`)
    }
  }
  throw new Error(lastError)
}
