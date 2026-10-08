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
}

export type ChatResponse =
  | { status: 'answer'; answer: string; sources: ChatSource[]; provider: string; model: string; notice?: string }
  | { status: 'tools'; calls: ToolCall[]; round: number; notice?: string }
  | { status: 'confirm'; confirm: ToolCall; round: number; notice?: string }
  | { status: 'unavailable'; answer: string }
  | { status: 'error'; answer: string }

export interface LlmRequest {
  system: string
  user: string
}

export interface LlmAnswer {
  text: string
  provider: string
  model: string
}

export interface Chunk {
  id: string
  title: string
  text: string
  href: string
}
