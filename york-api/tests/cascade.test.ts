import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildAdapters, continueTier, priorTimeouts } from '../src/adapters.ts'
import { FOLLOW_GROK_MS, LAST_TIER_FLOOR_MS, cascade, type Adapter } from '../src/cascade.ts'
import { stampDeadline } from '../src/deadline.ts'
import { resetHolds, tryHold } from '../src/slots.ts'
import { CODEX_BUDGET_MS, CURSOR_BUDGET_MS, GROK_BUDGET_MS, roundBudgetMs, tierBudgetMs } from '../src/adapters.ts'
import { codexArgs, codexLaunchArgsOk, cursorArgs, grokArgs, grokLaunchArgsOk, GROK_MODEL } from '../src/providers.ts'
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
      adapter('spare', 'spare', async () => {
        calls.push('spare')
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
  assert.deepEqual(calls, ['grok', 'spare', 'cursor'])
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
  assert.equal(GROK_BUDGET_MS, 90_000)
  assert.equal(CURSOR_BUDGET_MS, 40_000)
  assert.equal(CODEX_BUDGET_MS, 10_000)
  assert.equal(FOLLOW_GROK_MS, 40_000)
  assert.ok(GROK_BUDGET_MS + CURSOR_BUDGET_MS <= 135_000)
  assert.ok(GROK_BUDGET_MS + CURSOR_BUDGET_MS < 135_000)
  assert.equal(LAST_TIER_FLOOR_MS, 40_000)
  const off = tierBudgetMs({})
  assert.deepEqual(off, { grok: 90_000, cursor: 40_000, codex: 10_000 })
  const on = tierBudgetMs({ YORK_CODEX: '1' })
  assert.deepEqual(on, { grok: 80_000, cursor: 40_000, codex: 10_000 })
  assert.ok(on.grok + on.cursor + on.codex <= 135_000)
  const runner = {
    async run() {
      return { code: 0, stdout: 'The hall is stable.', stderr: '' }
    },
  }
  const adapters = buildAdapters({ YORK_SANDBOX: 'ready' }, runner)
  assert.deepEqual(adapters.map((item) => item.id), ['grok', 'cursor', 'codex'])
  assert.equal(adapters[0]?.budgetMs, 90_000)
  assert.equal(adapters[1]?.budgetMs, 40_000)
  assert.equal(adapters[0]?.limit, 2)
  assert.equal(adapters[1]?.limit, 2)
  assert.equal(adapters[2]?.limit, 1)
  assert.equal(buildAdapters({ YORK_CURSOR_CONCURRENCY: '4' }, runner)[1]?.limit, 4)
  assert.equal(adapters[0]?.enabled(), true)
  assert.equal(adapters.find((item) => item.id === 'codex')?.enabled(), false)
  assert.equal(buildAdapters({}, runner)[0]?.enabled(), true)
  assert.equal(buildAdapters({ YORK_GROK_CLI: 'unavailable' }, runner)[0]?.enabled(), false)
  const withCodex = buildAdapters({ YORK_SANDBOX: 'ready', YORK_CODEX: '1' }, runner)
  assert.equal(withCodex.find((item) => item.id === 'codex')?.enabled(), true)
})

test('cascade skips grok when that binary is missing', async () => {
  const calls: string[] = []
  const adapters = buildAdapters({ YORK_SANDBOX: 'ready', YORK_GROK_CLI: 'unavailable' }, {
    async run(cmd) {
      calls.push(cmd)
      return { code: 0, stdout: 'The hall is stable.', stderr: '' }
    },
  })
  assert.equal(adapters.find((item) => item.id === 'grok')?.enabled(), false)
  const result = await cascade(adapters, req, new AbortController().signal)
  assert.equal(result.provider, 'cursor')
  assert.deepEqual(calls, ['agent'])
})

