import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildAdapters, continueTier, priorTimeouts } from '../src/adapters.ts'
import { FOLLOW_CLAUDE_MS, LAST_TIER_FLOOR_MS, cascade, type Adapter } from '../src/cascade.ts'
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
  assert.equal(GROK_BUDGET_MS, 70_000)
  assert.equal(CLAUDE_BUDGET_MS, 15_000)
  assert.equal(CURSOR_BUDGET_MS, 50_000)
  assert.equal(CODEX_BUDGET_MS, 10_000)
  assert.ok(GROK_BUDGET_MS + CLAUDE_BUDGET_MS + CURSOR_BUDGET_MS <= 135_000)
  assert.ok(GROK_BUDGET_MS + CLAUDE_BUDGET_MS + LAST_TIER_FLOOR_MS < 135_000)
  assert.equal(LAST_TIER_FLOOR_MS, 40_000)
  const off = tierBudgetMs({})
  assert.deepEqual(off, { grok: 70_000, claude: 15_000, cursor: 50_000, codex: 10_000 })
  const on = tierBudgetMs({ YORK_CODEX: '1' })
  assert.deepEqual(on, { grok: 60_000, claude: 15_000, cursor: 50_000, codex: 10_000 })
  assert.ok(on.grok + on.claude + on.cursor + on.codex <= 135_000)
  const runner = {
    async run() {
      return { code: 0, stdout: 'The hall is stable.', stderr: '' }
    },
  }
  const adapters = buildAdapters({ YORK_SANDBOX: 'ready' }, runner)
  assert.deepEqual(adapters.map((item) => item.id), ['grok', 'claude', 'cursor', 'codex'])
  assert.equal(adapters[0]?.budgetMs, 70_000)
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

test('cursor runs when 49503 ms remain and it is the last tier', async () => {
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 49_503)
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
          return 'The hall is stable.'
        }, true, GROK_BUDGET_MS),
        adapter('cursor', 'auto', async () => {
          calls.push('cursor')
          return 'The hall is stable.'
        }, true, CURSOR_BUDGET_MS),
      ],
      req,
      controller.signal,
    )
    assert.equal(result.provider, 'cursor')
    assert.equal(calls.includes('cursor'), true)
    assert.equal(calls.includes('grok'), false)
  } finally {
    console.log = log
  }
  assert.equal(lines.join('\n').includes('cursor skipped'), false)
})

test('the last tier stays skipped when fewer than 40 s remain', async () => {
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 39_000)
  const calls: string[] = []
  await assert.rejects(
    () => cascade(
      [
        adapter('cursor', 'auto', async () => {
          calls.push('cursor')
          return 'The hall is stable.'
        }, true, CURSOR_BUDGET_MS),
      ],
      req,
      controller.signal,
    ),
    /no provider/,
  )
  assert.deepEqual(calls, [])
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

test('run 13 starts the follow-up on claude and skips grok after its timeout', async () => {
  const calls: string[] = []
  const round0 = new AbortController()
  stampDeadline(round0.signal, Date.now() + 135_000)
  const make = (run: (id: string) => Promise<string>) => [
    adapter('grok', GROK_MODEL, () => run('grok'), true, GROK_BUDGET_MS),
    adapter('claude', 'claude-haiku-5-5', () => run('claude'), true, CLAUDE_BUDGET_MS),
    adapter('cursor', 'auto', () => run('cursor'), true, CURSOR_BUDGET_MS),
  ]
  const first = await cascade(
    make(async (id) => {
      calls.push(id)
      if (id === 'grok') throw new Error('timeout budget=70000')
      return '{"answer":"","tools":[{"name":"plant.getAlarms","args":{}}]}'
    }),
    { system: 'sys', user: 'user', round: 0 },
    round0.signal,
  )
  assert.equal(first.provider, 'claude')
  assert.deepEqual(first.timedOut, ['grok'])
  assert.deepEqual(calls, ['grok', 'claude'])
  calls.length = 0
  const round1 = new AbortController()
  stampDeadline(round1.signal, Date.now() + 60_000)
  const second = await cascade(
    make(async (id) => {
      calls.push(id)
      return '{"answer":"The hall is stable.","cites":[]}'
    }),
    { system: 'sys', user: 'user', round: 1, tier: first.provider, timedOut: first.timedOut },
    round1.signal,
  )
  assert.equal(second.provider, 'claude')
  assert.deepEqual(calls, ['claude'])
  const room = roundBudgetMs(round1.signal, CLAUDE_BUDGET_MS, 1, 'claude')
  assert.ok(room > 58_000)
  assert.ok(room <= 59_000)
  assert.equal(roundBudgetMs(round1.signal, GROK_BUDGET_MS, 1, 'grok'), 0)
})

test('run 14 skips grok and cursor when 14700 ms remain after claude', async () => {
  const calls: string[] = []
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 73_000)
  let lead = 0
  await assert.rejects(
    () => cascade(
      [
        adapter('grok', GROK_MODEL, async () => {
          calls.push('grok')
          return 'The hall is stable.'
        }, true, GROK_BUDGET_MS),
        adapter('claude', 'claude-haiku-5-5', async (_req, signal) => {
          calls.push('claude')
          lead = roundBudgetMs(signal, CLAUDE_BUDGET_MS, 1, 'claude')
          stampDeadline(signal, Date.now() + 14_700)
          throw new Error(`timeout budget=${lead}`)
        }, true, CLAUDE_BUDGET_MS),
        adapter('cursor', 'auto', async () => {
          calls.push('cursor')
          return 'The hall is stable.'
        }, true, CURSOR_BUDGET_MS),
      ],
      { system: 'sys', user: 'user', round: 1, tier: 'grok' },
      controller.signal,
    ),
    (err: unknown) => err instanceof Error && err.message === `timeout budget=${lead}`,
  )
  assert.ok(lead > 71_000)
  assert.ok(lead <= 72_000)
  assert.deepEqual(calls, ['claude'])
  assert.equal(roundBudgetMs(controller.signal, CURSOR_BUDGET_MS, 1, 'cursor'), 0)
  assert.equal(roundBudgetMs(controller.signal, GROK_BUDGET_MS, 1, 'grok'), 0)
})

