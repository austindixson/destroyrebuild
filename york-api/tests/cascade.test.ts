import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildAdapters } from '../src/adapters.ts'
import { cascade, type Adapter } from '../src/cascade.ts'
import { stampDeadline } from '../src/deadline.ts'
import { resetHolds, tryHold } from '../src/slots.ts'
import { CLAUDE_BUDGET_MS, CODEX_BUDGET_MS, CURSOR_BUDGET_MS, GROK_BUDGET_MS, roundBudgetMs, tierBudgetMs } from '../src/adapters.ts'
import { claudeArgs, codexArgs, codexLaunchArgsOk, cursorArgs, grokArgs, grokLaunchArgsOk, GROK_MODEL } from '../src/providers.ts'
import type { LlmRequest } from '../src/types.ts'

const req: LlmRequest = { system: 'sys', user: 'user' }

function adapter(id: string, model: string, complete: Adapter['complete'], enabled = true, budgetMs?: number, limit?: number): Adapter {
  return { id, model, enabled: () => enabled, complete, budgetMs, limit }
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
  assert.equal(CLAUDE_BUDGET_MS, 10_000)
  assert.equal(CURSOR_BUDGET_MS, 50_000)
  assert.equal(CODEX_BUDGET_MS, 10_000)
  assert.ok(GROK_BUDGET_MS + CLAUDE_BUDGET_MS + CURSOR_BUDGET_MS <= 135_000)
  const off = tierBudgetMs({})
  assert.deepEqual(off, { grok: 75_000, claude: 10_000, cursor: 50_000, codex: 10_000 })
  const on = tierBudgetMs({ YORK_CODEX: '1' })
  assert.deepEqual(on, { grok: 65_000, claude: 10_000, cursor: 50_000, codex: 10_000 })
  assert.ok(on.grok + on.claude + on.cursor + on.codex <= 135_000)
  const runner = {
    async run() {
      return { code: 0, stdout: 'The hall is stable.', stderr: '' }
    },
  }
  const adapters = buildAdapters({ YORK_SANDBOX: 'ready' }, runner)
  assert.deepEqual(adapters.map((item) => item.id), ['grok', 'claude', 'cursor', 'codex'])
  assert.equal(adapters[0]?.budgetMs, 75_000)
  assert.equal(adapters[2]?.budgetMs, 50_000)
  assert.equal(adapters[0]?.limit, 2)
  assert.equal(adapters[1]?.limit, 3)
  assert.equal(adapters[2]?.limit, 1)
  assert.equal(adapters[3]?.limit, 1)
  assert.equal(buildAdapters({ YORK_CURSOR_CONCURRENCY: '4' }, runner)[2]?.limit, 4)
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
        }, true, 65_000),
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

test('round 0 still skips grok when that start would leave cursor short', async () => {
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 100_000)
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
        }, true, 10_000),
        adapter('cursor', 'auto', async () => {
          calls.push('cursor')
          return 'The hall is stable.'
        }, true, 50_000, 1),
      ],
      req,
      controller.signal,
    )
    assert.equal(result.provider, 'claude')
    assert.deepEqual(calls, ['claude'])
  } finally {
    console.log = log
  }
  assert.match(lines.join('\n'), /york-api cli grok skipped reason=budget remaining=/)
})

test('claude runs after a grok timeout when the time left covers claude', async () => {
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 59_700)
  const calls: string[] = []
  const result = await cascade(
    [
      adapter('grok', GROK_MODEL, async () => {
        calls.push('grok')
        return 'no'
      }, true, 75_000),
      adapter('claude', 'claude-haiku-5-5', async () => {
        calls.push('claude')
        return 'The hall is stable.'
      }, true, 10_000),
      adapter('cursor', 'auto', async () => {
        calls.push('cursor')
        return 'cursor'
      }, true, 50_000, 1),
    ],
    req,
    controller.signal,
  )
  assert.equal(result.provider, 'claude')
  assert.deepEqual(calls, ['claude'])
})

test('claude still runs when the cursor slot is full', async () => {
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 8_000)
  assert.equal(tryHold('cursor', 1), true)
  const calls: string[] = []
  try {
    const result = await cascade(
      [
        adapter('grok', GROK_MODEL, async () => {
          calls.push('grok')
          return 'no'
        }, true, 75_000, 2),
        adapter('claude', 'claude-haiku-5-5', async () => {
          calls.push('claude')
          return 'The hall is stable.'
        }, true, 10_000, 3),
        adapter('cursor', 'auto', async () => {
          calls.push('cursor')
          return 'cursor'
        }, true, 50_000, 1),
      ],
      req,
      controller.signal,
    )
    assert.equal(result.provider, 'claude')
    assert.deepEqual(calls, ['claude'])
  } finally {
    resetHolds()
  }
})

