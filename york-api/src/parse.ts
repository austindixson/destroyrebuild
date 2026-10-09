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

function unfence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return fenced?.[1] ?? text
}

function quotedAnswer(text: string): string {
  const match = text.match(/"answer"\s*:\s*"((?:\\.|[^"\\])*)"/)
  if (!match?.[1]) return ''
  try {
    return JSON.parse(`"${match[1]}"`) as string
  } catch {
    return match[1]
  }
}

function planFromJson(json: Record<string, unknown>): ModelPlan {
  const cites = Array.isArray(json.cites) ? json.cites.filter((item) => typeof item === 'string') : []
  const tools = Array.isArray(json.tools) ? json.tools.filter(isTool) : []
  const answer = typeof json.answer === 'string' ? json.answer : ''
  return { answer, cites, tools }
}

export function parseModelPlan(text: string): ModelPlan {
  const body = unfence(text).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return { answer: body, cites: [], tools: [] }
  try {
    return planFromJson(JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>)
  } catch {
    const answer = quotedAnswer(body)
    if (answer) return { answer, cites: [], tools: [] }
    return { answer: body, cites: [], tools: [] }
  }
}
