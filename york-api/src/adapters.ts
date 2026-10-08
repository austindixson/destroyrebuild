import { cascade, type Adapter } from './cascade.ts'
import { sandboxReady } from './sandbox.ts'
import {
  CLAUDE_MODEL,
  CODEX_MODEL,
  completeClaude,
  completeCodex,
  completeCursor,
  completeGrok,
  CURSOR_MODEL,
  GROK_MODEL,
  codexArgs,
  codexLaunchArgsOk,
  grokArgs,
  grokLaunchArgsOk,
  nodeRunner,
  type ProcessRunner,
} from './providers.ts'
import type { LlmAnswer, LlmRequest } from './types.ts'

export const GROK_BUDGET_MS = 45_000
export const CLAUDE_BUDGET_MS = 25_000
export const CURSOR_BUDGET_MS = 30_000
export const CODEX_BUDGET_MS = 25_000

/** Codex off keeps 45/25/30. Codex on shares the 110 s deadline as 30/25/25/25. */
export function tierBudgetMs(env: NodeJS.ProcessEnv): { grok: number; claude: number; cursor: number; codex: number } {
  if (env.YORK_CODEX === '1') {
    return { grok: 30_000, claude: CLAUDE_BUDGET_MS, cursor: 25_000, codex: CODEX_BUDGET_MS }
  }
  return { grok: GROK_BUDGET_MS, claude: CLAUDE_BUDGET_MS, cursor: CURSOR_BUDGET_MS, codex: CODEX_BUDGET_MS }
}

export type CliTier = 'grok' | 'claude' | 'cursor' | 'codex'

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

export function buildAdapters(env: NodeJS.ProcessEnv, run: ProcessRunner, only?: CliTier | null): Adapter[] {
  const selected = (id: CliTier) => !only || only === id
  const budget = tierBudgetMs(env)
  return [
    {
      id: 'grok',
      model: GROK_MODEL,
      enabled: () => selected('grok') && sandboxReady(env) && cliOn(env, 'YORK_GROK_CLI') && grokLaunchArgsOk(grokArgs('probe')),
      complete: (req, signal) => within(signal, budget.grok, (limited) => completeGrok(req, limited, run, env)),
    },
    {
      id: 'claude',
      model: CLAUDE_MODEL,
      enabled: () => selected('claude') && sandboxReady(env) && cliOn(env, 'YORK_CLAUDE_CLI'),
      complete: (req, signal) => within(signal, budget.claude, (limited) => completeClaude(req, limited, run, env)),
    },
    {
      id: 'cursor',
      model: CURSOR_MODEL,
      enabled: () => selected('cursor') && sandboxReady(env) && cliOn(env, 'YORK_CURSOR_CLI'),
      complete: (req, signal) => within(signal, budget.cursor, (limited) => completeCursor(req, limited, run, env)),
    },
    {
      id: 'codex',
      model: CODEX_MODEL,
      enabled: () => selected('codex') && sandboxReady(env) && env.YORK_CODEX === '1' && cliOn(env, 'YORK_CODEX_CLI') && codexLaunchArgsOk(codexArgs()),
      complete: (req, signal) => within(signal, budget.codex, (limited) => completeCodex(req, limited, run, env)),
    },
  ]
}

export async function completeWithCascade(
  req: LlmRequest,
  signal: AbortSignal,
  env: NodeJS.ProcessEnv = process.env,
  only?: CliTier | null,
): Promise<LlmAnswer> {
  return cascade(buildAdapters(env, nodeRunner, only), req, signal)
}
