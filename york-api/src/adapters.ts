import { cascade, type Adapter } from './cascade.ts'
import {
  CLAUDE_MODEL,
  completeClaude,
  completeCursor,
  completeGrok,
  CURSOR_MODEL,
  GROK_MODEL,
  nodeRunner,
  type FetchLike,
  type ProcessRunner,
} from './providers.ts'
import type { LlmAnswer, LlmRequest } from './types.ts'

function within<T>(parent: AbortSignal, ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  const onParent = () => controller.abort()
  const done = () => {
    clearTimeout(timer)
    parent.removeEventListener('abort', onParent)
  }
  controller.signal.addEventListener('abort', done, { once: true })
  if (parent.aborted) controller.abort()
  else parent.addEventListener('abort', onParent, { once: true })
  return run(controller.signal).finally(done)
}

export function buildAdapters(env: NodeJS.ProcessEnv, fetchImpl: FetchLike, run: ProcessRunner): Adapter[] {
  return [
    {
      id: 'grok',
      model: env.XAI_MODEL || GROK_MODEL,
      enabled: () => Boolean(env.XAI_API_KEY),
      complete: (req, signal) => within(signal, 20_000, (limited) => completeGrok(req, limited, fetchImpl, env)),
    },
    {
      id: 'claude',
      model: CLAUDE_MODEL,
      enabled: () => Boolean(env.CLAUDE_CODE_OAUTH_TOKEN),
      complete: (req, signal) => within(signal, 25_000, (limited) => completeClaude(req, limited, run, env)),
    },
    {
      id: 'cursor',
      model: CURSOR_MODEL,
      enabled: () => Boolean(env.CURSOR_API_KEY),
      complete: (req, signal) => within(signal, 35_000, (limited) => completeCursor(req, limited, run, env)),
    },
  ]
}

export async function completeWithCascade(req: LlmRequest, signal: AbortSignal, env: NodeJS.ProcessEnv = process.env): Promise<LlmAnswer> {
  return cascade(buildAdapters(env, fetch, nodeRunner), req, signal)
}
