import assert from 'node:assert/strict'
import { test } from 'node:test'
import index from '../data/trainer-index.json' with { type: 'json' }
import { cascade } from '../src/cascade.ts'
import { createBudget } from '../src/budget.ts'
import { handleChat, readRequest, type ChatDeps } from '../src/chat.ts'
import { jsonRetryNeeded, parseModelPlan, usableModelText } from '../src/parse.ts'
import { buildPrompt, jsonWithin, N_PLUS_ONE_LINE } from '../src/prompt.ts'
import { MAX_TOOL_ROUND, planTurn } from '../src/turn.ts'
import { LIVE_LABEL, NO_ANSWER } from '../src/copy.ts'
import { finishAnswer, loggableRaw, polishAnswer } from '../src/finish.ts'
import { dropMisusedFla, dropUnmatchedQuotes, dropUntracedNumbers, labelLiveNumbers } from '../src/guard.ts'
import { steHits } from '../src/steRuntime.ts'
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
  assert.equal(result.body.tier, 'grok')
  assert.deepEqual(result.body.timedOut, [])
})

test('a follow-up starts at the tier that answered and drops an unknown timeout', async () => {
  let seen: LlmRequest | undefined
  const first = await handleChat(
    { question: 'Read the alarms', snapshot: { plant: { hallSupplyF: 72 } }, round: 0 },
    deps(async () => ({
      ...llm(JSON.stringify({ answer: '', cites: [], tools: [{ name: 'plant.getAlarms', args: {} }] }), 'claude'),
      timedOut: ['grok'],
    })),
  )
  assert.equal(first.body.status, 'tools')
  if (first.body.status !== 'tools') return
  assert.equal(first.body.tier, 'claude')
  assert.deepEqual(first.body.timedOut, ['grok'])
  const second = await handleChat(
    {
      question: 'Read the alarms',
      snapshot: { plant: { hallSupplyF: 72 } },
      round: 1,
      tier: first.body.tier,
      timedOut: ['grok', 'shell'],
      toolResults: [{ name: 'plant.getAlarms', ok: true, message: 'No alarms.' }],
    },
    deps(async (prompt) => {
      seen = prompt
      return llm('{"answer":"The hall is stable.","cites":[]}', 'claude')
    }),
  )
  assert.equal(seen?.tier, 'claude')
  assert.deepEqual(seen?.timedOut, ['grok'])
  assert.equal(second.body.status, 'answer')
  const blocked = await handleChat(
    {
      question: 'Read the alarms',
      snapshot: {},
      round: 1,
      tier: 'grok',
      toolResults: [],
    },
    { ...deps(async (prompt) => { seen = prompt; return llm('{"answer":"The hall is stable.","cites":[]}') }), only: 'claude' },
  )
  assert.equal(blocked.body.status, 'answer')
  assert.equal(seen?.tier, undefined)
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
  assert.match(prompt.system, /IT load 4\.2 MW/)
  assert.match(prompt.system, /Do not write a raw field name such as itLoadMw/)
  assert.match(prompt.user, /trainer:glossary:n-plus-1/)
  assert.match(prompt.user, /standby units that can start/)
  assert.match(prompt.user, /Subtract the largest unit/)
  assert.match(prompt.user, /N\+1 holds\./)
  assert.match(prompt.user, /N\+1 does not hold\./)
  assert.match(prompt.user, /17 times 5 MW is 85 MW/)
  assert.match(prompt.user, /itLoadMw/)
  assert.equal(prompt.openCase, false)
  const openCase = buildPrompt(
    { question: 'q', previousQuestions: [], history: [], snapshot: { blocksWrites: true }, round: 0, toolResults: [] },
    [],
  )
  assert.match(openCase.system, /I cannot give the answer while the case is open\. Check the readings on screen, then make your pick\./)
  assert.equal(openCase.openCase, true)
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
  assert.match(follow.user, /Snapshot:\n/)
  assert.equal(follow.user.includes('Snapshot delta:'), false)
  assert.match(follow.user, /"action":"setValve"/)
  assert.equal(follow.user.includes('Passages:'), false)
  assert.equal(follow.user.includes('long passage'), false)
  const question = 'How many actions are in the action log?'
  const snapshot = {
    plant: {
      itLoadMw: 4.2,
      hallSupplyF: 70,
      chwValvePct: 40,
      runningCapacityMw: 5,
      units: [
        { id: 'CH-01', running: true, capacityMw: 5, mode: 'run' },
        { id: 'CH-02', running: false, capacityMw: 5, mode: 'ready' },
      ],
    },
  }
  const found = searchChunks(index as Chunk[], question, 4)
  const round0 = buildPrompt({ question, previousQuestions: [], history: [], snapshot, round: 0, toolResults: [] }, found)
  const round1 = buildPrompt({
    question,
    previousQuestions: [],
    history: [],
    snapshot,
    round: 1,
    toolResults: [{
      name: 'plant.getActionLog',
      ok: true,
      message: '1 rows.',
      rows: [{ t: 12, actor: 'user', action: 'setValve', args: { loop: 'chw', pct: 40 } }],
    }],
  }, found)
  const promptBytes = (prompt: { system: string; user: string }) => `${prompt.system}\n\n${prompt.user}`.length
  assert.equal(round1.user.includes('Passages:'), false)
  assert.match(round1.user, /Snapshot:\n/)
  assert.equal(round1.user.includes('Snapshot delta:'), false)
  assert.match(round1.user, /"id":"CH-01"/)
  assert.match(round1.user, /Tool results:/)
  assert.match(round1.user, /Use active voice/)
  assert.match(round1.user, /25 words/)
  assert.match(round1.system, /Use active voice/)
  assert.match(round1.system, /20 words/)
  assert.equal(round0.user.includes('Use active voice'), false)
  assert.match(round0.system, /chiller motor current only/)
  assert.match(round0.system, /% open/)
  assert.match(round0.system, /% speed/)
  assert.match(round1.user, /chiller motor current only/)
  assert.match(round1.user, /% open/)
  assert.match(round0.system, /Do not invent a new target or a setpoint/)
  assert.match(round0.system, /State only a target that the data shows/)
  assert.match(round1.system, /State only a target that the data shows/)
  assert.match(round0.system, /computed number may appear only with its work shown/)
  assert.match(round0.system, /17 - 9\.5 = 7\.5/)
  assert.equal(promptBytes(round1), 2442)
  assert.equal(promptBytes(round0), 3667)
  assert.equal(round1.user.length, 569)
  assert.equal(round0.user.length, 2020)
})