test('claude is skipped only when the time left is under its budget', async () => {
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 8_000)
  const calls: string[] = []
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  try {
    await assert.rejects(
      () => cascade(
        [
          adapter('claude', 'claude-haiku-5-5', async () => {
            calls.push('claude')
            return 'The hall is stable.'
          }, true, 10_000),
          adapter('cursor', 'auto', async () => {
            calls.push('cursor')
            return 'The hall is stable.'
          }, true, 50_000, 1),
        ],
        req,
        controller.signal,
      ),
      /no provider/,
    )
  } finally {
    console.log = log
  }
  assert.deepEqual(calls, [])
  assert.match(lines.join('\n'), /york-api cli claude skipped reason=budget remaining=/)
})

test('an open case calls claude before grok', async () => {
  const calls: string[] = []
  const result = await cascade(
    [
      adapter('grok', GROK_MODEL, async () => {
        calls.push('grok')
        return 'The hall is stable.'
      }),
      adapter('claude', 'claude-haiku-5-5', async () => {
        calls.push('claude')
        return 'The hall is stable.'
      }),
      adapter('cursor', 'auto', async () => {
        calls.push('cursor')
        return 'The hall is stable.'
      }),
    ],
    { system: 'sys', user: 'user', openCase: true },
    new AbortController().signal,
  )
  assert.equal(result.provider, 'claude')
  assert.deepEqual(calls, ['claude'])
})

test('a follow-up round keeps the time left and does not apply the tier budget again', async () => {
  const open = new AbortController()
  assert.equal(roundBudgetMs(open.signal, 65_000, 0), 65_000)
  assert.equal(roundBudgetMs(open.signal, 65_000, undefined), 65_000)
  const follow = new AbortController()
  stampDeadline(follow.signal, Date.now() + 30_000)
  const left = roundBudgetMs(follow.signal, 65_000, 1)
  assert.ok(left <= 30_000)
  assert.ok(left > 25_000)
  const calls: string[] = []
  const result = await cascade(
    [
      adapter('grok', GROK_MODEL, async () => {
        calls.push('grok')
        return '{"answer":"The hall is stable.","tools":[]}'
      }, true, 65_000),
    ],
    { system: 'sys', user: 'user', round: 1 },
    follow.signal,
  )
  assert.equal(result.provider, 'grok')
  assert.deepEqual(calls, ['grok'])
})

test('a follow-up launch uses the request time left', async () => {
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 250)
  const adapters = buildAdapters({}, {
    async run(_cmd, _args, _input, _env, signal) {
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve()
        else signal.addEventListener('abort', () => resolve(), { once: true })
      })
      return { code: 1, stdout: '', stderr: '' }
    },
  })
  const grok = adapters[0]
  if (!grok) throw new Error('missing grok')
  await assert.rejects(
    () => grok.complete({ system: 's', user: 'u', round: 1 }, controller.signal),
    (err: unknown) => {
      const message = err instanceof Error ? err.message : ''
      const ms = Number(message.replace('timeout budget=', ''))
      return message.startsWith('timeout budget=') && ms > 0 && ms < 5_000
    },
  )
})

const TOOL_PROSE = 'I will read the alarms and the action log.'

test('prose that announces a tool is asked once more, then the next tier', async () => {
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 135_000)
  let calls = 0
  const result = await cascade(
    [
      adapter('grok', GROK_MODEL, async () => {
        calls += 1
        return TOOL_PROSE
      }, true, 65_000),
      adapter('claude', 'claude-haiku-5-5', async () => '{"answer":"The hall is stable.","cites":[],"tools":[]}'),
    ],
    req,
    controller.signal,
  )
  assert.equal(calls, 2)
  assert.equal(result.provider, 'claude')
  assert.equal(result.text, '{"answer":"The hall is stable.","cites":[],"tools":[]}')
})

test('a prose tool announcement skips the reask when the budget is already short', async () => {
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 135_000)
  let calls = 0
  const result = await cascade(
    [
      adapter('grok', GROK_MODEL, async (_req, signal) => {
        calls += 1
        stampDeadline(signal, Date.now() + 500)
        return TOOL_PROSE
      }, true, 65_000),
      adapter('claude', 'claude-haiku-5-5', async () => '{"answer":"The hall is stable.","cites":[],"tools":[]}'),
    ],
    req,
    controller.signal,
  )
  assert.equal(calls, 1)
  assert.equal(result.provider, 'claude')
})

test('a tier at its concurrency cap is skipped', async () => {
  let open!: () => void
  const gate = new Promise<void>((resolve) => {
    open = resolve
  })
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  let cursorCalls = 0
  const cursor = adapter('slot-cursor', 'auto', async () => {
    cursorCalls += 1
    started()
    await gate
    return '{"answer":"The hall is stable.","cites":[],"tools":[]}'
  }, true, 50_000, 1)
  const claude = adapter('claude-next', 'claude-haiku-5-5', async () => '{"answer":"Claude answered.","cites":[],"tools":[]}', true, 20_000, 3)
  const signal = new AbortController().signal
  const first = cascade([cursor, claude], req, signal)
  await ready
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  try {
    const second = await cascade([cursor, claude], req, signal)
    assert.equal(second.provider, 'claude-next')
    assert.equal(cursorCalls, 1)
    assert.match(lines.join('\n'), /york-api cli slot-cursor skipped reason=busy/)
  } finally {
    console.log = log
    open()
    await first
  }
})
