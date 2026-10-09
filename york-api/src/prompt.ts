import { gateFor, TOOL_GATES } from './gates.ts'
import type { ChatRequest, Chunk } from './types.ts'

const SYSTEM = [
  'You are the coach for the York YMC2 trainer.',
  'Answer only from the screen snapshot and the trainer passages.',
  'Call every live number a trainer-model value.',
  'Use % FLA. Do not use %RLA or %TSLA.',
  'Use short active sentences. Do not use contractions.',
  'Do not invent a manual, a form number, or a page number.',
  'Reply with one JSON object and no other text.',
  'Shape: {"answer":"","cites":["trainer:id"],"tools":[]}',
  'Leave tools empty when the snapshot or the tool results already answer.',
  'Put trainer ids from the passages in cites.',
  'Read tools may share one reply. A stop, a fault, or a reset must be the only tool.',
  'Do not request a plant change while blocksWrites is true.',
].join(' ')

function toolLines(): string {
  return Object.keys(TOOL_GATES)
    .map((name) => `${name} ${gateFor(name)}`)
    .join('\n')
}

function passage(chunk: Chunk): string {
  return `[${chunk.id}] ${chunk.title}: ${chunk.text.slice(0, 700)}`
}

export function buildPrompt(req: ChatRequest, chunks: Chunk[]): { system: string; user: string } {
  const history = req.history
    .slice(-6)
    .map((item) => `${item.role}: ${item.text.slice(0, 400)}`)
    .join('\n')
  const results = req.toolResults
    .slice(0, 8)
    .map((row) => `${row.name} ${row.ok ? 'ok' : 'fail'}: ${row.message.slice(0, 400)}`)
    .join('\n')
  const user = [
    `Question: ${req.question}`,
    `Earlier questions: ${req.previousQuestions.slice(-6).join(' | ')}`,
    history ? `History:\n${history}` : '',
    `Snapshot:\n${JSON.stringify(req.snapshot).slice(0, 12000)}`,
    `Passages:\n${chunks.map(passage).join('\n')}`,
    `Tools:\n${toolLines()}`,
    results ? `Tool results:\n${results}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  return { system: SYSTEM, user }
}
