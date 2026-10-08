import { gateFor } from './gates.ts'
import { parseModelPlan } from './parse.ts'
import type { ToolCall } from './types.ts'

const WRITE_CAP = 3

export type Planned =
  | { kind: 'answer'; answer: string; cites: string[] }
  | { kind: 'tools'; calls: ToolCall[] }
  | { kind: 'confirm'; confirm: ToolCall }

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toolArgs(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

export function planTurn(text: string, blocksWrites: boolean): Planned {
  const plan = parseModelPlan(text)
  const calls: ToolCall[] = []
  for (const tool of plan.tools) {
    const gate = gateFor(tool.name)
    if (!gate) continue
    if (blocksWrites && gate !== 'R') continue
    calls.push({ name: tool.name, args: toolArgs(tool.args) })
  }
  const reads = calls.filter((call) => gateFor(call.name) === 'R')
  const writes = calls.filter((call) => gateFor(call.name) === 'W').slice(0, WRITE_CAP)
  const confirm = calls.find((call) => gateFor(call.name) === 'C')
  if (reads.length > 0 || writes.length > 0) return { kind: 'tools', calls: [...reads, ...writes] }
  if (confirm) return { kind: 'confirm', confirm }
  return { kind: 'answer', answer: plan.answer, cites: plan.cites }
}