test('cursor and codex commands use the verified model ids', () => {
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
  }, 'cursor')
  assert.equal(forced.find((item) => item.id === 'cursor')?.enabled(), true)
  assert.equal(forced.find((item) => item.id === 'grok')?.enabled(), false)
  assert.equal(forced.find((item) => item.id === 'codex')?.enabled(), false)
})

test('cascade skips a tier when the time left is below its budget', async () => {
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 50_000)
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
    assert.deepEqual(calls, ['cursor'])
  } finally {
    console.log = log
  }
  const joined = lines.join('\n')
  assert.match(joined, /york-api cli grok skipped reason=budget remaining=/)
  assert.equal(joined.includes('grok failed'), false)
})

test('round 0 still starts grok when cursor would not keep a full slot', async () => {
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
    assert.equal(result.provider, 'grok')
    assert.deepEqual(calls, ['grok'])
  } finally {
    console.log = log
  }
  assert.equal(lines.join('\n').includes('grok skipped'), false)
})

test('cursor runs after a grok miss when its full budget still fits', async () => {
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 135_000)
  const calls: string[] = []
  const result = await cascade(
    [
      adapter('grok', GROK_MODEL, async (_req, signal) => {
        calls.push('grok')
        stampDeadline(signal, Date.now() + 45_000)
        throw new Error('timeout budget=90000')
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
  assert.deepEqual(calls, ['grok', 'cursor'])
  assert.deepEqual(result.timedOut, ['grok'])
})

test('a full cursor slot does not stop grok', async () => {
  assert.equal(tryHold('cursor', 1), true)
  const calls: string[] = []
  try {
    const result = await cascade(
      [
        adapter('grok', GROK_MODEL, async () => {
          calls.push('grok')
          return 'The hall is stable.'
        }, true, GROK_BUDGET_MS, 2),
        adapter('cursor', 'auto', async () => {
          calls.push('cursor')
          return 'cursor'
        }, true, CURSOR_BUDGET_MS, 1),
      ],
      req,
      new AbortController().signal,
    )
    assert.equal(result.provider, 'grok')
    assert.deepEqual(calls, ['grok'])
  } finally {
    resetHolds()
  }
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

test('an open case still starts on grok', async () => {
  const calls: string[] = []
  const result = await cascade(
    [
      adapter('grok', GROK_MODEL, async () => {
        calls.push('grok')
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
  assert.equal(result.provider, 'grok')
  assert.deepEqual(calls, ['grok'])
})

test('a follow-up starts on grok and skips grok after its timeout', async () => {
  const calls: string[] = []
  const round0 = new AbortController()
  stampDeadline(round0.signal, Date.now() + 135_000)
  const make = (run: (id: string) => Promise<string>) => [
    adapter('grok', GROK_MODEL, () => run('grok'), true, GROK_BUDGET_MS),
    adapter('cursor', 'auto', () => run('cursor'), true, CURSOR_BUDGET_MS),
  ]
  const first = await cascade(
    make(async (id) => {
      calls.push(id)
      if (id === 'grok') throw new Error('timeout budget=90000')
      return '{"answer":"","tools":[{"name":"plant.getAlarms","args":{}}]}'
    }),
    { system: 'sys', user: 'user', round: 0 },
    round0.signal,
  )
  assert.equal(first.provider, 'cursor')
  assert.deepEqual(first.timedOut, ['grok'])
  assert.deepEqual(calls, ['grok', 'cursor'])
  calls.length = 0
  const round1 = new AbortController()
  stampDeadline(round1.signal, Date.now() + 45_000)
  const second = await cascade(
    make(async (id) => {
      calls.push(id)
      return '{"answer":"The hall is stable.","cites":[]}'
    }),
    { system: 'sys', user: 'user', round: 1, tier: first.provider, timedOut: first.timedOut },
    round1.signal,
  )
  assert.equal(second.provider, 'cursor')
  assert.deepEqual(calls, ['cursor'])
  assert.equal(roundBudgetMs(round1.signal, GROK_BUDGET_MS, 1, 'grok'), FOLLOW_GROK_MS)
  assert.equal(roundBudgetMs(round1.signal, CURSOR_BUDGET_MS, 1, 'cursor'), CURSOR_BUDGET_MS)
})

test('a follow-up skips grok and cursor when the time left is under both budgets', async () => {
  const calls: string[] = []
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 30_000)
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  try {
    await assert.rejects(
      () => cascade(
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
        { system: 'sys', user: 'user', round: 1, tier: 'grok' },
        controller.signal,
      ),
      /no provider/,
    )
  } finally {
    console.log = log
  }
  assert.deepEqual(calls, [])
  assert.equal(roundBudgetMs(controller.signal, GROK_BUDGET_MS, 1, 'grok'), 0)
  assert.equal(roundBudgetMs(controller.signal, CURSOR_BUDGET_MS, 1, 'cursor'), 0)
  assert.match(lines.join('\n'), /york-api cli grok skipped reason=budget remaining=/)
  assert.match(lines.join('\n'), /york-api cli cursor skipped reason=budget remaining=/)
})

test('a follow-up starts on grok and runs cursor only when its full budget fits', async () => {
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  try {
    const answered = new AbortController()
    stampDeadline(answered.signal, Date.now() + 80_000)
    const answerCalls: string[] = []
    const done = await cascade(
      [
        adapter('grok', GROK_MODEL, async () => {
          answerCalls.push('grok')
          return 'The hall is stable.'
        }, true, GROK_BUDGET_MS),
        adapter('cursor', 'auto', async () => {
          answerCalls.push('cursor')
          return 'The hall is stable.'
        }, true, CURSOR_BUDGET_MS),
      ],
      { system: 'sys', user: 'user', round: 1, tier: 'cursor' },
      answered.signal,
    )
    assert.equal(done.provider, 'grok')
    assert.deepEqual(answerCalls, ['grok'])
    assert.equal(roundBudgetMs(answered.signal, GROK_BUDGET_MS, 1, 'grok'), FOLLOW_GROK_MS)
    const rescued = new AbortController()
    stampDeadline(rescued.signal, Date.now() + 80_000)
    const cursorCalls: string[] = []
    const next = await cascade(
      [
        adapter('grok', GROK_MODEL, async (_req, signal) => {
          cursorCalls.push('grok')
          stampDeadline(signal, Date.now() + 50_000)
          throw new Error('timeout budget=40000')
        }, true, GROK_BUDGET_MS),
        adapter('cursor', 'auto', async () => {
          cursorCalls.push('cursor')
          return 'The hall is stable.'
        }, true, CURSOR_BUDGET_MS),
      ],
      { system: 'sys', user: 'user', round: 1, tier: 'grok' },
      rescued.signal,
    )
    assert.equal(next.provider, 'cursor')
    assert.deepEqual(cursorCalls, ['grok', 'cursor'])
    const tight = new AbortController()
    stampDeadline(tight.signal, Date.now() + 45_000)
    const tightCalls: string[] = []
    await assert.rejects(
      () => cascade(
        [
          adapter('grok', GROK_MODEL, async (_req, signal) => {
            tightCalls.push('grok')
            stampDeadline(signal, Date.now() + 1_000)
            throw new Error('timeout budget=40000')
          }, true, GROK_BUDGET_MS),
          adapter('cursor', 'auto', async () => {
            tightCalls.push('cursor')
            return 'The hall is stable.'
          }, true, CURSOR_BUDGET_MS),
        ],
        { system: 'sys', user: 'user', round: 1, tier: 'grok' },
        tight.signal,
      ),
      /timeout budget=40000/,
    )
    assert.deepEqual(tightCalls, ['grok'])
    assert.equal(roundBudgetMs(tight.signal, CURSOR_BUDGET_MS, 1, 'cursor'), 0)
  } finally {
    console.log = log
  }
  assert.match(lines.join('\n'), /york-api follow tier=cursor/)
  assert.match(lines.join('\n'), /york-api follow tier=grok/)
})

test('round 0 gives grok its budget and still runs cursor when 40 s remain', async () => {
  const calls: string[] = []
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 135_000)
  const result = await cascade(
    [
      adapter('grok', GROK_MODEL, async (_req, signal) => {
        calls.push('grok')
        stampDeadline(signal, Date.now() + 45_000)
        throw new Error('timeout budget=90000')
      }, true, GROK_BUDGET_MS),
      adapter('cursor', 'auto', async () => {
        calls.push('cursor')
        return 'The hall is stable.'
      }, true, CURSOR_BUDGET_MS),
    ],
    { system: 'sys', user: 'user', round: 0 },
    controller.signal,
  )
  assert.equal(result.provider, 'cursor')
  assert.deepEqual(calls, ['grok', 'cursor'])
  const short = new AbortController()
  stampDeadline(short.signal, Date.now() + 135_000)
  const shortCalls: string[] = []
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  try {
    await assert.rejects(
      () => cascade(
        [
          adapter('grok', GROK_MODEL, async (_req, signal) => {
            shortCalls.push('grok')
            stampDeadline(signal, Date.now() + 30_000)
            throw new Error('timeout budget=90000')
          }, true, GROK_BUDGET_MS),
          adapter('cursor', 'auto', async () => {
            shortCalls.push('cursor')
            return 'The hall is stable.'
          }, true, CURSOR_BUDGET_MS),
        ],
        { system: 'sys', user: 'user', round: 0 },
        short.signal,
      ),
      /timeout budget=90000/,
    )
  } finally {
    console.log = log
  }
  assert.deepEqual(shortCalls, ['grok'])
  assert.match(lines.join('\n'), /york-api cli cursor skipped reason=budget remaining=/)
})

test('a follow-up tier must be known and cannot override the only-tier header', () => {
  assert.equal(continueTier('cursor', null), 'cursor')
  assert.equal(continueTier('claude', null), undefined)
  assert.equal(continueTier('shell', null), undefined)
  assert.equal(continueTier('grok', 'cursor'), undefined)
  assert.equal(continueTier('cursor', 'cursor'), 'cursor')
  assert.deepEqual(priorTimeouts(['grok', 'nope', 'grok', 'claude']), ['grok'])
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
      adapter('cursor', 'auto', async () => {
        calls.push('cursor')
        return 'The hall is stable.'
      }, true, CURSOR_BUDGET_MS),
    ],
    { system: 'sys', user: 'user', round: 0, tier: 'cursor' },
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
        throw new Error('timeout budget=90000')
      }, true, GROK_BUDGET_MS),
      adapter('cursor', 'auto', async () => {
        wideCalls.push('cursor')
        return 'The hall is stable.'
      }, true, CURSOR_BUDGET_MS),
    ],
    { system: 'sys', user: 'user', round: 1 },
    wide.signal,
  )
  assert.equal(held.provider, 'cursor')
  assert.deepEqual(wideCalls, ['grok', 'cursor'])
  const mid = new AbortController()
  stampDeadline(mid.signal, Date.now() + 50_000)
  const midCalls: string[] = []
  const both = await cascade(
    [
      adapter('grok', GROK_MODEL, async () => {
        midCalls.push('grok')
        throw new Error('empty')
      }, true, GROK_BUDGET_MS),
      adapter('cursor', 'auto', async () => {
        midCalls.push('cursor')
        return 'The hall is stable.'
      }, true, CURSOR_BUDGET_MS),
    ],
    { system: 'sys', user: 'user', round: 1 },
    mid.signal,
  )
  assert.equal(both.provider, 'cursor')
  assert.deepEqual(midCalls, ['grok', 'cursor'])
  const tight = new AbortController()
  stampDeadline(tight.signal, Date.now() + 30_000)
  const tightCalls: string[] = []
  await assert.rejects(
    () => cascade(
      [
        adapter('grok', GROK_MODEL, async () => {
          tightCalls.push('grok')
          return 'The hall is stable.'
        }, true, GROK_BUDGET_MS),
        adapter('cursor', 'auto', async () => {
          tightCalls.push('cursor')
          return 'The hall is stable.'
        }, true, CURSOR_BUDGET_MS),
      ],
      { system: 'sys', user: 'user', round: 1, tier: 'grok' },
      tight.signal,
    ),
    /no provider/,
  )
  assert.deepEqual(tightCalls, [])
})

test('a follow-up grok uses the short cap and skips when that cap does not fit', async () => {
  const open = new AbortController()
  assert.equal(roundBudgetMs(open.signal, GROK_BUDGET_MS, 0, 'grok'), GROK_BUDGET_MS)
  assert.equal(roundBudgetMs(open.signal, 65_000, 0), 65_000)
  assert.equal(roundBudgetMs(open.signal, 65_000, undefined), 65_000)
  assert.equal(roundBudgetMs(open.signal, GROK_BUDGET_MS, 1, 'grok'), FOLLOW_GROK_MS)
  assert.equal(roundBudgetMs(open.signal, CURSOR_BUDGET_MS, 1, 'cursor'), CURSOR_BUDGET_MS)
  const follow = new AbortController()
  stampDeadline(follow.signal, Date.now() + 30_000)
  assert.equal(roundBudgetMs(follow.signal, GROK_BUDGET_MS, 1, 'grok'), 0)
  assert.equal(roundBudgetMs(follow.signal, CURSOR_BUDGET_MS, 1, 'cursor'), 0)
  const calls: string[] = []
  const grok = adapter('grok', GROK_MODEL, async () => {
    calls.push('grok')
    return '{"answer":"The hall is stable.","tools":[]}'
  }, true, GROK_BUDGET_MS)
  await assert.rejects(() => cascade([grok], { system: 'sys', user: 'user', round: 1 }, follow.signal), /no provider/)
  assert.deepEqual(calls, [])
  const roomy = new AbortController()
  stampDeadline(roomy.signal, Date.now() + 70_000)
  const result = await cascade([grok], { system: 'sys', user: 'user', round: 1 }, roomy.signal)
  assert.equal(result.provider, 'grok')
  assert.deepEqual(calls, ['grok'])
  assert.equal(roundBudgetMs(roomy.signal, GROK_BUDGET_MS, 1, 'grok'), FOLLOW_GROK_MS)
})

test('a follow-up launch skips a tier whose full budget does not fit', async () => {
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
  const cursor = adapters[1]
  if (!grok || !cursor) throw new Error('missing tier')
  const budgetOf = (err: unknown) => {
    const message = err instanceof Error ? err.message : ''
    return { message, ms: Number(message.replace('timeout budget=', '')) }
  }
  const grokDeadline = new AbortController()
  stampDeadline(grokDeadline.signal, Date.now() + 8_000)
  await assert.rejects(
    () => grok.complete({ system: 's', user: 'u', round: 1 }, grokDeadline.signal),
    (err: unknown) => {
      const { message, ms } = budgetOf(err)
      return message.startsWith('timeout budget=') && ms === 0
    },
  )
  const cursorDeadline = new AbortController()
  stampDeadline(cursorDeadline.signal, Date.now() + 8_000)
  await assert.rejects(
    () => cursor.complete({ system: 's', user: 'u', round: 1 }, cursorDeadline.signal),
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
      adapter('cursor', 'auto', async () => '{"answer":"The hall is stable.","cites":[],"tools":[]}'),
    ],
    req,
    controller.signal,
  )
  assert.equal(calls, 2)
  assert.equal(result.provider, 'cursor')
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
      adapter('cursor', 'auto', async () => '{"answer":"The hall is stable.","cites":[],"tools":[]}'),
    ],
    req,
    controller.signal,
  )
  assert.equal(calls, 1)
  assert.equal(result.provider, 'cursor')
})

