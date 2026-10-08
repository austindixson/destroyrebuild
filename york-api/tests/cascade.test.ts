import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildAdapters } from '../src/adapters.ts'
import { cascade, type Adapter } from '../src/cascade.ts'
import { claudeArgs, codexArgs, cursorArgs, grokArgs, GROK_MODEL } from '../src/providers.ts'
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

test('local CLIs are the cascade and codex stays off until asked', () => {
  assert.deepEqual(grokArgs(), ['-p'])
  const adapters = buildAdapters({}, {
    async run() {
      return { code: 0, stdout: 'The hall is stable.', stderr: '' }
    },
  })
  assert.deepEqual(adapters.map((item) => item.id), ['grok', 'claude', 'cursor', 'codex'])
  assert.equal(adapters[0]?.enabled(), true)
  assert.equal(adapters.find((item) => item.id === 'codex')?.enabled(), false)
  const withCodex = buildAdapters({ YORK_CODEX: '1' }, {
    async run() {
      return { code: 0, stdout: 'The hall is stable.', stderr: '' }
    },
  })
  assert.equal(withCodex.find((item) => item.id === 'codex')?.enabled(), true)
})

test('cascade skips claude when that binary is missing', async () => {
  const calls: string[] = []
  const adapters = buildAdapters({ YORK_CLAUDE_CLI: 'unavailable' }, {
    async run(cmd) {
      calls.push(cmd)
      if (cmd === 'grok') return { code: 1, stdout: '', stderr: 'grok failed' }
      return { code: 0, stdout: 'The hall is stable.', stderr: '' }
    },
  })
  assert.equal(adapters.find((item) => item.id === 'claude')?.enabled(), false)
  const result = await cascade(adapters, req, new AbortController().signal)
  assert.equal(result.provider, 'cursor')
  assert.deepEqual(calls, ['grok', 'agent'])
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
  assert.equal(cursorArgs('auto', '/tmp/york').includes('--force'), false)
  assert.deepEqual(codexArgs(), ['exec', '--skip-git-repo-check'])
})
