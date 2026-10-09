import { gateFor, TOOL_GATES } from './gates.ts'
import type { ChatRequest, Chunk } from './types.ts'

const SYSTEM = [
  'You are the coach for the York YMC2 trainer.',
  'State only a value that the snapshot, the tool results, or the passages show.',
  'Passage symptoms are examples, not live readings. State a live value only from the snapshot or the tool results.',
  'Do not add a plant fact that those sources omit.',
  'Call every live number a trainer-model value.',
  'Use % FLA. Do not use %RLA or %TSLA.',
  'Use short active sentences. Do not use contractions.',
  'Do not invent a manual, a form number, or a page number.',
  'Reply with one JSON object and no other text.',
  'Shape: {"answer":"","cites":["trainer:id"],"tools":[{"name":"plant.getAlarms","args":{}}]}',
  'Set answer to an empty string when tools is not empty.',
  'Leave tools empty when the snapshot or the tool results already answer.',
  'The sample tool object shows the shape. Include it only when that read is still missing.',
  'Put trainer ids from the passages in cites.',
  'Read tools may share one reply. A stop, a fault, or a reset must be the only tool.',
  'Do not request a plant change while blocksWrites is true.',
].join(' ')

const OPEN_CASE = 'Do not give the trouble answer while this case is open.'

function toolLines(): string {
  return Object.keys(TOOL_GATES)
    .map((name) => `${name} ${gateFor(name)}`)
    .join('\n')
}

const N_PLUS_ONE_LINE = [
  '[trainer:glossary:n-plus-1] N+1: N+1 means one extra unit of capacity beyond the load.',
  'Count every available chiller: running units plus standby units that can start.',
  'Subtract the largest unit.',
  'N+1 holds when that remainder still covers itLoadMw.',
  'A fleet of 18 units at 5 MW with an 80 MW IT load meets N+1, because 17 times 5 MW is 85 MW and 85 MW covers 80 MW.',
].join(' ')

const DELTA_KEYS = [
  't',
  'itLoadMw',
  'runningCapacityMw',
  'unmetMw',
  'hallSupplyF',
  'lchltAct',
  'oatF',
  'alarm',
  'chwValvePct',
  'cwValvePct',
  'glycolValvePct',
] as const

function passage(chunk: Chunk): string {
  return `[${chunk.id}] ${chunk.title}: ${chunk.text.slice(0, 700)}`
}

function unitDelta(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) return null
  return value.slice(0, 8).map((item) => {
    if (!item || typeof item !== 'object') return item
    const row = item as Record<string, unknown>
    return { id: row.id, running: row.running, capacityMw: row.capacityMw, mode: row.mode }
  })
}

function plantFields(plant: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const key of DELTA_KEYS) {
    if (key in plant) picked[key] = plant[key]
  }
  const units = unitDelta(plant.units)
  if (units) picked.units = units
  return picked
}

function plantDelta(snapshot: Record<string, unknown>): string {
  const out: Record<string, unknown> = { blocksWrites: snapshot.blocksWrites === true }
  if (snapshot.incident) out.incident = snapshot.incident
  if (typeof snapshot.chaosLabel === 'string') out.chaosLabel = snapshot.chaosLabel
  const plant = snapshot.plant
  if (plant && typeof plant === 'object' && !Array.isArray(plant)) out.plant = plantFields(plant as Record<string, unknown>)
  return JSON.stringify(out)
}

function toolResultLines(req: ChatRequest, limit: number): string {
  return req.toolResults
    .slice(0, 8)
    .map((row) => {
      const head = `${row.name} ${row.ok ? 'ok' : 'fail'}: ${row.message.slice(0, limit)}`
      if (!row.rows || row.rows.length === 0) return head
      return `${head}\n${JSON.stringify(row.rows).slice(0, limit)}`
    })
    .join('\n')
}

function followUpUser(req: ChatRequest): string {
  const results = toolResultLines(req, 1600)
  return [`Question: ${req.question}`, `Snapshot delta:\n${plantDelta(req.snapshot)}`, `Tool results:\n${results}`].join('\n\n')
}

function firstUser(req: ChatRequest, chunks: Chunk[]): string {
  const history = req.history
    .slice(-6)
    .map((item) => `${item.role}: ${item.text.slice(0, 400)}`)
    .join('\n')
  const results = toolResultLines(req, 400)
  const passages = [N_PLUS_ONE_LINE, ...chunks.filter((chunk) => chunk.id !== 'trainer:glossary:n-plus-1').map(passage)]
  return [
    `Question: ${req.question}`,
    `Earlier questions: ${req.previousQuestions.slice(-6).join(' | ')}`,
    history ? `History:\n${history}` : '',
    `Snapshot:\n${JSON.stringify(req.snapshot).slice(0, 12000)}`,
    `Passages:\n${passages.join('\n')}`,
    `Tools:\n${toolLines()}`,
    results ? `Tool results:\n${results}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function buildPrompt(req: ChatRequest, chunks: Chunk[]): { system: string; user: string; round: number } {
  const open = req.snapshot.blocksWrites === true ? ` ${OPEN_CASE}` : ''
  const user = req.round >= 1 ? followUpUser(req) : firstUser(req, chunks)
  return { system: `${SYSTEM}${open}`, user, round: req.round }
}
