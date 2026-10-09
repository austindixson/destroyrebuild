export interface ChatSource {
  id: string
  title: string
  href: string
}

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

export interface HistoryItem {
  role: 'user' | 'assistant'
  text: string
}

export interface ChatRequest {
  question: string
  previousQuestions: string[]
  history: HistoryItem[]
  snapshot: Record<string, unknown>
  round: number
  toolResults: ToolResultIn[]
  /** Tier that answered the previous round. Round 0 ignores it. */
  tier?: string
  /** Tiers that timed out earlier in this question. */
  timedOut?: string[]
}

export type ChatResponse =
  | { status: 'answer'; answer: string; sources: ChatSource[]; provider: string; model: string; notice?: string }
  | { status: 'tools'; calls: ToolCall[]; round: number; notice?: string; tier?: string; timedOut?: string[] }
  | { status: 'confirm'; confirm: ToolCall; round: number; notice?: string; tier?: string; timedOut?: string[] }
  | { status: 'unavailable'; answer: string }
  | { status: 'error'; answer: string }

export interface LlmRequest {
  system: string
  user: string
  round?: number
  /** An open trouble case. The cascade calls claude before grok. */
  openCase?: boolean
  /** Follow-up start tier. The cascade still falls through to the other tiers. */
  tier?: string
  timedOut?: string[]
  /** Time the next follow-up tier needs. Round 0 ignores it. */
  reserveMs?: number
}

export interface LlmAnswer {
  text: string
  provider: string
  model: string
  timedOut?: string[]
}

export interface Chunk {
  id: string
  title: string
  text: string
  href: string
}
