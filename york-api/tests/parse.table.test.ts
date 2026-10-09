import assert from 'node:assert/strict'
import { test } from 'node:test'
import { grokSmokeAnswerOk } from '../src/cliVersions.ts'
import { jsonRetryNeeded, parseModelPlan, usableModelText } from '../src/parse.ts'
import { replyText } from '../src/providers.ts'
import { planTurn } from '../src/turn.ts'

const BARE_TOOLS = '{"answer":"","cites":[],"tools":["plant.getAlarms","plant.getActionLog","not.a.tool"]}'
const HALL = '{"answer":"The hall is stable.","cites":["a"],"tools":[]}'
const HALL_BARE = '{"answer":"The hall is stable.","cites":[],"tools":[]}'

type ParseExpect = {
  name: string
  text: string
  valid: boolean
  retry: boolean
  usable: boolean
  answer?: string
  tools?: string[]
  kind?: 'answer' | 'tools'
}

const rows: ParseExpect[] = [
  {
    name: 'd20-tools-lead',
    text: `Here is my reply:\n${BARE_TOOLS}`,
    valid: true,
    retry: false,
    usable: true,
    tools: ['plant.getAlarms', 'plant.getActionLog'],
    kind: 'tools',
  },
  {
    name: 'd20-sure-answer',
    text: `Sure.\n${HALL}`,
    valid: true,
    retry: false,
    usable: true,
    answer: 'The hall is stable.',
    kind: 'answer',
  },
  {
    name: 'd20-lead-40',
    text: `${'x'.repeat(40)}${HALL_BARE}`,
    valid: true,
    retry: false,
    usable: true,
    answer: 'The hall is stable.',
    kind: 'answer',
  },
  {
    name: 'd20-lead-41',
    text: `${'x'.repeat(41)}${HALL_BARE}`,
    valid: false,
    retry: false,
    usable: true,
  },
  {
    name: 'd20-long-quote',
    text: 'The chilled-water valve stays open. The shape is {"answer":"close it","cites":[],"tools":["plant.getAlarms"]}.',
    valid: false,
    retry: false,
    usable: true,
  },
  {
    name: 'd20-broken',
    text: 'Sure.\n{"answer":"The hall is stable.",}',
    valid: false,
    retry: true,
    usable: false,
  },
  {
    name: 'd20-two-objects',
    text: 'Sure.\n{"answer":"One.","cites":[],"tools":[]}\n{"answer":"Two.","cites":[],"tools":[]}',
    valid: false,
    retry: true,
    usable: false,
  },
  {
    name: 'd22-unclosed',
    text: 'Sure.\n{"answer":"A.", "tools": [',
    valid: false,
    retry: true,
    usable: false,
  },
  {
    name: 'd22-inline-quote',
    text: 'It said {"answer":"x"}.',
    valid: false,
    retry: false,
    usable: true,
    answer: 'It said {"answer":"x"}.',
  },
  {
    name: 'd23-tools-trail',
    text: `${BARE_TOOLS}\nI will wait for the result.`,
    valid: true,
    retry: false,
    usable: true,
    tools: ['plant.getAlarms', 'plant.getActionLog'],
    kind: 'tools',
  },
  {
    name: 'd23-thanks',
    text: `Sure.\n${HALL}\nThanks.`,
    valid: true,
    retry: false,
    usable: true,
    answer: 'The hall is stable.',
    kind: 'answer',
  },
  {
    name: 'd23-trail-80',
    text: `${HALL_BARE}\n${'y'.repeat(80)}`,
    valid: true,
    retry: false,
    usable: true,
    answer: 'The hall is stable.',
    kind: 'answer',
  },
  {
    name: 'd23-trail-81',
    text: `${HALL_BARE}\n${'y'.repeat(81)}`,
    valid: false,
    retry: false,
    usable: true,
  },
  {
    name: 'd23-brace-prose',
    text: 'Use the { key. The "answer": is on screen.',
    valid: false,
    retry: false,
    usable: true,
    answer: 'Use the { key. The "answer": is on screen.',
  },
  {
    name: 'd17-fenced-tools',
    text: `\`\`\`json\n${BARE_TOOLS}\n\`\`\``,
    valid: true,
    retry: false,
    usable: true,
    tools: ['plant.getAlarms', 'plant.getActionLog'],
    kind: 'tools',
  },
]

function smokeStream(data: string): string {
  return [
    '{"type":"available_commands","tools":[],"commands":[]}',
    `{"type":"text","data":${JSON.stringify(data)}}`,
    '{"type":"end","stopReason":"end_turn","sessionId":"abc123","requestId":"xyz789"}',
  ].join('\n')
}

const smokeRows = [
  ['d19-five', '5', true],
  ['d19-five-period', '5.', true],
  ['d19-sentence', 'The answer is 5', false],
  ['d19-decimal', '5.0', false],
  ['d19-fifteen', '15', false],
] as const

test('parse table keeps every D17 to D25 example', () => {
  for (const row of rows) {
    const plan = parseModelPlan(row.text)
    assert.equal(plan.validJson, row.valid, row.name)
    assert.equal(jsonRetryNeeded(row.text), row.retry, row.name)
    assert.equal(usableModelText(row.text), row.usable, row.name)
    if (row.answer !== undefined) assert.equal(plan.answer, row.answer, row.name)
    if (row.tools) assert.deepEqual(plan.tools.map((tool) => tool.name), row.tools, row.name)
    if (row.kind) assert.equal(planTurn(row.text, false).kind, row.kind, row.name)
  }
  const lines = `${HALL_BARE}\n{"answer":"Supply is 42.5 psig.","cites":[],"tools":[]}`
  assert.equal(replyText(lines), lines, 'd17-raw-lines')
  for (const [name, data, ok] of smokeRows) {
    assert.equal(grokSmokeAnswerOk(smokeStream(data)), ok, name)
  }
})
