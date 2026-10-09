import { gateFor } from './gates.ts'
import type { ToolCall } from './types.ts'

export interface ModelPlan {
  answer: string
  cites: string[]
  tools: ToolCall[]
  validJson: boolean
}

function isTool(value: unknown): value is ToolCall {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.name === 'string' && !!row.args && typeof row.args === 'object' && !Array.isArray(row.args)
}

function knownTool(value: unknown): ToolCall | null {
  if (typeof value === 'string') {
    if (!gateFor(value)) return null
    return { name: value, args: {} }
  }
  if (!isTool(value) || !gateFor(value.name)) return null
  return value
}

function toolsFrom(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) return []
  const tools: ToolCall[] = []
  for (const item of value) {
    const tool = knownTool(item)
    if (tool) tools.push(tool)
  }
  return tools
}

/** Prose that names a read is not an answer. Valid JSON is handled separately. */
export function announcesToolUse(text: string): boolean {
  return /\bi will (?:read|call|check)\b/i.test(text)
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
  const answer = typeof json.answer === 'string' ? json.answer : ''
  return { answer, cites, tools: toolsFrom(json.tools), validJson: true }
}

function prosePlan(answer: string): ModelPlan {
  return { answer, cites: [], tools: [], validJson: false }
}

export function parseModelPlan(text: string): ModelPlan {
  const body = unfence(text).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return prosePlan(body)
  try {
    return planFromJson(JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>)
  } catch {
    const answer = quotedAnswer(body)
    if (answer) return prosePlan(answer)
    return prosePlan(body)
  }
}

export function usableModelText(text: string): boolean {
  const plan = parseModelPlan(text)
  if (plan.validJson) return true
  if (announcesToolUse(text)) return false
  return text.trim().length > 0
}
