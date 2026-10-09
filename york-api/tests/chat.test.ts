import assert from 'node:assert/strict'
import { test } from 'node:test'
import index from '../data/trainer-index.json' with { type: 'json' }
import { cascade } from '../src/cascade.ts'
import { createBudget } from '../src/budget.ts'
import { handleChat, readRequest, type ChatDeps } from '../src/chat.ts'
import { parseModelPlan } from '../src/parse.ts'
import { buildPrompt } from '../src/prompt.ts'
import { MAX_TOOL_ROUND, planTurn } from '../src/turn.ts'
import { LIVE_LABEL, NO_ANSWER } from '../src/copy.ts'
import { searchChunks } from '../src/rag.ts'
import type { Chunk, LlmAnswer, LlmRequest } from '../src/types.ts'

const chunk: Chunk = {
  id: 'trainer:info:kpi-hall',
  title: 'Hall supply',
  href: '/york-chiller/#trainer:info:kpi-hall',
  text: 'Hall supply air is the air at the IT equipment after the CRAHs.',
}

function deps(complete: ChatDeps['complete'], budget = createBudget(20, 30, 1000)): ChatDeps {
  return {
    ip: 'test',
    now: () => 1_700_000_000_000,
    budget,
    search: () => [chunk],
    complete,
    signal: new AbortController().signal,
  }
}

function llm(text: string, provider = 'grok'): LlmAnswer {
  return { text, provider, model: provider === 'cursor' ? 'auto' : 'grok-4.7' }
}

test('a read batch returns every read tool and no confirm', async () => {
  const result = await handleChat(
    { question: 'Read the board', snapshot: { blocksWrites: false, plant: { hallSupplyF: 72 } }, round: 0 },
    deps(async () => llm(JSON.stringify({
      answer: '',
      cites: [],
      tools: [
        { name: 'plant.getSnapshot', args: {} },
        { name: 'plant.getAlarms', args: {} },
      ],
    }))),
  )
  assert.equal(result.http, 200)
  assert.equal(result.body.status, 'tools')
  if (result.body.status !== 'tools') return
  assert.deepEqual(result.body.calls.map((call) => call.name), ['plant.getSnapshot', 'plant.getAlarms'])
})

test('a stop is a confirm and not a direct write', async () => {
  const result = await handleChat(
    { question: 'Stop CH-01', snapshot: { blocksWrites: false }, round: 0 },
    deps(async () => llm(JSON.stringify({
      answer: '',
      cites: [],
      tools: [{ name: 'chiller.stop', args: { unit: 'CH-01', mode: 'soft' } }],
    }))),
  )
  assert.equal(result.body.status, 'confirm')
  if (result.body.status !== 'confirm') return
  assert.equal(result.body.confirm.name, 'chiller.stop')
  assert.equal(result.body.confirm.args.unit, 'CH-01')
})

test('the incident clock blocks a plant change', async () => {
  const result = await handleChat(
    { question: 'Stop CH-01', snapshot: { blocksWrites: true }, round: 0 },
    deps(async () => llm(JSON.stringify({
      answer: '',
      cites: [],
      tools: [{ name: 'chiller.stop', args: { unit: 'CH-01', mode: 'soft' } }],
    }))),
  )
  assert.equal(result.body.status, 'answer')
  if (result.body.status !== 'answer') return
  assert.match(result.body.answer, /incident clock/)
})

test('an answer uses the snapshot number and a trainer source', async () => {
  const result = await handleChat(
    {
      question: 'Why is the hall warm?',
      snapshot: { blocksWrites: false, plant: { hallSupplyF: 72 } },
      round: 0,
    },
    deps(async () => llm(JSON.stringify({
      answer: 'The hall supply is 72°F. [trainer:info:kpi-hall] This is a trainer-model value.',
      cites: ['trainer:info:kpi-hall', 'trainer:missing'],
      tools: [],
    }))),
  )
  assert.equal(result.body.status, 'answer')
  if (result.body.status !== 'answer') return
  assert.match(result.body.answer, /72°F/)
  assert.match(result.body.answer, /trainer-model/)
  assert.equal(result.body.answer.includes('trainer:missing'), false)
  assert.deepEqual(result.body.sources.map((source) => source.id), ['trainer:info:kpi-hall'])
})