test('run 15 starts on claude and runs cursor only when 50 s remain', async () => {
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  try {
    const short = new AbortController()
    stampDeadline(short.signal, Date.now() + 58_000)
    const shortCalls: string[] = []
    let shortLead = 0
    await assert.rejects(
      () => cascade(
        [
          adapter('grok', GROK_MODEL, async () => {
            shortCalls.push('grok')
            return 'The hall is stable.'
          }, true, GROK_BUDGET_MS),
          adapter('claude', 'claude-haiku-5-5', async (_req, signal) => {
            shortCalls.push('claude')
            shortLead = roundBudgetMs(signal, CLAUDE_BUDGET_MS, 1, 'claude')
            stampDeadline(signal, Date.now() + 1_000)
            throw new Error(`timeout budget=${shortLead}`)
          }, true, CLAUDE_BUDGET_MS),
          adapter('cursor', 'auto', async () => {
            shortCalls.push('cursor')
            return 'The hall is stable.'
          }, true, CURSOR_BUDGET_MS),
        ],
        { system: 'sys', user: 'user', round: 1, tier: 'claude' },
        short.signal,
      ),
      (err: unknown) => err instanceof Error && err.message === `timeout budget=${shortLead}`,
    )
    assert.ok(shortLead > 56_000)
    assert.ok(shortLead <= 57_000)
    assert.deepEqual(shortCalls, ['claude'])
    const cursorRoom = new AbortController()
    stampDeadline(cursorRoom.signal, Date.now() + 82_000)
    const cursorCalls: string[] = []
    const rescued = await cascade(
      [
        adapter('grok', GROK_MODEL, async () => {
          cursorCalls.push('grok')
          return 'The hall is stable.'
        }, true, GROK_BUDGET_MS),
        adapter('claude', 'claude-haiku-5-5', async (_req, signal) => {
          cursorCalls.push('claude')
          assert.equal(roundBudgetMs(signal, CLAUDE_BUDGET_MS, 1, 'claude'), FOLLOW_CLAUDE_MS)
          stampDeadline(signal, Date.now() + 52_000)
          throw new Error('timeout budget=30000')
        }, true, CLAUDE_BUDGET_MS),
        adapter('cursor', 'auto', async () => {
          cursorCalls.push('cursor')
          return 'The hall is stable.'
        }, true, CURSOR_BUDGET_MS),
      ],
      { system: 'sys', user: 'user', round: 1, tier: 'grok' },
      cursorRoom.signal,
    )
    assert.equal(rescued.provider, 'cursor')
    assert.deepEqual(cursorCalls, ['claude', 'cursor'])
    const answered = new AbortController()
    stampDeadline(answered.signal, Date.now() + 80_000)
    const answerCalls: string[] = []
    const done = await cascade(
      [
        adapter('grok', GROK_MODEL, async () => {
          answerCalls.push('grok')
          return 'The hall is stable.'
        }, true, GROK_BUDGET_MS),
        adapter('claude', 'claude-haiku-5-5', async () => {
          answerCalls.push('claude')
          return 'The hall is stable.'
        }, true, CLAUDE_BUDGET_MS),
        adapter('cursor', 'auto', async () => {
          answerCalls.push('cursor')
          return 'The hall is stable.'
        }, true, CURSOR_BUDGET_MS),
      ],
      { system: 'sys', user: 'user', round: 1, tier: 'grok' },
      answered.signal,
    )
    assert.equal(done.provider, 'claude')
    assert.deepEqual(answerCalls, ['claude'])
  } finally {
    console.log = log
  }
  assert.match(lines.join('\n'), /york-api follow tier=grok/)
})

