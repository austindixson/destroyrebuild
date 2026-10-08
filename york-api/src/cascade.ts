import type { LlmAnswer, LlmRequest } from './types.ts'

export interface Adapter {
  id: string
  model: string
  enabled(): boolean
  complete(req: LlmRequest, signal: AbortSignal): Promise<string>
}

export async function cascade(adapters: Adapter[], req: LlmRequest, signal: AbortSignal): Promise<LlmAnswer> {
  let lastError = 'no provider'
  for (const adapter of adapters) {
    if (signal.aborted) throw new Error('aborted')
    if (!adapter.enabled()) continue
    try {
      const text = (await adapter.complete(req, signal)).trim()
      if (!text) throw new Error('empty')
      return { text, provider: adapter.id, model: adapter.model }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'error'
    }
  }
  throw new Error(lastError)
}