test('provider errors become the unavailable state', async () => {
  const result = await handleChat(
    { question: 'Why is the hall warm?', snapshot: { plant: { hallSupplyF: 72 } }, round: 0 },
    deps(async () => {
      throw new Error('all providers failed')
    }),
  )
  assert.equal(result.body.status, 'unavailable')
  if (result.body.status !== 'unavailable') return
  assert.match(result.body.answer, /not available now/)
})

test('the daily cap returns the same unavailable state', async () => {
  const budget = createBudget(1, 30, 1000)
  const complete = async (_req: LlmRequest): Promise<LlmAnswer> => llm('{"answer":"The board is stable.","cites":[],"tools":[]}')
  const first = await handleChat({ question: 'One', snapshot: {}, round: 0 }, deps(complete, budget))
  const second = await handleChat({ question: 'Two', snapshot: {}, round: 0 }, deps(complete, budget))
  assert.equal(first.body.status, 'answer')
  assert.equal(second.body.status, 'unavailable')
})

test('a recorded claude FLA reply stays an answer when one sentence fails STE', async () => {
  const chunks = searchChunks(index as Chunk[], 'What does % FLA mean on a YORK YMC2 chiller?')
  const recorded = [
    '% FLA means percent of full load amps.',
    'On this YORK YMC2, the gauge marked % FLA shows the motor current of CH-01 as a trainer-model value.',
    'OptiView also shows input current as % FLA.',
    'The value is shown on the motor screen.',
  ].join(' ')
  const fenced = `\`\`\`json\n${JSON.stringify({
    answer: recorded,
    cites: ['glossary:fla', 'info:gauge-rla'],
    tools: [],
  })}\n\`\`\``
  let calls = 0
  const result = await handleChat(
    { question: 'What does % FLA mean on a YORK YMC2 chiller?', snapshot: { view: 'optiview', unit: 'CH-01', model: 'YMC2' }, round: 0 },
    {
      ...deps(async () => {
        calls += 1
        if (calls > 1) throw new Error('rewrite')
        return { text: fenced, provider: 'claude', model: 'claude-haiku-5-5' }
      }),
      search: () => chunks,
    },
  )
  assert.equal(calls, 1)
  assert.equal(result.body.status, 'answer')
  if (result.body.status !== 'answer') return
  assert.notEqual(result.body.answer, NO_ANSWER)
  assert.match(result.body.answer, /percent of full load amps/)
  assert.match(result.body.answer, /CH-01/)
  assert.equal(result.body.answer.includes('is shown'), false)
  const loose = '{"answer":"% FLA means percent of full load amps. On this YMC², OptiView shows motor current and input current as % FLA. In this trainer the gauge marked % FLA is the motor current of CH-01.", "cites":[glossary:fla, info:gauge-rla], "tools":[plant.getSnapshot]}'
  const plain = await handleChat(
    { question: 'What does % FLA mean on a YORK YMC2 chiller?', snapshot: { view: 'optiview', unit: 'CH-01', model: 'YMC2' }, round: 0 },
    {
      ...deps(async () => ({ text: loose, provider: 'claude', model: 'claude-haiku-5-5' })),
      search: () => chunks,
    },
  )
  assert.equal(plain.body.status, 'answer')
  if (plain.body.status !== 'answer') return
  assert.match(plain.body.answer, /percent of full load amps/)
  assert.equal(plain.body.answer.includes('{"answer"'), false)
})

const LONG_ACTION =
  '2 actions are in the action log after the operator set the CHW valve and the weather, and the trainer recorded each change with the actor and the time. Live numbers are trainer-model values.'

test('a long claude action sentence is rewritten instead of the trainer-model label alone', async () => {
  let calls = 0
  const result = await handleChat(
    {
      question: 'How many actions are in the action log?',
      snapshot: { plant: { itLoadMw: 4.2 } },
      round: 1,
      toolResults: [{
        name: 'plant.getActionLog',
        ok: true,
        message: '2 rows.',
        rows: [
          { t: 1, actor: 'user', action: 'setValve', args: { loop: 'chw', pct: 40 } },
          { t: 2, actor: 'ai', action: 'setWeather', args: { preset: 'hot' } },
        ],
      }],
    },
    deps(async (prompt) => {
      calls += 1
      if (prompt.system.startsWith('Rewrite')) return llm('The action log has 2 actions.')
      return llm(JSON.stringify({ answer: LONG_ACTION, cites: [], tools: [] }))
    }),
  )
  assert.equal(result.body.status, 'answer')
  if (result.body.status !== 'answer') return
  assert.match(result.body.answer, /2 actions/)
  assert.equal(result.body.answer.includes('operator set the CHW valve'), false)
  assert.notEqual(result.body.answer.trim(), LIVE_LABEL)
  assert.ok(calls >= 2)
})