test('run 16 keeps claude at 15 s when cursor still fits after a grok timeout', async () => {
  const calls: string[] = []
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 140_000)
  const result = await cascade(
    [
      adapter('grok', GROK_MODEL, async (_req, signal) => {
        calls.push('grok')
        stampDeadline(signal, Date.now() + 66_000)
        throw new Error('timeout budget=70000')
      }, true, GROK_BUDGET_MS),
      adapter('claude', 'claude-haiku-5-5', async (_req, signal) => {
        calls.push('claude')
        assert.equal(roundBudgetMs(signal, CLAUDE_BUDGET_MS, 0, 'claude'), CLAUDE_BUDGET_MS)
        stampDeadline(signal, Date.now() + 51_000)
        throw new Error('timeout budget=15000')
      }, true, CLAUDE_BUDGET_MS),
      adapter('cursor', 'auto', async () => {
        calls.push('cursor')
        return 'The hall is stable.'
      }, true, CURSOR_BUDGET_MS),
    ],
    { system: 'sys', user: 'user', round: 0 },
    controller.signal,
  )
  assert.equal(result.provider, 'cursor')
  assert.deepEqual(calls, ['grok', 'claude', 'cursor'])
})

test('run 17 gives claude the time left when cursor cannot fit after a grok timeout', async () => {
  const calls: string[] = []
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 140_000)
  let lead = 0
  try {
    await assert.rejects(
      () => cascade(
        [
          adapter('grok', GROK_MODEL, async (_req, signal) => {
            calls.push('grok')
            stampDeadline(signal, Date.now() + 64_000)
            throw new Error('timeout budget=70000')
          }, true, GROK_BUDGET_MS),
          adapter('claude', 'claude-haiku-5-5', async (_req, signal) => {
            calls.push('claude')
            lead = roundBudgetMs(signal, CLAUDE_BUDGET_MS, 0, 'claude')
            throw new Error(`timeout budget=${lead}`)
          }, true, CLAUDE_BUDGET_MS),
          adapter('cursor', 'auto', async () => {
            calls.push('cursor')
            return 'The hall is stable.'
          }, true, CURSOR_BUDGET_MS),
        ],
        { system: 'sys', user: 'user', round: 0 },
        controller.signal,
      ),
      (err: unknown) => err instanceof Error && err.message === `timeout budget=${lead}`,
    )
  } finally {
    console.log = log
  }
  assert.ok(lead > 62_000)
  assert.ok(lead <= 63_000)
  assert.deepEqual(calls, ['grok', 'claude'])
  assert.match(lines.join('\n'), /york-api cli cursor skipped reason=budget remaining=/)
})

