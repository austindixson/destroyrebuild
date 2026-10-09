import { cascade, roundBudgetMs, type Adapter } from './cascade.ts'
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

export const GROK_BUDGET_MS = 70_000
export const CLAUDE_BUDGET_MS = 15_000
export const CURSOR_BUDGET_MS = 50_000
export const CODEX_BUDGET_MS = 10_000

export { roundBudgetMs }

const CLI_TIERS = ['grok', 'claude', 'cursor', 'codex'] as const

export function readTier(value: string): CliTier | null {
  for (const tier of CLI_TIERS) {
    if (tier === value) return tier
  }
  return null
}

/** A follow-up may start at a known tier. It cannot select a tier the only-tier header forbids. */
export function continueTier(value: unknown, only: CliTier | null): CliTier | undefined {
  if (typeof value !== 'string') return undefined
  const tier = readTier(value)
  if (!tier) return undefined
  if (only && tier !== only) return undefined
  return tier
}

export function priorTimeouts(value: unknown): CliTier[] {
  if (!Array.isArray(value)) return []
  const out: CliTier[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const tier = readTier(item)
    if (!tier || out.includes(tier)) continue
    out.push(tier)
  }
  return out
}

/** Codex off is 70/15/50. Codex on takes 10 s from grok: 60/15/50/10. Both fit in 135 s. */
export function tierBudgetMs(env: NodeJS.ProcessEnv): { grok: number; claude: number; cursor: number; codex: number } {
  if (env.YORK_CODEX === '1') {
    return { grok: 60_000, claude: CLAUDE_BUDGET_MS, cursor: CURSOR_BUDGET_MS, codex: CODEX_BUDGET_MS }
  }
  return { grok: GROK_BUDGET_MS, claude: CLAUDE_BUDGET_MS, cursor: CURSOR_BUDGET_MS, codex: CODEX_BUDGET_MS }
}

export type CliTier = 'grok' | 'claude' | 'cursor' | 'codex'

function tierConcurrency(env: NodeJS.ProcessEnv, id: CliTier): number {
  const raw = env[`YORK_${id.toUpperCase()}_CONCURRENCY`]
  if (typeof raw === 'string' && /^[1-9]\d*$/.test(raw)) return Number(raw)
  switch (id) {
    case 'grok':
      return 2
    case 'claude':
      return 3
    case 'cursor':
      return 1
    case 'codex':
      return 1
    default: {
      const neverId: never = id
      return neverId
    }
  }
}

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
      budgetMs: budget.grok,
      limit: tierConcurrency(env, 'grok'),
      enabled: () => selected('grok') && cliOn(env, 'YORK_GROK_CLI') && grokLaunchArgsOk(grokArgs('probe')),
      complete: (req, signal) => within(signal, roundBudgetMs(signal, budget.grok, req.round, req.reserveMs), (limited) => completeGrok(req, limited, run, env)),
    },
    {
      id: 'claude',
      model: CLAUDE_MODEL,
      budgetMs: budget.claude,
      limit: tierConcurrency(env, 'claude'),
      enabled: () => selected('claude') && cliOn(env, 'YORK_CLAUDE_CLI'),
      complete: (req, signal) => within(signal, roundBudgetMs(signal, budget.claude, req.round, req.reserveMs), (limited) => completeClaude(req, limited, run, env)),
    },
    {
      id: 'cursor',
      model: CURSOR_MODEL,
      budgetMs: budget.cursor,
      limit: tierConcurrency(env, 'cursor'),
      enabled: () => selected('cursor') && cliOn(env, 'YORK_CURSOR_CLI'),
      complete: (req, signal) => within(signal, roundBudgetMs(signal, budget.cursor, req.round, req.reserveMs), (limited) => completeCursor(req, limited, run, env)),
    },
    {
      id: 'codex',
      model: CODEX_MODEL,
      budgetMs: budget.codex,
      limit: tierConcurrency(env, 'codex'),
      enabled: () => selected('codex') && env.YORK_CODEX === '1' && cliOn(env, 'YORK_CODEX_CLI') && codexLaunchArgsOk(codexArgs()),
      complete: (req, signal) => within(signal, roundBudgetMs(signal, budget.codex, req.round, req.reserveMs), (limited) => completeCodex(req, limited, run, env)),
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