test('cascade fallthrough still answers', async () => {
  const result = await handleChat(
    { question: 'Read the hall', snapshot: { plant: { hallSupplyF: 70 } }, round: 0 },
    deps((prompt, signal) => cascade([
      { id: 'grok', model: 'grok-4.7', enabled: () => true, complete: async () => { throw new Error('grok timeout') } },
      { id: 'claude', model: 'claude-haiku-5-5', enabled: () => true, complete: async () => '' },
      { id: 'cursor', model: 'auto', enabled: () => true, complete: async () => 'The hall supply is 70°F. This is a trainer-model value.' },
    ], prompt, signal)),
  )
  assert.equal(result.body.status, 'answer')
  if (result.body.status !== 'answer') return
  assert.equal(result.body.provider, 'local')
  assert.equal(result.body.model, 'auto')
  assert.match(result.body.answer, /70°F/)
})

const BARE_TOOLS = '{"answer":"","cites":[],"tools":["plant.getAlarms","plant.getActionLog","not.a.tool"]}'

test('the example shows one tool object and says to leave tools empty', () => {
  const prompt = buildPrompt(
    { question: 'q', previousQuestions: [], history: [], snapshot: {}, round: 0, toolResults: [] },
    [],
  )
  assert.match(prompt.system, /"name":"plant\.getAlarms","args":\{\}/)
  assert.match(prompt.system, /Set answer to an empty string when tools is not empty/)
  assert.match(prompt.system, /Leave tools empty when the snapshot or the tool results already answer/)
  assert.match(prompt.system, /Include it only when that read is still missing/)
  assert.match(prompt.system, /State only a value that the snapshot, the tool results, or the passages show/)
  assert.match(prompt.system, /Passage symptoms are examples, not live readings/)
  assert.match(prompt.system, /State a live value only from the snapshot or the tool results/)
  assert.match(prompt.user, /trainer:glossary:n-plus-1/)
  assert.match(prompt.user, /one chiller capacity in MW is at least the IT load/)
  assert.equal(prompt.system.includes('"tools":[]'), false)
  const follow = buildPrompt(
    {
      question: 'How many actions are in the action log?',
      previousQuestions: [],
      history: [],
      snapshot: { plant: { itLoadMw: 4.2, hallSupplyF: 70, chwValvePct: 40 } },
      round: 1,
      toolResults: [{
        name: 'plant.getActionLog',
        ok: true,
        message: '1 rows.',
        rows: [{ t: 12, actor: 'user', action: 'setValve', args: { loop: 'chw', pct: 40 } }],
      }],
    },
    [{ id: 'trainer:glossary:n-plus-1', title: 'N+1', href: '/york-chiller/#trainer:glossary:n-plus-1', text: 'long passage' }],
  )
  assert.equal(follow.round, 1)
  assert.match(follow.user, /Snapshot delta:/)
  assert.match(follow.user, /"action":"setValve"/)
  assert.equal(follow.user.includes('Passages:'), false)
  assert.equal(follow.user.includes('long passage'), false)
})

test('trouble symptoms are labeled examples in the index', () => {
  const trouble = (index as Chunk[]).find((chunk) => chunk.id === 'trainer:trouble:hall-hot-chiller-idle')
  if (!trouble) throw new Error('missing trouble passage')
  assert.match(trouble.text, /^Typical symptoms: /)
  assert.match(trouble.text, /Hot-aisle alarms are active\./)
  assert.match(trouble.text, /Some CRAH valves are fully open\./)
})

test('action log rows reach the server and a tool snapshot does not', () => {
  const req = readRequest({
    question: 'How many actions are in the action log?',
    snapshot: { view: 'home' },
    round: 1,
    toolResults: [{
      name: 'plant.getActionLog',
      ok: true,
      message: '1 rows.',
      rows: [{ t: 12, actor: 'user', action: 'setValve', args: { loop: 'chw', pct: 40 }, snapshot: { secret: true } }],
      snapshot: { secret: true },
    }],
  })
  assert.ok(req)
  if (!req) return
  assert.deepEqual(req.toolResults[0]?.rows, [{ t: 12, actor: 'user', action: 'setValve', args: { loop: 'chw', pct: 40 } }])
  assert.equal(JSON.stringify(req.toolResults).includes('secret'), false)
})

