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

function replyBody(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const inner = fenced?.[1]
  if (inner) return inner.trim()
  return text.trim()
}

function wholeObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
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

const LEAD_LIMIT = 40
const TRAIL_LIMIT = 80
const PLAN_KEY = /"(?:answer|tools)"\s*:/

type Brace = { start: number; end: number }

function closeString(ch: string, escape: boolean): { inString: boolean; escape: boolean } {
  if (escape) return { inString: true, escape: false }
  if (ch === '\\') return { inString: true, escape: true }
  if (ch === '"') return { inString: false, escape: false }
  return { inString: true, escape: false }
}

function braceObjects(text: string): Brace[] {
  const found: Brace[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escape = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? ''
    if (inString) {
      const next = closeString(ch, escape)
      inString = next.inString
      escape = next.escape
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') {
      if (depth === 0) start = i
      depth += 1
      continue
    }
    if (ch === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        found.push({ start, end: i + 1 })
        start = -1
      }
    }
  }
  return found
}

function leadText(text: string, span: Brace): string {
  return text.slice(0, span.start).trim()
}

/** A separated trail is commentary. Glued punctuation after `}` is an inline quote. */
function trailOk(text: string, span: Brace): boolean {
  const tail = text.slice(span.end)
  if (tail.length === 0) return true
  if (!/^\s/.test(tail)) return false
  return tail.trim().length <= TRAIL_LIMIT
}

function frameOk(text: string, span: Brace): boolean {
  return leadText(text, span).length <= LEAD_LIMIT && trailOk(text, span)
}

/** `{` starts a plan object only when the next non-space character is `"`. */
function opensPlan(text: string, start: number): boolean {
  return text.slice(start + 1).trimStart().startsWith('"')
}

function parsedObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function hasPlanKey(row: Record<string, unknown>): boolean {
  return 'answer' in row || 'tools' in row
}

function planSpans(text: string): Brace[] {
  return braceObjects(text).filter((span) => PLAN_KEY.test(text.slice(span.start, span.end)))
}

/** A `{"` that never closes, when the tail still names answer or tools. */
function unclosedPlan(text: string): Brace | null {
  let depth = 0
  let start = -1
  let inString = false
  let escape = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? ''
    if (inString) {
      const next = closeString(ch, escape)
      inString = next.inString
      escape = next.escape
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') {
      if (depth === 0) start = i
      depth += 1
      continue
    }
    if (ch === '}' && depth > 0) {
      depth -= 1
      if (depth === 0) start = -1
    }
  }
  if (depth === 0 || start < 0 || !opensPlan(text, start) || !PLAN_KEY.test(text.slice(start))) return null
  return { start, end: text.length }
}

/** One plan object with a short lead-in and a short separated trail. A glued quote stays prose. */
function ledPlan(text: string): Record<string, unknown> | null {
  const spans = planSpans(text)
  if (spans.length !== 1) return null
  const span = spans[0]
  if (!span || !frameOk(text, span)) return null
  const row = parsedObject(text.slice(span.start, span.end))
  if (!row || !hasPlanKey(row)) return null
  return row
}

/** A broken, unclosed, or repeated plan object inside the lead and trail limits needs another JSON reply. */
export function jsonRetryNeeded(text: string): boolean {
  const body = replyBody(text)
  if (wholeObject(body)) return false
  const open = unclosedPlan(body)
  const closed = planSpans(body)
  if (closed.length > 1) return true
  if (open && closed.length > 0) return true
  if (open) return leadText(body, open).length <= LEAD_LIMIT
  const span = closed[0]
  if (!span || !frameOk(body, span)) return false
  const row = parsedObject(body.slice(span.start, span.end))
  return !row || !hasPlanKey(row)
}

export function parseModelPlan(text: string): ModelPlan {
  const body = replyBody(text)
  const whole = wholeObject(body)
  if (whole) return planFromJson(whole)
  const led = ledPlan(body)
  if (led) return planFromJson(led)
  if (body.startsWith('{')) {
    const answer = quotedAnswer(body)
    if (answer) return prosePlan(answer)
  }
  return prosePlan(body)
}

export function usableModelText(text: string): boolean {
  if (jsonRetryNeeded(text)) return false
  const plan = parseModelPlan(text)
  if (plan.validJson) return true
  if (announcesToolUse(text)) return false
  return text.trim().length > 0
}
