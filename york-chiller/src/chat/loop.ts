import { CHAT_ABORT, CHAT_CANCELLED, CHAT_CANNOT, CHAT_CLOCK, CHAT_QUESTION_CANCELLED, CHAT_ROUND_CAP, CHAT_SLOW, CHAT_UNAVAILABLE } from './copy'
import { confirmCopy, type ConfirmCard } from './confirmCopy'
import type { ScreenSnapshot } from './snapshot'
import { yorkToolCatalog } from '../sim/tools'

export interface ToolCall {
  name: string
  args: Record<string, unknown>
}

export interface ToolResultIn {
  name: string
  ok: boolean
  message: string
  rows?: Record<string, unknown>[]
}

export interface ChatSource {
  id: string
  title: string
  href: string
}

export interface HistoryItem {
  role: 'user' | 'assistant'
  text: string
}

export type ChatResponse =
  | { status: 'answer'; answer: string; sources: ChatSource[]; provider?: string; model?: string; notice?: string }
  | { status: 'tools'; calls: ToolCall[]; round: number; tier?: string; timedOut?: string[] }
  | { status: 'confirm'; confirm: ToolCall; round: number; tier?: string; timedOut?: string[] }
  | { status: 'unavailable'; answer: string }
  | { status: 'error'; answer: string }

export interface ToolHost {
  callTool: (name: string, args: Record<string, unknown>) => { ok: boolean; message: string; rows?: Record<string, unknown>[] }
}

export interface AskInput {
  question: string
  previousQuestions: string[]
  history: HistoryItem[]
  snapshot: ScreenSnapshot
  signal: AbortSignal
  host: ToolHost
  onConfirm: (card: ConfirmCard) => Promise<boolean>
  onUndoOffer: () => void
  onStatus: (text: string) => void
  post?: (body: unknown, signal: AbortSignal) => Promise<ChatResponse>
}

const MAX_ROUNDS = 6
const SLOW_MS = 12_000
export const ABORT_MS = 145_000
const WRITE_CAP = 3

function gateOf(name: string): 'R' | 'W' | 'C' | null {
  const tool = yorkToolCatalog().find((item) => item.name === name)
  return tool?.gate ?? null
}

function runOne(call: ToolCall, host: ToolHost): ToolResultIn {
  const result = host.callTool(call.name, call.args)
  const sent: ToolResultIn = { name: call.name, ok: result.ok, message: result.message }
  if (Array.isArray(result.rows) && result.rows.length > 0) sent.rows = result.rows
  return sent
}

async function applyCalls(calls: ToolCall[], host: ToolHost, onConfirm: AskInput['onConfirm'], onUndoOffer: () => void): Promise<ToolResultIn[]> {
  const reads = calls.filter((call) => gateOf(call.name) === 'R')
  const writes = calls.filter((call) => gateOf(call.name) === 'W').slice(0, WRITE_CAP)
  const confirm = calls.find((call) => gateOf(call.name) === 'C')
  const readResults = await Promise.all(reads.map((call) => Promise.resolve(runOne(call, host))))
  const writeResults = writes.map((call) => runOne(call, host))
  if (writeResults.some((result) => result.ok)) onUndoOffer()
  if (!confirm) return [...readResults, ...writeResults]
  const card = confirmCopy(confirm.name, confirm.args)
  if (!card) {
    return [...readResults, ...writeResults, { name: confirm.name, ok: false, message: CHAT_CANNOT }]
  }
  const yes = await onConfirm(card)
  if (!yes) {
    return [...readResults, ...writeResults, { name: confirm.name, ok: false, message: CHAT_CANCELLED }]
  }
  return [...readResults, ...writeResults, runOne(confirm, host)]
}

async function postChat(body: unknown, signal: AbortSignal): Promise<ChatResponse> {
  const res = await fetch('/api/york/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  const data = (await res.json()) as ChatResponse
  if (data && typeof data === 'object' && 'status' in data) return data
  return { status: 'unavailable', answer: CHAT_UNAVAILABLE }
}

function echoedRun(response: ChatResponse): Record<string, unknown> {
  if (response.status !== 'tools' && response.status !== 'confirm') return {}
  const out: Record<string, unknown> = {}
  if (typeof response.tier === 'string') out.tier = response.tier
  if (Array.isArray(response.timedOut)) out.timedOut = response.timedOut
  return out
}

function answerFrom(response: ChatResponse): { answer: string; sources: ChatSource[] } | null {
  if (response.status === 'answer') return { answer: response.answer, sources: response.sources ?? [] }
  if (response.status === 'unavailable' || response.status === 'error') {
    return { answer: response.answer || CHAT_UNAVAILABLE, sources: [] }
  }
  return null
}

async function oneRound(
  body: Record<string, unknown>,
  input: AskInput,
  signal: AbortSignal,
): Promise<{ done: { answer: string; sources: ChatSource[] } | null; body: Record<string, unknown> }> {
  const post = input.post ?? postChat
  const response = await post(body, signal)
  const done = answerFrom(response)
  if (done) return { done, body }
  if (input.snapshot.blocksWrites && (response.status === 'confirm' || response.status === 'tools')) {
    return { done: { answer: CHAT_CLOCK, sources: [] }, body }
  }
  if (response.status === 'confirm') {
    const card = confirmCopy(response.confirm.name, response.confirm.args)
    if (!card) return { done: { answer: CHAT_CANNOT, sources: [] }, body }
    const yes = await input.onConfirm(card)
    if (!yes) return { done: { answer: CHAT_CANCELLED, sources: [] }, body }
    const result = runOne(response.confirm, input.host)
    return { done: null, body: { ...body, round: response.round, toolResults: [result], ...echoedRun(response) } }
  }
  if (response.status === 'tools') {
    const toolResults = await applyCalls(response.calls, input.host, input.onConfirm, input.onUndoOffer)
    return { done: null, body: { ...body, round: response.round, toolResults, ...echoedRun(response) } }
  }
  return { done: { answer: CHAT_UNAVAILABLE, sources: [] }, body }
}

export async function askTrainer(input: AskInput): Promise<{ answer: string; sources: ChatSource[] }> {
  const kill = new AbortController()
  const onParentAbort = () => kill.abort()
  input.signal.addEventListener('abort', onParentAbort)
  const slowTimer = setTimeout(() => input.onStatus(CHAT_SLOW), SLOW_MS)
  const abortTimer = setTimeout(() => kill.abort(), ABORT_MS)
  let body: Record<string, unknown> = {
    question: input.question,
    previousQuestions: input.previousQuestions,
    history: input.history.slice(-6),
    snapshot: input.snapshot,
    round: 0,
    writesUsed: 0,
    sessionId: crypto.randomUUID(),
  }
  try {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      if (kill.signal.aborted) return { answer: CHAT_ABORT, sources: [] }
      const step = await oneRound(body, input, kill.signal)
      if (step.done) return step.done
      body = step.body
    }
    return { answer: CHAT_ROUND_CAP, sources: [] }
  } catch {
    if (kill.signal.aborted && !input.signal.aborted) return { answer: CHAT_ABORT, sources: [] }
    if (input.signal.aborted) return { answer: CHAT_QUESTION_CANCELLED, sources: [] }
    return { answer: CHAT_UNAVAILABLE, sources: [] }
  } finally {
    clearTimeout(slowTimer)
    clearTimeout(abortTimer)
    input.signal.removeEventListener('abort', onParentAbort)
  }
}