test('a short broken JSON lead-in is asked once more', async () => {
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 135_000)
  const seen: string[] = []
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  let calls = 0
  const fixed = '{"answer":"The hall is stable.","cites":[],"tools":[]}'
  try {
    const result = await cascade(
      [
        adapter('grok', GROK_MODEL, async (item) => {
          calls += 1
          seen.push(item.user)
          return calls === 1 ? 'Sure.\n{"answer":"The hall is stable.",}' : fixed
        }, true, 65_000),
      ],
      req,
      controller.signal,
    )
    assert.equal(calls, 2)
    assert.equal(result.provider, 'grok')
    assert.equal(result.text, fixed)
    assert.match(seen[1] ?? '', /The last reply was prose\. Reply with one JSON object/)
    assert.match(lines.join('\n'), /york-api cli grok reask reason=prose/)
  } finally {
    console.log = log
  }
})

test('two plan objects in one reply are asked once more', async () => {
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 135_000)
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  let calls = 0
  const fixed = '{"answer":"The hall is stable.","cites":[],"tools":[]}'
  const ambiguous = 'Sure.\n{"answer":"One.","cites":[],"tools":[]}\n{"answer":"Two.","cites":[],"tools":[]}'
  try {
    const result = await cascade(
      [
        adapter('grok', GROK_MODEL, async () => {
          calls += 1
          return calls === 1 ? ambiguous : fixed
        }, true, 65_000),
      ],
      req,
      controller.signal,
    )
    assert.equal(calls, 2)
    assert.equal(result.text, fixed)
    assert.match(lines.join('\n'), /reask reason=prose/)
  } finally {
    console.log = log
  }
})

