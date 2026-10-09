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
  codexArgs,
  codexLaunchArgsOk,
  grokArgs,
  grokLaunchArgsOk,
  nodeRunner,
  timeoutReason,
  type ProcessRunner,
} from './providers.ts'
import type { LlmAnswer, LlmRequest } from './types.ts'

export const GROK_BUDGET_MS = 60_000
export const CLAUDE_BUDGET_MS = 20_000
export const CURSOR_BUDGET_MS = 50_000
export const CODEX_BUDGET_MS = 10_000

/** Codex off is 60/20/50, under the 135 s server deadline. Codex on is 55/15/50/10. */
export function tierBudgetMs(env: NodeJS.ProcessEnv): { grok: number; claude: number; cursor: number; codex: number } {
  if (env.YORK_CODEX === '1') {
    return { grok: 55_000, claude: 15_000, cursor: CURSOR_BUDGET_MS, codex: CODEX_BUDGET_MS }
  }
  return { grok: GROK_BUDGET_MS, claude: CLAUDE_BUDGET_MS, cursor: CURSOR_BUDGET_MS, codex: CODEX_BUDGET_MS }
}

export type CliTier = 'grok' | 'claude' | 'cursor' | 'codex'

function within<T>(parent: AbortSignal, ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(timeoutReason(ms)), ms)
  const onParent = () => controller.abort(parent.reason)
  const done = () => {
    clearTimeout(timer)
    parent.removeEventListener('abort', onParent)
  }
  controller.signal.addEventListener('abort', done, { once: true })
  if (parent.aborted) controller.abort(parent.reason)
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
      enabled: () => selected('grok') && cliOn(env, 'YORK_GROK_CLI') && grokLaunchArgsOk(grokArgs('probe')),
      complete: (req, signal) => within(signal, budget.grok, (limited) => completeGrok(req, limited, run, env)),
    },
    {
      id: 'claude',
      model: CLAUDE_MODEL,
      enabled: () => selected('claude') && cliOn(env, 'YORK_CLAUDE_CLI'),
      complete: (req, signal) => within(signal, budget.claude, (limited) => completeClaude(req, limited, run, env)),
    },
    {
      id: 'cursor',
      model: CURSOR_MODEL,
      enabled: () => selected('cursor') && cliOn(env, 'YORK_CURSOR_CLI'),
      complete: (req, signal) => within(signal, budget.cursor, (limited) => completeCursor(req, limited, run, env)),
    },
    {
      id: 'codex',
      model: CODEX_MODEL,
      enabled: () => selected('codex') && env.YORK_CODEX === '1' && cliOn(env, 'YORK_CODEX_CLI') && codexLaunchArgsOk(codexArgs()),
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
