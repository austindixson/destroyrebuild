import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildAdapters } from '../src/adapters.ts'
import { cascade, type Adapter } from '../src/cascade.ts'
import { claudeArgs, completeGrok, cursorArgs, GROK_MODEL } from '../src/providers.ts'
import type { LlmRequest } from '../src/types.ts'

const req: LlmRequest = { system: 'sys', user: 'user' }

function adapter(id: string, model: string, complete: Adapter['complete'], enabled = true): Adapter {
  return { id, model, enabled: () => enabled, complete }
}

test('cascade skips an error, an empty answer, and a disabled provider', async () => {
  const calls: string[] = []
  const result = await cascade(
    [
      adapter('grok', GROK_MODEL, async () => {
        calls.push('grok')
        throw new Error('429')
      }),
      adapter('claude', 'claude-haiku-5-5', async () => {
        calls.push('claude')
        return '   '
      }),
      adapter('skip', 'nope', async () => {
        calls.push('skip')
        return 'no'
      }, false),
      adapter('cursor', 'auto', async () => {
        calls.push('cursor')
        return 'The hall is stable.'
      }),
    ],
    req,
    new AbortController().signal,
  )
  assert.equal(result.provider, 'cursor')
  assert.equal(result.model, 'auto')
  assert.equal(result.text, 'The hall is stable.')
  assert.deepEqual(calls, ['grok', 'claude', 'cursor'])
})

test('cascade throws when every provider fails', async () => {
  await assert.rejects(
    () => cascade([adapter('grok', GROK_MODEL, async () => { throw new Error('down') })], req, new AbortController().signal),
    /down/,
  )
})

test('grok HTTP falls through on rate limit and parses a real body', async () => {
  await assert.rejects(
    () => completeGrok(req, new AbortController().signal, async () => ({ ok: false, status: 429, json: async () => ({}) }), { XAI_API_KEY: 'test' }),
    /grok 429/,
  )
  const text = await completeGrok(
    req,
    new AbortController().signal,
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'Hall supply is high.' } }] }),
    }),
    { XAI_API_KEY: 'test', XAI_MODEL: 'grok-4.7' },
  )
  assert.equal(text, 'Hall supply is high.')
})

test('cascade skips claude when that provider is off', async () => {
  const calls: string[] = []
  const adapters = buildAdapters(
    { XAI_API_KEY: 'xai', CURSOR_API_KEY: 'cur', PATH: '/usr/bin' },
    async () => {
      calls.push('grok')
      return { ok: false, status: 503, json: async () => ({}) }
    },
    {
      async run() {
        calls.push('cursor')
        return { code: 0, stdout: 'The hall is stable.', stderr: '' }
      },
    },
  )
  assert.equal(adapters.find((item) => item.id === 'claude')?.enabled(), false)
  const result = await cascade(adapters, req, new AbortController().signal)
  assert.equal(result.provider, 'cursor')
  assert.deepEqual(calls, ['grok', 'cursor'])
})

test('claude and cursor commands use the verified model ids', () => {
  assert.deepEqual(claudeArgs('claude-haiku-5-5'), [
    '-p',
    '--model',
    'claude-haiku-5-5',
    '--strict-mcp-config',
    '--mcp-config',
    '{"mcpServers":{}}',
    '--output-format',
    'text',
    '--max-turns',
    '1',
    '--tools',
    '',
  ])
  assert.ok(cursorArgs('auto', '/tmp/york').includes('auto'))
  assert.ok(cursorArgs('auto', '/tmp/york').includes('ask'))
  assert.ok(cursorArgs('auto', '/tmp/york').includes('/tmp/york'))
})
