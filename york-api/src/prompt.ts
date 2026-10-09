import { gateFor, TOOL_GATES } from './gates.ts'
import type { ChatRequest, Chunk, LlmRequest } from './types.ts'

const SYSTEM = [
  'You are the coach for the York YMC2 trainer.',
  'State only a value that the snapshot, the tool results, or the passages show.',
  'Passage symptoms are examples, not live readings. State a live value only from the snapshot or the tool results.',
  'Do not add a plant fact that those sources omit.',
  'Call every live number a trainer-model value.',
  'Name a live value in plain words, such as "IT load 4.2 MW". Do not write a raw field name such as itLoadMw.',
  'Use % FLA for chiller motor current only. A valve uses % open. A fan uses % speed. Do not use %RLA or %TSLA.',
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

export const OPEN_DECLINE = 'I cannot give the answer while the case is open. Check the readings on screen, then make your pick.'

const OPEN_CASE = `If asked for the answer or the root cause, reply with only this text: "${OPEN_DECLINE}"`

function toolLines(): string {
  return Object.keys(TOOL_GATES)
    .map((name) => `${name} ${gateFor(name)}`)
    .join('\n')
}

const FOLLOW_VOICE = 'Use active voice. Do not put is, are, was, were, or been before a past participle. Keep each sentence to 25 words. Keep a command to 20 words. Use % FLA for chiller motor current only. A valve uses % open. A fan uses % speed.'

export const N_PLUS_ONE_LINE = [
  '[trainer:glossary:n-plus-1] N+1: N+1 means one extra unit of capacity beyond the load.',
  'Count every available chiller: running units plus standby units that can start.',
  'Subtract the largest unit.',
  'N+1 holds when that remainder still covers itLoadMw.',
  'State the verdict as "N+1 holds." or "N+1 does not hold."',
  'A fleet of 18 units at 5 MW with an 80 MW IT load meets N+1.',
  '17 times 5 MW is 85 MW.',
  '85 MW covers 80 MW.',
].join(' ')

function passage(chunk: Chunk): string {
  return `[${chunk.id}] ${chunk.title}: ${chunk.text.slice(0, 700)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function recordList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  const out: Record<string, unknown>[] = []
  for (const item of value) {
    if (isRecord(item)) out.push(item)
  }
  return out
}

const PLANT_TEXT = new Set(['reason', 'ch01', 'ch02', 'units', 'alarm', 'weather'])

function numericReadings(plant: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(plant)) {
    if (PLANT_TEXT.has(key)) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    out[key] = value
  }
  return out
}

function chillerRow(unit: Record<string, unknown>, plant: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (typeof unit.id === 'string') row.id = unit.id
  if (typeof unit.mode === 'string') row.mode = unit.mode
  if (typeof unit.rla === 'number') {
    row.rla = unit.rla
    row.fla = `${unit.rla}%`
  }
  if (typeof unit.condPsig === 'number') row.condPsig = unit.condPsig
  if (typeof plant.lchltAct === 'number') row.lchltAct = plant.lchltAct
  if (typeof plant.lchltSet === 'number') row.lchltSet = plant.lchltSet
  return row
}

function chillerRows(snapshot: Record<string, unknown>, plant: Record<string, unknown>): Record<string, unknown>[] {
  const listed = recordList(snapshot.units)
  const units = listed.length > 0 ? listed : recordList(plant.units)
  return units.map((unit) => chillerRow(unit, plant))
}

/** Follow-up readings: chiller rows, numeric plant values, and the active alarm. */
function readingsSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  const plant = isRecord(snapshot.plant) ? snapshot.plant : {}
  const readings: Record<string, unknown> = { units: chillerRows(snapshot, plant), ...numericReadings(plant) }
  if (typeof snapshot.blocksWrites === 'boolean') readings.blocksWrites = snapshot.blocksWrites
  if (typeof snapshot.incident === 'string' || snapshot.incident === null) readings.incident = snapshot.incident
  if (typeof plant.alarm === 'string' && plant.alarm.length > 0) readings.alarm = plant.alarm
  return readings
}

function snapshotJson(snapshot: Record<string, unknown>): string {
  return JSON.stringify(snapshot).slice(0, 12000)
}

function readingsJson(snapshot: Record<string, unknown>): string {
  return JSON.stringify(readingsSnapshot(snapshot)).slice(0, 12000)
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
  return [FOLLOW_VOICE, `Question: ${req.question}`, `Snapshot:\n${readingsJson(req.snapshot)}`, `Tool results:\n${results}`].join('\n\n')
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
    `Snapshot:\n${snapshotJson(req.snapshot)}`,
    `Passages:\n${passages.join('\n')}`,
    `Tools:\n${toolLines()}`,
    results ? `Tool results:\n${results}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function buildPrompt(req: ChatRequest, chunks: Chunk[]): LlmRequest {
  const openCase = req.snapshot.blocksWrites === true
  const open = openCase ? ` ${OPEN_CASE}` : ''
  const voice = req.round >= 1 ? ` ${FOLLOW_VOICE}` : ''
  const user = req.round >= 1 ? followUpUser(req) : firstUser(req, chunks)
  return {
    system: `${SYSTEM}${open}${voice}`,
    user,
    round: req.round,
    openCase,
    tier: req.tier,
    timedOut: req.timedOut,
  }
}
