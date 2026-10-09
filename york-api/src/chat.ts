import { continueTier, priorTimeouts, type CliTier } from './adapters.ts'
import { createBudget, type Budget } from './budget.ts'
import { budgetKey } from './ip.ts'
import type { Inflight } from './inflight.ts'
import { CLOCK_BLOCK, DAILY_NOTICE, NO_ANSWER, QUESTION_LIMIT, TOO_LONG, UNAVAILABLE } from './copy.ts'
import { containsSecretMaterial, publicSecrets, redactReason } from './leak.ts'
import { finishAnswer } from './finish.ts'
import { buildPrompt } from './prompt.ts'
import { MAX_TOOL_ROUND, planTurn } from './turn.ts'
import type { ChatRequest, ChatResponse, ChatSource, Chunk, HistoryItem, LlmAnswer, LlmRequest, ToolResultIn } from './types.ts'

export interface ChatDeps {
  ip: string
  now: () => number
  budget: Budget
  search: (query: string, blocksWrites?: boolean, quizOpen?: boolean) => Chunk[]
  complete: (req: LlmRequest, signal: AbortSignal) => Promise<LlmAnswer>
  signal: AbortSignal
  inflight?: Inflight
  /** Only-tier header. A follow-up tier that disagrees with this value is dropped. */
  only?: CliTier | null
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function readHistory(value: unknown): HistoryItem[] {
  if (!Array.isArray(value)) return []
  const rows: HistoryItem[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if ((row.role === 'user' || row.role === 'assistant') && typeof row.text === 'string') {
      rows.push({ role: row.role, text: row.text })
    }
  }
  return rows.slice(-6)
}

const ROW_KIND: Record<string, 'number' | 'string'> = {
  t: 'number',
  actor: 'string',
  action: 'string',
  text: 'string',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isScalar(value: unknown): value is string | number | boolean {
  const kind = typeof value
  return kind === 'string' || kind === 'number' || kind === 'boolean'
}

function scalarArgs(value: unknown): Record<string, string | number | boolean> | undefined {
  if (!isRecord(value)) return undefined
  const args: Record<string, string | number | boolean> = {}
  for (const [key, item] of Object.entries(value)) {
    if (isScalar(item)) args[key] = item
  }
  if (Object.keys(args).length === 0) return undefined
  return args
}

function copyRowFields(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, kind] of Object.entries(ROW_KIND)) {
    if (typeof value[key] === kind) out[key] = value[key]
  }
  return out
}

function compactRow(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null
  const out = copyRowFields(value)
  const args = scalarArgs(value.args)
  if (args) out.args = args
  if (Object.keys(out).length === 0) return null
  return out
}

function readToolRows(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined
  const rows: Record<string, unknown>[] = []
  for (const item of value.slice(0, 10)) {
    const row = compactRow(item)
    if (row) rows.push(row)
  }
  return rows.length > 0 ? rows : undefined
}

function readTools(value: unknown): ToolResultIn[] {
  if (!Array.isArray(value)) return []
  const rows: ToolResultIn[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (typeof row.name !== 'string' || typeof row.ok !== 'boolean' || typeof row.message !== 'string') continue
    const sent: ToolResultIn = { name: row.name, ok: row.ok, message: row.message }
    const detail = readToolRows(row.rows)
    if (detail) sent.rows = detail
    rows.push(sent)
  }
  return rows
}

export function readRequest(body: unknown): ChatRequest | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const row = body as Record<string, unknown>
  if (typeof row.question !== 'string') return null
  if (!row.snapshot || typeof row.snapshot !== 'object' || Array.isArray(row.snapshot)) return null
  const round = typeof row.round === 'number' && Number.isFinite(row.round) ? Math.max(0, Math.floor(row.round)) : 0
  return {
    question: row.question.trim(),
    previousQuestions: stringList(row.previousQuestions).slice(-6),
    history: readHistory(row.history),
    snapshot: row.snapshot as Record<string, unknown>,
    round,
    toolResults: readTools(row.toolResults),
    tier: continueTier(row.tier, null),
    timedOut: priorTimeouts(row.timedOut),
  }
}

function pinnedTier(only: ChatDeps['only']): CliTier | null {
  if (only) return only
  return null
}