test('a follow-up prompt keeps the chiller row, differential pressure, hall return, and LCHLT setpoint', () => {
  const snapshot = {
    view: 'home',
    blocksWrites: true,
    incident: 'hall-hot',
    units: [{ id: 'CH-01', mode: 'run', rla: 34, running: true, condPsig: 71 }],
    plant: {
      hallReturnF: 85,
      lchltSet: 44,
      chwDpPsi: 9.5,
      chwTargetPsi: 18,
      cwDpPsi: 12.6,
      reason: 'The hall is hot because the valve is pinched.',
      ch01: { mode: 'run', rla: 34 },
    },
    shown: { 'kpi.ch01Fla': '34%' },
    optiLog: ['CH-01 is online. The BMS link is a simulation.'],
  }
  const prompt = buildPrompt({
    question: 'What is the motor current and the CHW differential pressure?',
    previousQuestions: [],
    history: [],
    snapshot,
    round: 1,
    toolResults: [],
  }, [])
  assert.match(prompt.user, /"id":"CH-01"/)
  assert.match(prompt.user, /"mode":"run"/)
  assert.match(prompt.user, /"rla":34/)
  assert.match(prompt.user, /"chwDpPsi":9\.5/)
  assert.match(prompt.user, /"chwDpTargetPsi":18/)
  assert.equal(prompt.user.includes('"chwTargetPsi"'), false)
  assert.match(prompt.user, /"cwDpPsi":12\.6/)
  assert.match(prompt.system, /Name the loop with every pressure/)
  assert.match(prompt.user, /"hallReturnF":85/)
  assert.match(prompt.user, /"lchltSet":44/)
  assert.match(prompt.user, /34%/)
  assert.match(prompt.user, /"blocksWrites":true/)
  assert.match(prompt.user, /"incident":"hall-hot"/)
  assert.match(prompt.user, /"condPsig":71/)
  assert.equal(prompt.user.includes('Snapshot delta:'), false)
  assert.equal(prompt.user.includes('kpi.ch01Fla'), false)
  assert.equal(prompt.user.includes('pinched'), false)
  assert.equal(prompt.user.includes('BMS link'), false)
  assert.equal(prompt.user.includes('"ch01"'), false)
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
  const quoted = 'The chilled-water valve stays open. The shape is {"answer":"close it","cites":[],"tools":["plant.getAlarms"]}.'
  const prose = parseModelPlan(quoted)
  assert.equal(prose.validJson, false)
  assert.equal(prose.answer, quoted)
  assert.deepEqual(prose.tools, [])
  assert.equal(jsonRetryNeeded(quoted), false)
  const whole = '{"answer":"The hall is stable.","cites":["a"],"tools":[]}'
  assert.equal(parseModelPlan(whole).validJson, true)
  assert.equal(parseModelPlan(whole).answer, 'The hall is stable.')
  const result = await handleChat(
    { question: 'Read the alarms', snapshot: { blocksWrites: false }, round: 0 },
    deps(async () => llm(BARE_TOOLS)),
  )
  assert.equal(result.body.status, 'tools')
  if (result.body.status !== 'tools') return
  assert.deepEqual(result.body.calls.map((call) => call.name), ['plant.getAlarms', 'plant.getActionLog'])
})

