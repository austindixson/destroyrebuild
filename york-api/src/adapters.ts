import { tmpdir } from 'node:os'
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

function withTimeout(parent: AbortSignal, ms: number): AbortSignal {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  parent.addEventListener('abort', () => controller.abort(), { once: true })
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
  return controller.signal
}

export function buildAdapters(env: NodeJS.ProcessEnv, fetchImpl: FetchLike, run: ProcessRunner): Adapter[] {
  return [
    {
      id: 'grok',
      model: env.XAI_MODEL || GROK_MODEL,
      enabled: () => Boolean(env.XAI_API_KEY),
      complete: (req, signal) => completeGrok(req, withTimeout(signal, 20_000), fetchImpl, env),
    },
    {
      id: 'claude',
      model: CLAUDE_MODEL,
      enabled: () => Boolean(env.CLAUDE_CODE_OAUTH_TOKEN),
      complete: (req, signal) => completeClaude(req, withTimeout(signal, 25_000), run, env),
    },
    {
      id: 'cursor',
      model: CURSOR_MODEL,
      enabled: () => Boolean(env.CURSOR_API_KEY),
      complete: (req, signal) => completeCursor(req, withTimeout(signal, 35_000), run, env, tmpdir()),
    },
  ]
}

export async function completeWithCascade(req: LlmRequest, signal: AbortSignal, env: NodeJS.ProcessEnv = process.env): Promise<LlmAnswer> {
  return cascade(buildAdapters(env, fetch, nodeRunner), req, signal)
}