test('run 18 gives a follow-up claude the time left when the 30 s cap leaves no later tier', async () => {
  const calls: string[] = []
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 65_000)
  let lead = 0
  await assert.rejects(
    () => cascade(
      [
        adapter('grok', GROK_MODEL, async () => {
          calls.push('grok')
          return 'The hall is stable.'
        }, true, GROK_BUDGET_MS),
        adapter('claude', 'claude-haiku-5-5', async (_req, signal) => {
          calls.push('claude')
          lead = roundBudgetMs(signal, CLAUDE_BUDGET_MS, 1, 'claude')
          stampDeadline(signal, Date.now() + 1_000)
          throw new Error(`timeout budget=${lead}`)
        }, true, CLAUDE_BUDGET_MS),
        adapter('cursor', 'auto', async () => {
          calls.push('cursor')
          return 'The hall is stable.'
        }, true, CURSOR_BUDGET_MS),
      ],
      { system: 'sys', user: 'user', round: 1, tier: 'claude' },
      controller.signal,
    ),
    (err: unknown) => err instanceof Error && err.message === `timeout budget=${lead}`,
  )
  assert.ok(lead > 63_000)
  assert.ok(lead <= 64_000)
  assert.deepEqual(calls, ['claude'])
})

test('a follow-up tier must be known and cannot override the only-tier header', () => {
  assert.equal(continueTier('claude', null), 'claude')
  assert.equal(continueTier('shell', null), undefined)
  assert.equal(continueTier('grok', 'claude'), undefined)
  assert.equal(continueTier('claude', 'claude'), 'claude')
  assert.deepEqual(priorTimeouts(['grok', 'nope', 'grok']), ['grok'])
})

test('round 0 ignores a client tier and a follow-up still falls through', async () => {
  const calls: string[] = []
  const open = new AbortController()
  stampDeadline(open.signal, Date.now() + 135_000)
  const first = await cascade(
    [
      adapter('grok', GROK_MODEL, async () => {
        calls.push('grok')
        return 'The hall is stable.'
      }, true, GROK_BUDGET_MS),
      adapter('claude', 'claude-haiku-5-5', async () => {
        calls.push('claude')
        return 'The hall is stable.'
      }, true, CLAUDE_BUDGET_MS),
    ],
    { system: 'sys', user: 'user', round: 0, tier: 'claude' },
    open.signal,
  )
  assert.equal(first.provider, 'grok')
  assert.deepEqual(calls, ['grok'])
  calls.length = 0
  const follow = new AbortController()
  stampDeadline(follow.signal, Date.now() + 135_000)
  const second = await cascade(
    [
      adapter('grok', GROK_MODEL, async () => {
        calls.push('grok')
        throw new Error('empty')
      }, true, GROK_BUDGET_MS),
      adapter('cursor', 'auto', async () => {
        calls.push('cursor')
        return 'The hall is stable.'
      }, true, CURSOR_BUDGET_MS),
    ],
    { system: 'sys', user: 'user', round: 1, tier: 'cursor' },
    follow.signal,
  )
  assert.equal(second.provider, 'cursor')
  assert.deepEqual(calls, ['grok', 'cursor'])
})

test('a follow-up runs a later tier only when its full budget fits', async () => {
  const wide = new AbortController()
  stampDeadline(wide.signal, Date.now() + 135_000)
  const wideCalls: string[] = []
  const held = await cascade(
    [
      adapter('grok', GROK_MODEL, async () => {
        wideCalls.push('grok')
        throw new Error('timeout budget=70000')
      }, true, GROK_BUDGET_MS),
      adapter('claude', 'claude-haiku-5-5', async () => {
        wideCalls.push('claude')
        throw new Error('timeout budget=30000')
      }, true, CLAUDE_BUDGET_MS),
      adapter('cursor', 'auto', async () => {
        wideCalls.push('cursor')
        return 'The hall is stable.'
      }, true, CURSOR_BUDGET_MS),
    ],
    { system: 'sys', user: 'user', round: 1 },
    wide.signal,
  )
  assert.equal(held.provider, 'cursor')
  assert.deepEqual(wideCalls, ['claude', 'grok', 'cursor'])
  const mid = new AbortController()
  stampDeadline(mid.signal, Date.now() + 55_000)
  const midCalls: string[] = []
  const cursorOnly = await cascade(
    [
      adapter('grok', GROK_MODEL, async () => {
        midCalls.push('grok')
        return 'The hall is stable.'
      }, true, GROK_BUDGET_MS),
      adapter('claude', 'claude-haiku-5-5', async () => {
        midCalls.push('claude')
        throw new Error('timeout budget=30000')
      }, true, CLAUDE_BUDGET_MS),
      adapter('cursor', 'auto', async () => {
        midCalls.push('cursor')
        return 'The hall is stable.'
      }, true, CURSOR_BUDGET_MS),
    ],
    { system: 'sys', user: 'user', round: 1 },
    mid.signal,
  )
  assert.equal(cursorOnly.provider, 'cursor')
  assert.deepEqual(midCalls, ['claude', 'cursor'])
  const tight = new AbortController()
  stampDeadline(tight.signal, Date.now() + 12_000)
  const tightCalls: string[] = []
  const rescued = await cascade(
    [
      adapter('grok', GROK_MODEL, async () => {
        tightCalls.push('grok')
        return 'The hall is stable.'
      }, true, GROK_BUDGET_MS),
      adapter('claude', 'claude-haiku-5-5', async () => {
        tightCalls.push('claude')
        return 'The hall is stable.'
      }, true, CLAUDE_BUDGET_MS),
      adapter('cursor', 'auto', async () => {
        tightCalls.push('cursor')
        return 'The hall is stable.'
      }, true, CURSOR_BUDGET_MS),
    ],
    { system: 'sys', user: 'user', round: 1, tier: 'grok' },
    tight.signal,
  )
  assert.equal(rescued.provider, 'claude')
  assert.deepEqual(tightCalls, ['claude'])
  const room = roundBudgetMs(tight.signal, CLAUDE_BUDGET_MS, 1, 'claude')
  assert.ok(room <= 11_000)
  assert.ok(room > 10_000)
})

