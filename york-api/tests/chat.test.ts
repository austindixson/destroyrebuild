import assert from 'node:assert/strict'
import { test } from 'node:test'
import index from '../data/trainer-index.json' with { type: 'json' }
import { cascade } from '../src/cascade.ts'
import { createBudget } from '../src/budget.ts'
import { handleChat, type ChatDeps } from '../src/chat.ts'
import { NO_ANSWER } from '../src/copy.ts'
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