test('a short lead-in before one JSON object is that object', () => {
  const tools = `Here is my reply:\n${BARE_TOOLS}`
  const toolPlan = parseModelPlan(tools)
  assert.equal(toolPlan.validJson, true)
  assert.deepEqual(toolPlan.tools.map((tool) => tool.name), ['plant.getAlarms', 'plant.getActionLog'])
  assert.equal(jsonRetryNeeded(tools), false)
  assert.equal(usableModelText(tools), true)
  const toolTurn = planTurn(tools, false)
  assert.equal(toolTurn.kind, 'tools')
  if (toolTurn.kind !== 'tools') return
  assert.deepEqual(toolTurn.calls.map((call) => call.name), ['plant.getAlarms', 'plant.getActionLog'])
  const answer = 'Sure.\n{"answer":"The hall is stable.","cites":["a"],"tools":[]}'
  const answerPlan = parseModelPlan(answer)
  assert.equal(answerPlan.validJson, true)
  assert.equal(answerPlan.answer, 'The hall is stable.')
  assert.deepEqual(answerPlan.cites, ['a'])
  assert.equal(planTurn(answer, false).kind, 'answer')
  const object = '{"answer":"The hall is stable.","cites":[],"tools":[]}'
  assert.equal(parseModelPlan(`${'x'.repeat(40)}${object}`).validJson, true)
  const longer = `${'x'.repeat(41)}${object}`
  assert.equal(parseModelPlan(longer).validJson, false)
  assert.equal(parseModelPlan(longer).answer, longer)
  const broken = 'Sure.\n{"answer":"The hall is stable.",}'
  assert.equal(parseModelPlan(broken).validJson, false)
  assert.equal(jsonRetryNeeded(broken), true)
  assert.equal(usableModelText(broken), false)
  const twice = 'Sure.\n{"answer":"One.","cites":[],"tools":[]}\n{"answer":"Two.","cites":[],"tools":[]}'
  assert.equal(jsonRetryNeeded(twice), true)
  assert.equal(usableModelText(twice), false)
  const quoted = 'It said {"answer":"x"}.'
  const inline = parseModelPlan(quoted)
  assert.equal(inline.validJson, false)
  assert.equal(inline.answer, quoted)
  assert.equal(jsonRetryNeeded(quoted), false)
  assert.equal(usableModelText(quoted), true)
  const unclosed = 'Sure.\n{"answer":"A.", "tools": ['
  assert.equal(parseModelPlan(unclosed).validJson, false)
  assert.equal(jsonRetryNeeded(unclosed), true)
  assert.equal(usableModelText(unclosed), false)
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

test('an open case drops trouble and quiz passages', () => {
  const rows: Chunk[] = [
    { id: 'trainer:trouble:low-flow', title: 'Low flow', href: '/x', text: 'Typical symptoms: Hot hall. Open the bypass valve.' },
    { id: 'trainer:info:trouble-low-flow', title: 'Low flow card', href: '/x', text: 'Open the bypass valve.' },
    { id: 'trainer:quiz:flow', title: 'Flow quiz', href: '/x', text: 'Open the bypass valve.' },
    { id: 'trainer:info:quiz-q1', title: 'Quiz card', href: '/x', text: 'Open the bypass valve and read full load amps.' },
    { id: 'trainer:glossary:fla', title: 'FLA', href: '/x', text: 'Percent of full load amps on the motor.' },
  ]
  const hidden = searchChunks(rows, 'bypass valve full load amps', 4, true)
  assert.deepEqual(hidden.map((item) => item.id), ['trainer:glossary:fla'])
  const shown = searchChunks(rows, 'bypass valve', 4, false)
  assert.equal(shown.some((item) => item.id.startsWith('trainer:trouble:')), true)
  const duringQuiz = searchChunks(rows, 'bypass valve full load amps', 4, false, true)
  assert.equal(duringQuiz.some((item) => item.id.startsWith('trainer:quiz:')), false)
  assert.equal(duringQuiz.some((item) => item.id.startsWith('trainer:info:quiz-')), false)
  assert.equal(duringQuiz.some((item) => item.id.startsWith('trainer:glossary:')), true)
})

test('an open case hides the keyed answer for the trouble questions', () => {
  const rows: Chunk[] = [
    {
      id: 'trainer:info:chaos-high-head',
      title: 'Peak weather high head',
      href: '/x',
      text: 'The answer to this trouble case is to start a redundant chiller. The root cause is low tower rejection.',
    },
    {
      id: 'trainer:info:kpi-head',
      title: 'Condenser head',
      href: '/x',
      text: 'The root cause is low CW flow. The answer is to use the cooling towers and a redundant chiller.',
    },
    {
      id: 'trainer:info:quiz-q1',
      title: 'Quiz',
      href: '/x',
      text: 'The answer to this trouble case is to read the inhibits. The root cause is an offline spare.',
    },
    {
      id: 'trainer:glossary:fla',
      title: 'FLA',
      href: '/x',
      text: 'The answer on the gauge is percent of full load amps. The root cause of a high reading is motor current.',
    },
  ]
  const questions = ['What is the answer to this trouble case?', 'What is the root cause?']
  for (const question of questions) {
    const hidden = searchChunks(rows, question, 4, true)
    assert.deepEqual(hidden.map((item) => item.id), ['trainer:glossary:fla'])
    const shown = searchChunks(rows, question, 4, false)
    assert.equal(shown.some((item) => item.id === 'trainer:info:chaos-high-head'), true)
    assert.equal(shown.some((item) => item.id === 'trainer:info:kpi-head'), true)
  }
})

const STRAY_ROOT = 'The cooling tower cannot reject enough heat." Work from the pick...'

test('an unmatched quote fragment is dropped and an open case keeps the decline', async () => {
  assert.equal(dropUnmatchedQuotes(STRAY_ROOT), '')
  const decline = 'I cannot give the answer while the case is open. Check the readings on screen, then make your pick.'
  const mixed = `${decline} ${STRAY_ROOT}`
  const polished = polishAnswer(mixed, [], [], { blocksWrites: true })
  assert.match(polished.answer, /I cannot give the answer while the case is open\./)
  assert.match(polished.answer, /Check the readings on screen, then make your pick\./)
  assert.equal(polished.answer.includes('cooling tower'), false)
  assert.equal(polished.answer.includes('"'), false)
  const alone = polishAnswer(STRAY_ROOT, [], [], { blocksWrites: true })
  assert.equal(alone.answer, '')
  let called = false
  const finished = await finishAnswer(STRAY_ROOT, [], [], { blocksWrites: true }, async () => {
    called = true
    return decline
  })
  assert.equal(called, true)
  assert.match(finished.answer, /I cannot give the answer while the case is open\./)
  assert.equal(finished.answer.includes('cooling tower'), false)
  const prevClient = process.env.YORK_LOG_CLIENT
  const prevRaw = process.env.YORK_DEBUG_RAW
  process.env.YORK_LOG_CLIENT = '1'
  delete process.env.YORK_DEBUG_RAW
  const notes: string[] = []
  const debug = console.debug
  console.debug = (msg?: unknown) => {
    notes.push(String(msg))
  }
  try {
    await finishAnswer(STRAY_ROOT, [], [], { blocksWrites: true }, async () => decline)
    assert.deepEqual(notes, [])
    process.env.YORK_DEBUG_RAW = '1'
    await finishAnswer(`sk-ant-abcdefghij\n${STRAY_ROOT}`, [], [], { blocksWrites: true }, async () => decline)
    assert.deepEqual(notes, [])
    await finishAnswer(STRAY_ROOT, [], [], { blocksWrites: true }, async () => decline)
    await finishAnswer('The hall is warm.\nOpen the valve.', [], [], {}, async () => 'The hall is warm.')
  } finally {
    console.debug = debug
    if (prevClient === undefined) delete process.env.YORK_LOG_CLIENT
    else process.env.YORK_LOG_CLIENT = prevClient
    if (prevRaw === undefined) delete process.env.YORK_DEBUG_RAW
    else process.env.YORK_DEBUG_RAW = prevRaw
  }
  const logged = notes.join('\n')
  assert.match(logged, /york-api finish raw=/)
  assert.match(logged, /cooling tower/)
  assert.match(logged, /The hall is warm\.\\nOpen the valve\./)
  assert.equal(logged.includes('sk-ant-'), false)
  assert.equal(loggableRaw(`The hall is warm.\nsk-ant-abcdefghij\nOpen the valve.`), '')
  assert.equal(loggableRaw('The hall is warm.\nOpen the valve.'), 'The hall is warm.\\nOpen the valve.')
})

test('the N+1 example numbers are not traced on a first-round answer', () => {
  const gloss = 'N+1 means one extra unit of capacity beyond the load. The spare is every running chiller plus every standby chiller that can start, minus the largest unit.'
  const fleet = '17 times 5 MW is 85 MW.'
  assert.equal(dropUntracedNumbers(fleet, gloss), '')
  assert.match(dropUntracedNumbers(fleet, N_PLUS_ONE_LINE), /17 times 5 MW is 85 MW/)
  const dropped = polishAnswer('Hall supply is 80 F.', [], [], { plant: { hallSupplyF: 72 } })
  assert.equal(dropped.answer, '')
  const fleetDropped = polishAnswer(fleet, [], [], {})
  assert.equal(fleetDropped.answer.includes('85'), false)
})

test('a rewrite drops an added sentence and keeps the restated fact', async () => {
  let rewriteSystem = ''
  const result = await finishAnswer(
    '2 actions are recorded in the action log.',
    [],
    [],
    {},
    async (prompt) => {
      rewriteSystem = prompt.system
      return 'The action log shows 2 actions. The trainer model keeps working from live numbers.'
    },
    [{ name: 'plant.getActionLog', ok: true, message: '2 rows.' }],
  )
  assert.match(rewriteSystem, /^Rewrite /)
  assert.match(rewriteSystem, /Do not add a sentence/)
  assert.match(result.answer, /2 actions/)
  assert.equal(result.answer.includes('keeps working'), false)
})

test('an emptied answer logs a reason code and not the model text', async () => {
  const notes: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    notes.push(String(msg))
  }
  try {
    const passive = await finishAnswer('The valve is closed by the operator.', [], [], {}, async () => '')
    assert.equal(passive.answer, NO_ANSWER)
    const labeled = await finishAnswer(LIVE_LABEL, [], [], {}, async () => '')
    assert.equal(labeled.answer, NO_ANSWER)
    const quoted = await finishAnswer(STRAY_ROOT, [], [], {}, async () => '')
    assert.equal(quoted.answer, NO_ANSWER)
    const numbered = await finishAnswer('The count is 9.', [], [], {}, async () => '')
    assert.equal(numbered.answer, NO_ANSWER)
    let called = false
    const leaked = await finishAnswer('sk-ant-abcdefghij is in the reply.', [], [], {}, async () => {
      called = true
      return 'The hall is stable.'
    })
    assert.equal(leaked.answer, NO_ANSWER)
    assert.equal(called, false)
    const blank = await finishAnswer('   ', [], [], {}, async () => 'The hall is stable.')
    assert.equal(blank.answer, NO_ANSWER)
  } finally {
    console.log = log
  }
  const joined = notes.join('\n')
  assert.match(joined, /york-api finish empty reason=ste-drop/)
  assert.match(joined, /york-api finish empty reason=label-only/)
  assert.match(joined, /york-api finish empty reason=quote-drop/)
  assert.match(joined, /york-api finish empty reason=number-drop/)
  assert.match(joined, /york-api finish empty reason=leak/)
  assert.match(joined, /york-api finish empty reason=parse/)
  assert.equal(joined.includes('sk-ant-'), false)
  assert.equal(joined.includes('cooling tower'), false)
  assert.equal(joined.includes('valve'), false)
})

test('a dropped step does not leave its marker or its Reason', () => {
  const steps = '4. A. Reason: a. 5. Watch the CW valve at 78% FLA. Reason: b. 6. C.'
  assert.equal(dropMisusedFla(steps), '4. A. Reason: a. 6. C.')
  assert.equal(dropUnmatchedQuotes('4. A. Reason: a. 5. Watch the "valve. Reason: b. 6. C.'), '4. A. Reason: a. 6. C.')
  const polished = polishAnswer(steps, [], [], { valvePct: 78 })
  assert.match(polished.answer, /^4\. A\. Reason: a\. 6\. C\./)
  assert.equal(polished.answer.includes('78'), false)
  assert.equal(polished.answer.includes('5.'), false)
  assert.equal(polished.answer.includes('Reason: b'), false)
  const passive = polishAnswer('4. A. Reason: a. 5. The valve is closed by the operator. Reason: b. 6. C.', [], [], {})
  assert.match(passive.answer, /^4\. A\. Reason: a\. 6\. C\./)
  assert.equal(passive.answer.includes('closed'), false)
  assert.equal(passive.answer.includes('Reason: b'), false)
})

test('a newline after a period stays, and a paragraph after the list stays', () => {
  const lined = polishAnswer('The hall is warm.\nOpen the valve. Reason: The hall is warm.', [], [], {})
  assert.match(lined.answer, /^The hall is warm\.\nOpen the valve\. Reason: The hall is warm\./)
  const keptBreak = polishAnswer(
    'The hall is warm.\nOpen the valve. Reason: The hall is warm. The valve is closed by the operator. Reason: The spare is ready.',
    [],
    [],
    {},
  )
  assert.match(keptBreak.answer, /^The hall is warm\.\nOpen the valve\. Reason: The hall is warm\./)
  assert.equal(keptBreak.answer.includes('spare is ready'), false)
  assert.equal(keptBreak.answer.includes('closed'), false)
  assert.equal(dropUntracedNumbers('4. A. 5. The count is 9.\n\nThe hall is warm.', ''), '4. A.\n\nThe hall is warm.')
  assert.equal(dropUntracedNumbers('4. A. 5. The count is 9.\nThe hall is warm.', ''), '4. A.\nThe hall is warm.')
  assert.equal(
    dropUntracedNumbers('4. A. 5. The count is 9.\nReason: r.\n\nThe hall is warm.', ''),
    '4. A.\n\nThe hall is warm.',
  )
  const afterList = polishAnswer('4. A. 5. The count is 9.\n\nThe hall is warm.', [], [], {})
  assert.match(afterList.answer, /^4\. A\.\n\nThe hall is warm\./)
  assert.equal(afterList.answer.includes('9'), false)
})

test('a loop label stays on the next kept sentence', () => {
  const loops = 'Loops.\nChilled-water loop: valve at 40% open (untraced 99). Supply 42.5 psig, return 52 psig.'
  assert.equal(
    dropUntracedNumbers(loops, '40 42.5 52'),
    'Loops.\nChilled-water loop: Supply 42.5 psig, return 52 psig.',
  )
  assert.equal(dropUntracedNumbers('Loops.\nChilled-water loop: valve at 99. Supply is 98.', ''), 'Loops.')
})

test('a computed number stays only with a correct equation in the same sentence', () => {
  const good = 'CHW dP is 7.5 psi below target (17 - 9.5 = 7.5).'
  assert.equal(dropUntracedNumbers(good, '17 9.5'), good)
  assert.equal(dropUntracedNumbers('The gap is 7.5 psi.', '17 9.5'), '')
  assert.equal(dropUntracedNumbers('CHW dP is 8.0 psi below target (17 - 9.5 = 8.0).', '17 9.5'), '')
  assert.equal(
    dropUntracedNumbers('1. Open the valve. The count is 99. Reason: the hall is warm.', ''),
    '1. Open the valve. Reason: the hall is warm.',
  )
  assert.equal(dropUntracedNumbers('1. The count is 99. Reason: the hall is warm. 2. Stay.', ''), '2. Stay.')
})

test('stacked headings and a heading above a blank line stay', () => {
  const stacked = 'Eight-hour checklist\nHour 0 to 1\n1. Open the valve.'
  assert.equal(dropUntracedNumbers(stacked, ''), stacked)
  const parent = 'Eight-hour checklist\nShift start\n1. Open the valve.'
  assert.equal(dropUntracedNumbers(parent, ''), parent)
  const nested = '# Eight-hour checklist\n## Shift start\n1. Open the valve.'
  assert.equal(dropUntracedNumbers(nested, ''), nested)
  assert.equal(
    dropUntracedNumbers('Eight-hour checklist\n\n1. Open the valve.', ''),
    'Eight-hour checklist\n\n1. Open the valve.',
  )
  assert.equal(
    dropUntracedNumbers('Eight-hour checklist\nShift start\nThe count is 99.', ''),
    '',
  )
  const later = 'Eight-hour checklist\nShift start\n1. Check pump 3 (untraced)\nMid shift\n2. Log it'
  assert.equal(dropUntracedNumbers(later, ''), 'Mid shift\n2. Log it')
})

test('schedule words do not empty an answer', () => {
  const labels = 'Hour 4: check the log. After 6 hours. Every 4 h. Hours 0-2. At hour 8. Within 2 hours.'
  assert.equal(dropUntracedNumbers(labels, ''), labels)
})

test('a fact line with no final period stays', () => {
  const plant = 'Plant: outdoor air 75 F, free cooling 0%'
  assert.equal(dropUntracedNumbers(plant, '75 0'), plant)
  assert.equal(dropUntracedNumbers(plant, ''), '')
})

test('schedule labels stay and a hall reading is still checked', () => {
  const hours = [
    '1. Hour 0 to 2. Open the log.',
    '2. Hour 2 to 4. Check the tower every 2 hours.',
    '3. Hours 4-8. Watch the fans for 4-8 h.',
    '4. Next 2 hours. Read the trend at t=8.',
  ].join(' ')
  assert.equal(dropUntracedNumbers(hours, ''), hours)
  assert.equal(dropUntracedNumbers('Hall supply is 80 F.', ''), '')
  assert.equal(dropUntracedNumbers('1. Hour 2 to 4. Hall supply is 80 F.', ''), '1. Hour 2 to 4.')
})

test('a heading and a bullet drop together, and a lone next-line command follows its step', () => {
  assert.equal(dropUntracedNumbers('HEADING\n- The count is 9. The spare follows.', ''), 'HEADING\n- The spare follows.')
  assert.equal(
    dropUntracedNumbers('HEADING\n- The count is 9. The spare follows.\n- Open the valve.', ''),
    'HEADING\n- The spare follows.\n- Open the valve.',
  )
  assert.equal(
    dropUntracedNumbers('HEADING\n- The count is 9.\nThe spare follows.\n\nThe hall is warm.', ''),
    'HEADING\n- The spare follows.\n\nThe hall is warm.',
  )
  assert.equal(
    dropUntracedNumbers('1. A.\n2. The count is 9.\nStart it later.\n3. C.', ''),
    '1. A.\n3. C.',
  )
  assert.equal(
    dropUntracedNumbers('1. A.\n2. The count is 9.\nThe hall is warm.\n3. C.', ''),
    '1. A.\nThe hall is warm.\n3. C.',
  )
})

test('% FLA on a valve, fan, or tower is dropped', () => {
  const mixed = [
    'The motor current is 40% FLA.',
    'The CHW valve is at 40% FLA.',
    'The condenser fan is at 80% FLA.',
    'The cooling tower is at 40% FLA.',
  ].join(' ')
  const kept = dropMisusedFla(mixed)
  assert.match(kept, /motor current is 40% FLA/)
  assert.equal(kept.includes('valve'), false)
  assert.equal(kept.includes('fan'), false)
  assert.equal(kept.includes('tower'), false)
  const polished = polishAnswer(mixed, [], [], { motorFla: 40 })
  assert.match(polished.answer, /motor current is 40% FLA/)
  assert.equal(polished.answer.includes('valve'), false)
  assert.equal(polished.answer.includes('fan'), false)
  assert.equal(polished.answer.includes('tower'), false)
})

const LONG_STEP = 'The operator reads the long gauge that fails the check because the sentence has too many words for the limit in this trainer answer today now.'

test('an orphaned Reason sentence is dropped when its step was removed', () => {
  const raw = `Open the valve. Reason: The hall is warm. ${LONG_STEP} Reason: The spare is ready.`
  const kept = polishAnswer(raw, [], [], {})
  assert.match(kept.answer, /Open the valve/)
  assert.match(kept.answer, /Reason: The hall is warm/)
  assert.equal(kept.answer.includes('spare is ready'), false)
  assert.equal(kept.answer.includes('long gauge'), false)
  const leading = ` ${LONG_STEP} Reason: The spare is ready. Open the valve. Reason: The hall is warm.`
  const shifted = polishAnswer(leading, [], [], {})
  assert.match(shifted.answer, /Open the valve/)
  assert.match(shifted.answer, /Reason: The hall is warm/)
  assert.equal(shifted.answer.includes('spare is ready'), false)
  const pair = polishAnswer('Open the valve. Reason: The hall is warm.', [], [], {})
  assert.match(pair.answer, /Open the valve/)
  assert.match(pair.answer, /Reason: The hall is warm/)
})

test('unit ids are not live numbers and corpus checks use number tokens', () => {
  assert.equal(labelLiveNumbers('CH-01 is online.'), 'CH-01 is online.')
  assert.equal(labelLiveNumbers('The hall is 72°F.'), `The hall is 72°F. ${LIVE_LABEL}`)
  assert.equal(dropUntracedNumbers('CH-01 is online.', ''), 'CH-01 is online.')
  assert.equal(dropUntracedNumbers('The count is 2.', '2 rows'), 'The count is 2.')
  assert.equal(dropUntracedNumbers('The count is 2.', '12 rows'), '')
  const list = '1. Open the valve. 2. Start the spare. 3. Read the hall.'
  assert.equal(dropUntracedNumbers(list, ''), list)
  assert.equal(dropUntracedNumbers('3. The count is 9.', ''), '')
  assert.equal(dropUntracedNumbers('3. The count is 9.', '9 rows'), '3. The count is 9.')
  assert.equal(dropUntracedNumbers('The reading is 9.5 psi.', ''), '')
  assert.equal(dropUntracedNumbers('4. A. 5. B 1.8 psi. Reason: C. 6. D.', ''), '4. A. 6. D.')
  assert.equal(dropUntracedNumbers('Heading:\n1. A. 2. B.', ''), 'Heading:\n1. A. 2. B.')
  assert.equal(dropUntracedNumbers('Heading:\n1. A. 2. B 1.8. 3. C.', ''), 'Heading:\n1. A. 3. C.')
  assert.equal(dropUntracedNumbers('Load. 4.2 MW now. 1. A.', '4.2'), 'Load. 4.2 MW now. 1. A.')
  assert.equal(dropUntracedNumbers('9.5 psi is low. 1. A.', '9.5'), '9.5 psi is low. 1. A.')
  assert.equal(dropUntracedNumbers('The load is 95MW.', ''), '')
  assert.equal(dropUntracedNumbers('The offset is -7.', ''), '')
  assert.equal(dropUntracedNumbers('The band is 118-140.', '118'), '')
  assert.equal(dropUntracedNumbers('The load is 95MW.', '95'), 'The load is 95MW.')
  assert.equal(dropUntracedNumbers('The offset is -7.', '-7'), 'The offset is -7.')
  assert.equal(dropUntracedNumbers('The band is 118-140.', '118 140'), 'The band is 118-140.')
  assert.equal(dropUntracedNumbers('1. A. 2. B 1.8. Start it later. Reason: r. 3. C.', ''), '1. A. 3. C.')
  const heading = 'Heading:\n1. Open the valve.'
  assert.equal(dropMisusedFla(heading), heading)
  assert.equal(dropUnmatchedQuotes(heading), heading)
  assert.match(polishAnswer(heading, [], [], {}).answer, /Heading:\n1\. Open the valve\./)
})

const NUMBER_TOKEN = /(?<![\d.])-?\d+(?:\.\d+)?/g

test('heading scope follows one level rule', () => {
  const rows = [
    ['d21-caps-stack', 'CHECKLIST\nSHIFT START\n1. Open the valve.', 'CHECKLIST\nSHIFT START\n1. Open the valve.'],
    ['d21-eight-hour-caps', 'EIGHT-HOUR CHECKLIST\nShift start\n1. Open the valve.', 'EIGHT-HOUR CHECKLIST\nShift start\n1. Open the valve.'],
    ['blank-line-parent', 'Eight-hour checklist\n\nShift start\n1. Open the valve.', 'Eight-hour checklist\n\nShift start\n1. Open the valve.'],
    ['bold-parent', '**Pumps**\nCHILLERS\n1. Open the valve.', '**Pumps**\nCHILLERS\n1. Open the valve.'],
    ['hash-nest', '# Eight-hour checklist\n## Shift start\n1. Open the valve.', '# Eight-hour checklist\n## Shift start\n1. Open the valve.'],
    ['pumps-empty-above-chillers', 'PUMPS\nCHILLERS\n- Open the valve.', 'PUMPS\nCHILLERS\n- Open the valve.'],
    ['emptied-bold', '**Pumps**\nThe count is 99.\n**Alarms**\nThe count is 88.', ''],
    ['d16r2-later-section', 'Eight-hour checklist\nShift start\n1. Check pump 3 (untraced)\nMid shift\n2. Log it', 'Mid shift\n2. Log it'],
    ['d24-chillers-after-blank', 'Eight-hour checklist\nShift start\n1. Check pump 3 (untraced)\n\nCHILLERS\n- CH-01', 'CHILLERS\n- CH-01'],
    ['d24-mid-after-content', 'Shift start\nFirst hour\n1. Check pump 3 (untraced)\nMid shift\n2. ok', 'Mid shift\n2. ok'],
    ['d24-emptied-hash', '## Pumps\nThe count is 99.\nCHILLERS\n- Open the valve.', 'CHILLERS\n- Open the valve.'],
    ['d16-shift-start', 'Eight-hour checklist\nShift start\n1. Open the valve.', 'Eight-hour checklist\nShift start\n1. Open the valve.'],
    ['d8-sibling-removed', 'PUMPS\nThe count is 99.\nCHILLERS\n1. Open the valve.', 'CHILLERS\n1. Open the valve.'],
    ['d8-empty-leaf', 'PUMPS', ''],
    ['empty-child', 'PUMPS\nFANS', 'PUMPS'],
    ['d8r-empty-bold', '**Pumps**', ''],
    ['hour-body', 'Eight-hour checklist\nHour 0 to 1\n1. Open the valve.', 'Eight-hour checklist\nHour 0 to 1\n1. Open the valve.'],
    ['emptied-parent', 'Eight-hour checklist\nShift start\nThe count is 99.', ''],
  ] as const
  for (const [name, raw, out] of rows) assert.equal(dropUntracedNumbers(raw, ''), out, name)
})

test('an empty heading drops when its section lost its text', () => {
  assert.equal(dropUntracedNumbers('PUMPS', ''), '')
  assert.equal(dropUntracedNumbers('PUMPS\n1. Open the valve.\n\nFANS', ''), 'PUMPS\n1. Open the valve.')
  assert.equal(dropUntracedNumbers('PUMPS\nFANS\n1. Open the valve.', ''), 'PUMPS\nFANS\n1. Open the valve.')
  assert.equal(dropUntracedNumbers('PUMPS\nCHILLERS\n1. Open the valve.', ''), 'PUMPS\nCHILLERS\n1. Open the valve.')
  assert.equal(dropUntracedNumbers('PUMPS\nCHILLERS\n- Open the valve.', ''), 'PUMPS\nCHILLERS\n- Open the valve.')
  assert.equal(
    dropUntracedNumbers('PUMPS\nThe count is 99.\nCHILLERS\n1. Open the valve.', ''),
    'CHILLERS\n1. Open the valve.',
  )
  assert.equal(dropUntracedNumbers('PUMPS\nFANS', ''), 'PUMPS')
  assert.equal(dropUntracedNumbers('**Pumps**', ''), '')
  assert.equal(dropUntracedNumbers('**Pumps**\n1. Open the valve.', ''), '**Pumps**\n1. Open the valve.')
  assert.equal(dropUntracedNumbers('**Pumps**\nThe count is 99.', ''), '')
  const bold = '**Pumps**\nCHILLERS\n1. Open the valve.'
  assert.equal(dropUntracedNumbers(bold, ''), bold)
})

test('a heading or label is exempt from the STE passive check', () => {
  assert.deepEqual(steHits('WHAT WAS DONE (from the OptiView log)'), [])
  assert.deepEqual(steHits('What was done:'), [])
  assert.equal(steHits('The valve was closed by the operator.').includes('passive'), true)
  const title = polishAnswer('WHAT WAS DONE (from the OptiView log)\nOpen the valve.', [], [], {})
  assert.match(title.answer, /WHAT WAS DONE \(from the OptiView log\)/)
  assert.match(title.answer, /Open the valve/)
  const moved = polishAnswer('What was done: the valve was closed by the operator. Open the spare.', [], [], {})
  assert.match(moved.answer, /What was done: Open the spare\./)
  assert.equal(moved.answer.includes('closed'), false)
})

test('a quoted alarm that spans sentences on one line or bullet stays', () => {
  const alarm = 'The alarm says "Low head. Check the pump."'
  assert.equal(dropUnmatchedQuotes(alarm), alarm)
  const bullet = '- The alarm says "Low head.\nCheck the pump."'
  assert.equal(dropUnmatchedQuotes(bullet), bullet)
  assert.equal(dropUnmatchedQuotes('Watch the "valve.'), '')
})

test('an untraced number drops its bullet sentence and leaves the rest', () => {
  assert.equal(dropUntracedNumbers('- The count is 99. Open the valve.', ''), '- Open the valve.')
  assert.equal(dropUntracedNumbers('- Open the valve. The count is 99.', ''), '- Open the valve.')
})

test('a dropped bullet sentence keeps its label on the next sentence', () => {
  assert.equal(
    dropUntracedNumbers('- Chilled-water loop: valve at 40% open (untraced 99). Supply 42.5 psig.', '42.5'),
    '- Chilled-water loop: Supply 42.5 psig.',
  )
  assert.equal(
    dropUntracedNumbers('- 0 to 1 h: The count is 99. Open the valve.', ''),
    '- 0 to 1 h: Open the valve.',
  )
  assert.equal(
    dropUntracedNumbers('- Chilled-water loop: valve at 99.\nThe hall is warm.', ''),
    '- The hall is warm.',
  )
  assert.equal(
    dropUntracedNumbers('Chilled-water loop: valve at 99. The hall is warm.', ''),
    'The hall is warm.',
  )
  assert.equal(
    dropUntracedNumbers('- Chilled-water loop: valve at 99.\nOpen the valve.', ''),
    '- Open the valve.',
  )
})

test('an equation uses multiply and divide before add and subtract', () => {
  const chain = 'The balance is 5 (5 + 5 - 5 = 5).'
  assert.equal(dropUntracedNumbers(chain, '5'), chain)
  assert.equal(dropUntracedNumbers('The balance is 6 (5 + 5 - 5 = 6).', '5'), '')
  const product = 'The product is 10 (2 * 3 + 4 = 10).'
  assert.equal(dropUntracedNumbers(product, '2 3 4'), product)
  assert.equal(dropUntracedNumbers('The product is 14 (2 * 3 + 4 = 14).', '2 3 4'), '')
  const carried = 'CHW dP is 7.5 psi below target (17 - 9.5 + 0 = 7.5).'
  assert.equal(dropUntracedNumbers(carried, '17 9.5 0'), carried)
  const mixed = 'The product is 14.2 (4.2 + 5 * 2 = 14.2).'
  assert.equal(dropUntracedNumbers(mixed, '4.2 5 2'), mixed)
  assert.equal(dropUntracedNumbers('The product is 18.4 (4.2 + 5 * 2 = 18.4).', '4.2 5 2'), '')
  const grouped = 'The product is 18.4 ((4.2 + 5) * 2 = 18.4).'
  assert.equal(dropUntracedNumbers(grouped, '4.2 5 2'), grouped)
})

test('unicode math symbols count in an equation', () => {
  const minus = 'CHW dP is 7.5 psi below target (17 − 9.5 = 7.5).'
  assert.equal(dropUntracedNumbers(minus, '17 9.5'), minus)
  const times = 'The product is 8 (4 × 2 = 8).'
  assert.equal(dropUntracedNumbers(times, '4 2'), times)
  const div = 'The ratio is 4 (8 ÷ 2 = 4).'
  assert.equal(dropUntracedNumbers(div, '8 2'), div)
  const star = 'The product is 8 (4 * 2 = 8).'
  assert.equal(dropUntracedNumbers(star, '4 2'), star)
  const slash = 'The ratio is 4 (8 / 2 = 4).'
  assert.equal(dropUntracedNumbers(slash, '8 2'), slash)
})

test('an orphaned Reason keeps the newline before the next step', () => {
  const lined = polishAnswer(
    'Open the valve. The valve was closed by the operator. Reason: The spare is ready.\n3. Read the hall.',
    [],
    [],
    {},
  )
  assert.match(lined.answer, /Open the valve\.\n3\. Read the hall\./)
  assert.equal(lined.answer.includes('Reason:'), false)
  assert.equal(lined.answer.includes('closed'), false)
})

test('a number token in the output keeps the value it had in the input', () => {
  const cases = [
    ['4.2 MW runs now.', '4.2'],
    ['9.5 psi is the dP.', '9.5'],
    ['Load. 4.2 MW now. 1. A.', '4.2'],
    ['9.5 psi is low. 1. A.', '9.5'],
    ['Heading:\n1. A. 2. B.', ''],
    ['Heading:\n1. A. 2. B 1.8. 3. C.', ''],
    ['4. A. 5. B 1.8 psi. Reason: C. 6. D.', ''],
    ['1. Open the valve. 2. Start the spare. 3. Read the hall.', ''],
    ['3. The count is 9.', '9 rows'],
    ['The count is 2.', '12 rows'],
  ]
  for (const [input, corpus] of cases) {
    const out = dropUntracedNumbers(input ?? '', corpus ?? '')
    const source = new Set(input?.match(NUMBER_TOKEN) ?? [])
    for (const token of out.match(NUMBER_TOKEN) ?? []) {
      assert.equal(source.has(token), true, `${token} in ${JSON.stringify(out)}`)
    }
  }
})