test('bare string tool names become tool calls and unknown names are dropped', async () => {
  const plan = parseModelPlan(BARE_TOOLS)
  assert.equal(plan.validJson, true)
  assert.deepEqual(plan.tools, [
    { name: 'plant.getAlarms', args: {} },
    { name: 'plant.getActionLog', args: {} },
  ])
  const fenced = `\`\`\`json\n${BARE_TOOLS}\n\`\`\``
  assert.equal(parseModelPlan(fenced).validJson, true)
  assert.deepEqual(parseModelPlan(fenced).tools.map((tool) => tool.name), ['plant.getAlarms', 'plant.getActionLog'])
  const result = await handleChat(
    { question: 'Read the alarms', snapshot: { blocksWrites: false }, round: 0 },
    deps(async () => llm(BARE_TOOLS)),
  )
  assert.equal(result.body.status, 'tools')
  if (result.body.status !== 'tools') return
  assert.deepEqual(result.body.calls.map((call) => call.name), ['plant.getAlarms', 'plant.getActionLog'])
})

test('prose that announces a tool is not an answer', async () => {
  const prose = 'I will read the alarms and the action log.'
  assert.equal(planTurn(prose, false).kind, 'unusable')
  const toolsOnly = '```json\n{"answer":"","tools":["plant.getAlarms","plant.getActionLog"]}\n```'
  const planned = planTurn(toolsOnly, false)
  assert.equal(planned.kind, 'tools')
  if (planned.kind !== 'tools') return
  assert.deepEqual(planned.calls.map((call) => call.name), ['plant.getAlarms', 'plant.getActionLog'])
  const result = await handleChat(
    { question: 'Read the alarms', snapshot: { blocksWrites: false }, round: 0 },
    deps(async () => llm(prose)),
  )
  assert.equal(result.body.status, 'unavailable')
})

const GROK_LOG = '{"answer":"I need to read the action log before I can count the actions.","cites":[],"tools":["plant.getActionLog"]}'
const CLAUDE_LOG = '{"answer":"You need to read it to answer how many actions are in the action log.","tools":[{"name":"plant.getActionLog","args":{}}]}'

test('an interim answer with tools returns the tool round', async () => {
  for (const text of [GROK_LOG, CLAUDE_LOG]) {
    const planned = planTurn(text, false)
    assert.equal(planned.kind, 'tools')
    if (planned.kind !== 'tools') return
    assert.deepEqual(planned.calls, [{ name: 'plant.getActionLog', args: {} }])
  }
  const capped = planTurn(GROK_LOG, false, [], MAX_TOOL_ROUND)
  assert.equal(capped.kind, 'answer')
  if (capped.kind !== 'answer') return
  assert.match(capped.answer, /need to read the action log/)
  const result = await handleChat(
    { question: 'How many actions are in the action log?', snapshot: { blocksWrites: false }, round: 0 },
    deps(async () => llm(GROK_LOG)),
  )
  assert.equal(result.body.status, 'tools')
  if (result.body.status !== 'tools') return
  assert.deepEqual(result.body.calls, [{ name: 'plant.getActionLog', args: {} }])
})

test('a follow-up answer keeps a number that the tool result shows', async () => {
  const result = await handleChat(
    {
      question: 'What does the action log show?',
      snapshot: { plant: { hallSupplyF: 70 } },
      round: 1,
      toolResults: [{ name: 'plant.getActionLog', ok: true, message: 't=12 user setValve loop=chw pct=41' }],
    },
    deps(async () => llm('The log shows one valve move at 41 percent.')),
  )
  assert.equal(result.body.status, 'answer')
  if (result.body.status !== 'answer') return
  assert.match(result.body.answer, /41/)
})

test('a read that already has a result is not requested again', async () => {
  const result = await handleChat(
    {
      question: 'Read the board',
      snapshot: { blocksWrites: false },
      round: 1,
      toolResults: [{ name: 'plant.getSnapshot', ok: true, message: 'Snapshot.' }],
    },
    deps(async () => llm(JSON.stringify({
      answer: '',
      cites: [],
      tools: [
        { name: 'plant.getSnapshot', args: {} },
        { name: 'plant.getAlarms', args: {} },
      ],
    }))),
  )
  assert.equal(result.body.status, 'tools')
  if (result.body.status !== 'tools') return
  assert.deepEqual(result.body.calls.map((call) => call.name), ['plant.getAlarms'])
})