test('a follow-up gives claude the time left and skips a tier whose full budget does not fit', async () => {
  const open = new AbortController()
  assert.equal(roundBudgetMs(open.signal, 65_000, 0), 65_000)
  assert.equal(roundBudgetMs(open.signal, 65_000, 0, 'claude'), 65_000)
  assert.equal(roundBudgetMs(open.signal, 65_000, undefined), 65_000)
  assert.equal(roundBudgetMs(open.signal, 65_000, 1, 'grok'), 65_000)
  assert.equal(roundBudgetMs(open.signal, CLAUDE_BUDGET_MS, 1, 'claude'), FOLLOW_CLAUDE_MS)
  const follow = new AbortController()
  stampDeadline(follow.signal, Date.now() + 30_000)
  assert.equal(roundBudgetMs(follow.signal, 65_000, 1, 'grok'), 0)
  const claudeRoom = roundBudgetMs(follow.signal, CLAUDE_BUDGET_MS, 1, 'claude')
  assert.ok(claudeRoom <= 29_000)
  assert.ok(claudeRoom > 28_000)
  const calls: string[] = []
  const grok = adapter('grok', GROK_MODEL, async () => {
    calls.push('grok')
    return '{"answer":"The hall is stable.","tools":[]}'
  }, true, 65_000)
  await assert.rejects(() => cascade([grok], { system: 'sys', user: 'user', round: 1 }, follow.signal), /no provider/)
  assert.deepEqual(calls, [])
  const roomy = new AbortController()
  stampDeadline(roomy.signal, Date.now() + 70_000)
  const result = await cascade([grok], { system: 'sys', user: 'user', round: 1 }, roomy.signal)
  assert.equal(result.provider, 'grok')
  assert.deepEqual(calls, ['grok'])
})

test('a follow-up launch uses the claude cap and skips a short grok budget', async () => {
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
  const claude = adapters[1]
  if (!grok || !claude) throw new Error('missing tier')
  const budgetOf = (err: unknown) => {
    const message = err instanceof Error ? err.message : ''
    return { message, ms: Number(message.replace('timeout budget=', '')) }
  }
  const claudeDeadline = new AbortController()
  stampDeadline(claudeDeadline.signal, Date.now() + 1_200)
  await assert.rejects(
    () => claude.complete({ system: 's', user: 'u', round: 1 }, claudeDeadline.signal),
    (err: unknown) => {
      const { message, ms } = budgetOf(err)
      return message.startsWith('timeout budget=') && ms > 0 && ms < 1_000
    },
  )
  const grokDeadline = new AbortController()
  stampDeadline(grokDeadline.signal, Date.now() + 8_000)
  await assert.rejects(
    () => grok.complete({ system: 's', user: 'u', round: 1 }, grokDeadline.signal),
    (err: unknown) => {
      const { message, ms } = budgetOf(err)
      return message.startsWith('timeout budget=') && ms === 0
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