function answerBody(answer: string, model: string, sources: ChatSource[], notice?: string): ChatResponse {
  return { status: 'answer', answer, sources, provider: 'local', model, notice }
}

async function answerFromModel(req: ChatRequest, chunks: Chunk[], deps: ChatDeps, llm: LlmAnswer, nearCap: boolean): Promise<ChatResponse> {
  const planned = planTurn(llm.text, req.snapshot.blocksWrites === true, req.toolResults, req.round)
  const notice = nearCap ? DAILY_NOTICE : undefined
  if (planned.kind === 'unusable') throw new Error('unusable')
  if (planned.kind === 'tools') {
    return { status: 'tools', calls: planned.calls, round: req.round + 1, notice, tier: llm.provider, timedOut: llm.timedOut ?? [] }
  }
  if (planned.kind === 'confirm') {
    return { status: 'confirm', confirm: planned.confirm, round: req.round + 1, notice, tier: llm.provider, timedOut: llm.timedOut ?? [] }
  }
  if (req.snapshot.blocksWrites === true && !planned.answer) {
    return answerBody(CLOCK_BLOCK, llm.model, [], notice)
  }
  const finished = await finishAnswer(planned.answer, planned.cites, chunks, req.snapshot, async (prompt) => {
    const next = await deps.complete(prompt, deps.signal)
    return next.text
  }, req.toolResults)
  return answerBody(finished.answer, llm.model, finished.sources, notice)
}

export async function handleChat(raw: unknown, deps: ChatDeps): Promise<{ http: number; body: ChatResponse }> {
  const req = readRequest(raw)
  if (!req || !req.question) return { http: 400, body: { status: 'error', answer: NO_ANSWER } }
  if (req.question.length > QUESTION_LIMIT) return { http: 400, body: { status: 'error', answer: TOO_LONG } }
  if (process.env.YORK_LOG_CLIENT === '1') console.log(`york-api chat key=${budgetKey(deps.ip)} round=${req.round}`)
  const slot = deps.budget.allow(deps.ip, req.round, deps.now())
  if (!slot.ok) return { http: 200, body: { status: 'unavailable', answer: UNAVAILABLE } }
  req.tier = continueTier(req.tier, pinnedTier(deps.only))
  if (req.round > MAX_TOOL_ROUND) return { http: 200, body: { status: 'error', answer: NO_ANSWER } }
  const chunks = deps.search(req.question, req.snapshot.blocksWrites === true, req.snapshot.quizOpen === true)
  const gate = holdInflight(deps.inflight)
  if (!gate.ok) return { http: 200, body: { status: 'unavailable', answer: UNAVAILABLE } }
  try {
    const llm = await deps.complete(buildPrompt(req, chunks), deps.signal)
    if (process.env.YORK_LOG_CLIENT === '1') console.log(`york-api chat tier=${llm.provider}`)
    const secrets = publicSecrets()
    if (containsSecretMaterial(llm.text, secrets)) {
      return { http: 200, body: { status: 'unavailable', answer: UNAVAILABLE } }
    }
    const body = await answerFromModel(req, chunks, deps, llm, slot.nearCap)
    if (containsSecretMaterial(JSON.stringify(body), secrets)) {
      return { http: 200, body: { status: 'unavailable', answer: UNAVAILABLE } }
    }
    return { http: 200, body }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'error'
    console.log(`york-api chat failed reason=${redactReason(message)}`)
    return { http: 200, body: { status: 'unavailable', answer: UNAVAILABLE } }
  } finally {
    gate.release()
  }
}

function holdInflight(inflight: Inflight | undefined): { ok: boolean; release(): void } {
  if (!inflight) return { ok: true, release() {} }
  if (!inflight.tryAcquire()) {
    console.log('york-api chat busy reason=inflight')
    return { ok: false, release() {} }
  }
  return { ok: true, release: () => inflight.release() }
}

export function defaultBudget(): Budget {
  const daily = Number(process.env.YORK_DAILY_MESSAGE_CAP ?? 200)
  const rate = Number(process.env.YORK_RATE_PER_MINUTE ?? 30)
  const globalCap = Number(process.env.YORK_GLOBAL_DAILY_CAP ?? 2000)
  return createBudget(
    Number.isFinite(daily) ? daily : 200,
    Number.isFinite(rate) ? rate : 30,
    Number.isFinite(globalCap) ? globalCap : 2000,
  )
}