test('an unclosed JSON lead-in is asked once more', async () => {
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 135_000)
  const seen: string[] = []
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  let calls = 0
  const fixed = '{"answer":"The hall is stable.","cites":[],"tools":[]}'
  try {
    const result = await cascade(
      [
        adapter('grok', GROK_MODEL, async (item) => {
          calls += 1
          seen.push(item.user)
          return calls === 1 ? 'Sure.\n{"answer":"A.", "tools": [' : fixed
        }, true, 65_000),
      ],
      req,
      controller.signal,
    )
    assert.equal(calls, 2)
    assert.equal(result.text, fixed)
    assert.match(seen[1] ?? '', /The last reply was prose/)
    assert.match(lines.join('\n'), /reask reason=prose/)
  } finally {
    console.log = log
  }
})

test('a short JSON lead-in is accepted without a reask', async () => {
  const controller = new AbortController()
  stampDeadline(controller.signal, Date.now() + 135_000)
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  let calls = 0
  const text = 'Here is my reply:\n{"answer":"","cites":[],"tools":["plant.getAlarms"]}'
  try {
    const result = await cascade(
      [
        adapter('grok', GROK_MODEL, async () => {
          calls += 1
          return text
        }, true, 65_000),
      ],
      req,
      controller.signal,
    )
    assert.equal(calls, 1)
    assert.equal(result.text, text)
    assert.equal(lines.some((line) => line.includes('reask')), false)
  } finally {
    console.log = log
  }
  const answer = 'Sure.\n{"answer":"The hall is stable.","cites":[],"tools":[]}'
  let answerCalls = 0
  const answered = await cascade(
    [
      adapter('cursor', 'auto', async () => {
        answerCalls += 1
        return answer
      }, true, 65_000),
    ],
    req,
    controller.signal,
  )
  assert.equal(answerCalls, 1)
  assert.equal(answered.text, answer)
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
  const spare = adapter('spare', 'spare', async () => '{"answer":"The hall is stable.","cites":[],"tools":[]}', true, 20_000, 3)
  const signal = new AbortController().signal
  const first = cascade([cursor, spare], req, signal)
  await ready
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  try {
    const second = await cascade([cursor, spare], req, signal)
    assert.equal(second.provider, 'spare')
    assert.equal(cursorCalls, 1)
    assert.match(lines.join('\n'), /york-api cli slot-cursor skipped reason=busy/)
  } finally {
    console.log = log
    open()
    await first
  }
})
