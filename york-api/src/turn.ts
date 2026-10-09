import { gateFor } from './gates.ts'
import { announcesToolUse, parseModelPlan } from './parse.ts'
import { validateToolArgs } from './toolSchema.ts'
import type { ToolCall, ToolResultIn } from './types.ts'

const WRITE_CAP = 3
export const MAX_TOOL_ROUND = 6

export type Planned =
  | { kind: 'answer'; answer: string; cites: string[] }
  | { kind: 'tools'; calls: ToolCall[] }
  | { kind: 'confirm'; confirm: ToolCall }
  | { kind: 'unusable' }

function collectCalls(tools: ToolCall[], blocksWrites: boolean): ToolCall[] {
  const calls: ToolCall[] = []
  for (const tool of tools) {
    const gate = gateFor(tool.name)
    if (!gate) continue
    if (blocksWrites && gate !== 'R') continue
    const args = validateToolArgs(tool.name, tool.args)
    if (!args) continue
    calls.push({ name: tool.name, args })
  }
  return calls
}

function dropAnsweredReads(calls: ToolCall[], toolResults: ToolResultIn[]): ToolCall[] {
  const answered = new Set(toolResults.map((row) => row.name))
  return calls.filter((call) => gateFor(call.name) !== 'R' || !answered.has(call.name))
}

function toolPlan(calls: ToolCall[]): Planned | null {
  const reads = calls.filter((call) => gateFor(call.name) === 'R')
  const writes = calls.filter((call) => gateFor(call.name) === 'W').slice(0, WRITE_CAP)
  const confirm = calls.find((call) => gateFor(call.name) === 'C')
  if (reads.length > 0 || writes.length > 0) return { kind: 'tools', calls: [...reads, ...writes] }
  if (confirm) return { kind: 'confirm', confirm }
  return null
}

export function planTurn(text: string, blocksWrites: boolean, toolResults: ToolResultIn[] = [], round = 0): Planned {
  const plan = parseModelPlan(text)
  const calls = dropAnsweredReads(collectCalls(plan.tools, blocksWrites), toolResults)
  const tools = toolPlan(calls)
  if (tools && round < MAX_TOOL_ROUND) return tools
  if (plan.validJson && plan.answer.trim()) return { kind: 'answer', answer: plan.answer, cites: plan.cites }
  if (!plan.validJson && announcesToolUse(text)) return { kind: 'unusable' }
  return { kind: 'answer', answer: plan.answer, cites: plan.cites }
}
