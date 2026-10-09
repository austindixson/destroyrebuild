import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildAdapters } from '../src/adapters.ts'
import { cascade, type Adapter } from '../src/cascade.ts'
import { stampDeadline } from '../src/deadline.ts'
import { CLAUDE_BUDGET_MS, CODEX_BUDGET_MS, CURSOR_BUDGET_MS, GROK_BUDGET_MS, tierBudgetMs } from '../src/adapters.ts'
import { claudeArgs, codexArgs, codexLaunchArgsOk, cursorArgs, grokArgs, grokLaunchArgsOk, GROK_MODEL } from '../src/providers.ts'
import type { LlmRequest } from '../src/types.ts'

const req: LlmRequest = { system: 'sys', user: 'user' }

function adapter(id: string, model: string, complete: Adapter['complete'], enabled = true, budgetMs?: number): Adapter {
  return { id, model, enabled: () => enabled, complete, budgetMs }
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
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  try {
    await assert.rejects(
      () => cascade([adapter('grok', GROK_MODEL, async () => { throw new Error('exit=71 stderr=sk-ant-abcdefghij failed') })], req, new AbortController().signal),
      /exit=71/,
    )
  } finally {
    console.log = log
  }
  assert.equal(lines.some((line) => line.startsWith('york-api cli grok failed reason=')), true)
  assert.equal(lines.some((line) => line.includes('sk-ant-')), false)
  assert.equal(lines.some((line) => line.includes('[redacted]')), true)
})

test('local CLIs are the cascade and codex stays off until asked', () => {
  const grok = grokArgs('/tmp/prompt.txt')
  assert.equal(grok.includes('-p'), false)
  assert.equal(grokLaunchArgsOk(grok), true)
  assert.equal(grokLaunchArgsOk(['-p']), false)
  assert.equal(GROK_BUDGET_MS, 75_000)
  assert.equal(CLAUDE_BUDGET_MS, 20_000)
  assert.equal(CURSOR_BUDGET_MS, 40_000)
  assert.equal(CODEX_BUDGET_MS, 10_000)
  assert.ok(GROK_BUDGET_MS + CLAUDE_BUDGET_MS + CURSOR_BUDGET_MS <= 135_000)
  const off = tierBudgetMs({})
  assert.deepEqual(off, { grok: 75_000, claude: 20_000, cursor: 40_000, codex: 10_000 })
  const on = tierBudgetMs({ YORK_CODEX: '1' })
  assert.deepEqual(on, { grok: 55_000, claude: 15_000, cursor: 40_000, codex: 10_000 })
  assert.ok(on.grok + on.claude + on.cursor + on.codex <= 135_000)
  const runner = {
    async run() {
      return { code: 0, stdout: 'The hall is stable.', stderr: '' }
    },
  }
  const adapters = buildAdapters({ YORK_SANDBOX: 'ready' }, runner)
  assert.deepEqual(adapters.map((item) => item.id), ['grok', 'claude', 'cursor', 'codex'])
  assert.equal(adapters[0]?.budgetMs, 75_000)
  assert.equal(adapters[2]?.budgetMs, 40_000)
  assert.equal(adapters[0]?.enabled(), true)
  assert.equal(adapters.find((item) => item.id === 'codex')?.enabled(), false)
  assert.equal(buildAdapters({}, runner)[0]?.enabled(), true)
  assert.equal(buildAdapters({ YORK_GROK_CLI: 'unavailable' }, runner)[0]?.enabled(), false)
  const withCodex = buildAdapters({ YORK_SANDBOX: 'ready', YORK_CODEX: '1' }, runner)
  assert.equal(withCodex.find((item) => item.id === 'codex')?.enabled(), true)
})

test('cascade skips claude when that binary is missing', async () => {
  const calls: string[] = []
  const adapters = buildAdapters({ YORK_SANDBOX: 'ready', YORK_CLAUDE_CLI: 'unavailable' }, {
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
    '--safe-mode',
    '--no-session-persistence',
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
  assert.deepEqual(codexArgs(), ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--ignore-user-config', '--ephemeral', '--ignore-rules'])
  assert.equal(codexLaunchArgsOk(codexArgs()), true)
  assert.equal(codexLaunchArgsOk(['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--ignore-user-config']), false)
  const forced = buildAdapters({ YORK_SANDBOX: 'ready', YORK_CODEX: '1' }, {
    async run() {
      return { code: 0, stdout: 'The hall is stable.', stderr: '' }
    },
  }, 'claude')
  assert.equal(forced.find((item) => item.id === 'claude')?.enabled(), true)
  assert.equal(forced.find((item) => item.id === 'grok')?.enabled(), false)
  assert.equal(forced.find((item) => item.id === 'cursor')?.enabled(), false)
})

test('cascade skips a tier when the time left is below its budget', async () => {
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 30_000)
  const calls: string[] = []
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  try {
    const result = await cascade(
      [
        adapter('grok', GROK_MODEL, async () => {
          calls.push('grok')
          return 'no'
        }, true, 75_000),
        adapter('claude', 'claude-haiku-5-5', async () => {
          calls.push('claude')
          return 'The hall is stable.'
        }, true, 20_000),
      ],
      req,
      controller.signal,
    )
    assert.equal(result.provider, 'claude')
    assert.deepEqual(calls, ['claude'])
  } finally {
    console.log = log
  }
  const joined = lines.join('\n')
  assert.match(joined, /york-api cli grok skipped reason=budget remaining=/)
  assert.equal(joined.includes('grok failed'), false)
})
