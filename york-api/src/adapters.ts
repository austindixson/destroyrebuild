import { cascade, type Adapter } from './cascade.ts'
import {
  CLAUDE_MODEL,
  CODEX_MODEL,
  completeClaude,
  completeCodex,
  completeCursor,
  completeGrok,
  CURSOR_MODEL,
  GROK_MODEL,
  nodeRunner,
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

function cliOn(env: NodeJS.ProcessEnv, flag: string): boolean {
  return env[flag] !== 'unavailable'
}

export function buildAdapters(env: NodeJS.ProcessEnv, run: ProcessRunner): Adapter[] {
  return [
    {
      id: 'grok',
      model: GROK_MODEL,
      enabled: () => cliOn(env, 'YORK_GROK_CLI'),
      complete: (req, signal) => within(signal, 20_000, (limited) => completeGrok(req, limited, run, env)),
    },
    {
      id: 'claude',
      model: CLAUDE_MODEL,
      enabled: () => cliOn(env, 'YORK_CLAUDE_CLI'),
      complete: (req, signal) => within(signal, 25_000, (limited) => completeClaude(req, limited, run, env)),
    },
    {
      id: 'cursor',
      model: CURSOR_MODEL,
      enabled: () => cliOn(env, 'YORK_CURSOR_CLI'),
      complete: (req, signal) => within(signal, 35_000, (limited) => completeCursor(req, limited, run, env)),
    },
    {
      id: 'codex',
      model: CODEX_MODEL,
      enabled: () => env.YORK_CODEX === '1' && cliOn(env, 'YORK_CODEX_CLI'),
      complete: (req, signal) => within(signal, 35_000, (limited) => completeCodex(req, limited, run, env)),
    },
  ]
}

export async function completeWithCascade(req: LlmRequest, signal: AbortSignal, env: NodeJS.ProcessEnv = process.env): Promise<LlmAnswer> {
  return cascade(buildAdapters(env, nodeRunner), req, signal)
}
