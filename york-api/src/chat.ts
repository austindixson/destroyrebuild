import { createBudget, type Budget } from './budget.ts'
import { CLOCK_BLOCK, DAILY_NOTICE, NO_ANSWER, QUESTION_LIMIT, TOO_LONG, UNAVAILABLE } from './copy.ts'
import { finishAnswer } from './finish.ts'
import { buildPrompt } from './prompt.ts'
import { planTurn } from './turn.ts'
import type { ChatRequest, ChatResponse, ChatSource, Chunk, HistoryItem, LlmAnswer, LlmRequest, ToolResultIn } from './types.ts'

export interface ChatDeps {
  ip: string
  now: () => number
  budget: Budget
  search: (query: string) => Chunk[]
  complete: (req: LlmRequest, signal: AbortSignal) => Promise<LlmAnswer>
  signal: AbortSignal
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

function readTools(value: unknown): ToolResultIn[] {
  if (!Array.isArray(value)) return []
  const rows: ToolResultIn[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (typeof row.name !== 'string' || typeof row.ok !== 'boolean' || typeof row.message !== 'string') continue
    rows.push({ name: row.name, ok: row.ok, message: row.message })
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
  }
}

function answerBody(answer: string, provider: string, model: string, sources: ChatSource[], notice?: string): ChatResponse {
  return { status: 'answer', answer, sources, provider, model, notice }
}

async function answerFromModel(req: ChatRequest, chunks: Chunk[], deps: ChatDeps, llm: LlmAnswer, nearCap: boolean): Promise<ChatResponse> {
  const planned = planTurn(llm.text, req.snapshot.blocksWrites === true)
  if (planned.kind === 'tools') return { status: 'tools', calls: planned.calls, round: req.round + 1 }
  if (planned.kind === 'confirm') return { status: 'confirm', confirm: planned.confirm, round: req.round + 1 }
  if (req.snapshot.blocksWrites === true && !planned.answer) {
    return answerBody(CLOCK_BLOCK, llm.provider, llm.model, [])
  }
  const finished = await finishAnswer(planned.answer, planned.cites, chunks, req.snapshot, async (prompt) => {
    const next = await deps.complete(prompt, deps.signal)
    return next.text
  })
  return answerBody(finished.answer, llm.provider, llm.model, finished.sources, nearCap ? DAILY_NOTICE : undefined)
}

export async function handleChat(raw: unknown, deps: ChatDeps): Promise<{ http: number; body: ChatResponse }> {
  const req = readRequest(raw)
  if (!req || !req.question) return { http: 400, body: { status: 'error', answer: NO_ANSWER } }
  if (req.question.length > QUESTION_LIMIT) return { http: 400, body: { status: 'error', answer: TOO_LONG } }
  const slot = deps.budget.allow(deps.ip, req.round, deps.now())
  if (!slot.ok) return { http: 200, body: { status: 'unavailable', answer: UNAVAILABLE } }
  if (req.round > 6) return { http: 200, body: { status: 'error', answer: NO_ANSWER } }
  const chunks = deps.search(req.question)
  try {
    const llm = await deps.complete(buildPrompt(req, chunks), deps.signal)
    const body = await answerFromModel(req, chunks, deps, llm, slot.nearCap)
    return { http: 200, body }
  } catch {
    return { http: 200, body: { status: 'unavailable', answer: UNAVAILABLE } }
  }
}

export function defaultBudget(): Budget {
  const daily = Number(process.env.YORK_DAILY_MESSAGE_CAP ?? 200)
  const rate = Number(process.env.YORK_RATE_PER_MINUTE ?? 30)
  return createBudget(Number.isFinite(daily) ? daily : 200, Number.isFinite(rate) ? rate : 30)
}
