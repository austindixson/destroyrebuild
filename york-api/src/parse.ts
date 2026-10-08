import type { ToolCall } from './types.ts'

export interface ModelPlan {
  answer: string
  cites: string[]
  tools: ToolCall[]
}

function isTool(value: unknown): value is ToolCall {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.name === 'string' && !!row.args && typeof row.args === 'object' && !Array.isArray(row.args)
}

export function parseModelPlan(text: string): ModelPlan {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return { answer: text.trim(), cites: [], tools: [] }
  try {
    const json = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
    const cites = Array.isArray(json.cites) ? json.cites.filter((item) => typeof item === 'string') : []
    const tools = Array.isArray(json.tools) ? json.tools.filter(isTool) : []
    const answer = typeof json.answer === 'string' ? json.answer : ''
    return { answer, cites, tools }
  } catch {
    return { answer: text.trim(), cites: [], tools: [] }
  }
}
