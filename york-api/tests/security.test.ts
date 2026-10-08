// Fast guards only. They do not verify a live provider.
// Real-call evidence is york-api/scripts/real-call-checklist.mjs on the deployed service.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { claudeVersionOk, cursorVersionOk } from '../src/cliVersions.ts'
import { INCIDENT_KINDS } from '../../york-chiller/src/sim/plantSim.ts'
import { buildAdapters } from '../src/adapters.ts'
import { createBudget } from '../src/budget.ts'
import { handleChat, type ChatDeps } from '../src/chat.ts'
import { TOOL_GATES } from '../src/gates.ts'
import { createInflight } from '../src/inflight.ts'
import { budgetKey, trustedClientIp } from '../src/ip.ts'
import {
  CLI_STDOUT_MAX_BYTES,
  completeClaude,
  completeCursor,
  nodeRunner,
  providerChildEnv,
} from '../src/providers.ts'
import { createYorkServer } from '../src/server.ts'
import { INJECT_KINDS, toolSchemaNames, validateToolArgs } from '../src/toolSchema.ts'
import type { LlmAnswer, LlmRequest } from '../src/types.ts'

const req: LlmRequest = { system: 'sys', user: 'user' }

function answer(text: string): LlmAnswer {
  return { text, provider: 'grok', model: 'grok-4.7' }
}

function deps(complete: ChatDeps['complete'], extra: Partial<ChatDeps> = {}): ChatDeps {
  return {
    ip: 'test',
    now: () => 1_700_000_000_000,
    budget: createBudget(20, 30, 1000),
    search: () => [],
    complete,
    signal: new AbortController().signal,
    ...extra,
  }
}

async function waitFor(check: () => boolean): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('timeout')
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      resolve(typeof addr === 'object' && addr ? addr.port : 0)
    })
  })
}

test('tool schemas cover the trainer gates', () => {
  assert.deepEqual(toolSchemaNames().sort(), Object.keys(TOOL_GATES).sort())
  assert.deepEqual([...INJECT_KINDS], [...INCIDENT_KINDS])
})

test('tool args that fail the schema are dropped and not echoed', async () => {
  assert.equal(validateToolArgs('chiller.stop', { unit: 'CH-01', mode: 'soft', secret: 'canary-leak' }), null)
  assert.equal(validateToolArgs('chiller.stop', { unit: 'CH-01', mode: 1 }), null)
  assert.deepEqual(validateToolArgs('chiller.stop', { unit: 'CH-01', mode: 'soft' }), { unit: 'CH-01', mode: 'soft' })
  assert.equal(validateToolArgs('plant.configureFleet', {
    units: [{ id: 'CH-01', running: true, capacityMw: 5, secret: 'canary-leak' }],
  }), null)
  const result = await handleChat(
    {
      question: 'Stop a chiller',
      snapshot: { blocksWrites: false },
      round: 0,
    },
    deps(async () => answer(JSON.stringify({
      answer: 'The board stays as it is.',
      cites: [],
      tools: [
        { name: 'chiller.stop', args: { unit: 'CH-01', mode: 'soft', secret: 'canary-leak' } },
        { name: 'plant.getSnapshot', args: { leak: true } },
        { name: 'plant.getAlarms', args: {} },
      ],
    }))),
  )
  const body = JSON.stringify(result.body)
  assert.equal(body.includes('canary-leak'), false)
  assert.equal(body.includes('leak'), false)
  assert.equal(result.body.status, 'tools')
  if (result.body.status !== 'tools') return
  assert.deepEqual(result.body.calls, [{ name: 'plant.getAlarms', args: {} }])
})

test('a CLI child does not receive other provider secrets', async () => {
  const home = await mkdtemp(join(tmpdir(), 'york-env-'))
  try {
    const env = providerChildEnv({
      PATH: process.env.PATH,
      CLAUDE_CODE_OAUTH_TOKEN: 'claude-secret',
      XAI_API_KEY: 'xai-secret',
      CURSOR_API_KEY: 'cursor-secret',
      CANARY: 'canary-secret',
    }, 'CLAUDE_CODE_OAUTH_TOKEN', home)
    const script = "process.stdout.write(require('node:fs').readFileSync('/proc/self/environ'))"
    const result = await nodeRunner.run(process.execPath, ['-e', script], '', env, new AbortController().signal)
    const keys = result.stdout.split('\0').map((row) => row.split('=')[0]).filter((key) => key.length > 0)
    assert.deepEqual(keys.sort(), ['CLAUDE_CODE_OAUTH_TOKEN', 'HOME', 'PATH', 'TMPDIR'])
    assert.equal(result.stdout.includes('xai-secret'), false)
    assert.equal(result.stdout.includes('cursor-secret'), false)
    assert.equal(result.stdout.includes('canary-secret'), false)
    assert.equal(result.stdout.includes('claude-secret'), true)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('claude runs in an empty temp dir with a stripped environment', async () => {
  const binDir = await mkdtemp(join(tmpdir(), 'york-bin-'))
  const bin = join(binDir, 'fake-claude.sh')
  writeFileSync(bin, `#!/bin/sh
printf 'FILES:%s\\n' "$(ls -A | wc -l | tr -d ' ')"
printf 'CWD:%s\\n' "$(pwd)"
printf 'ARGS:%s\\n' "$*"
cat /proc/self/environ
`)
  chmodSync(bin, 0o755)
  try {
    const text = await completeClaude(req, new AbortController().signal, nodeRunner, {
      PATH: process.env.PATH,
      CLAUDE_BIN: bin,
      CLAUDE_CODE_OAUTH_TOKEN: 'claude-secret',
      XAI_API_KEY: 'xai-secret',
      CURSOR_API_KEY: 'cursor-secret',
      CANARY: 'canary-secret',
    })
    assert.match(text, /FILES:0/)
    assert.match(text, /--strict-mcp-config/)
    const cwdLine = text.split('\n').find((line) => line.startsWith('CWD:')) ?? ''
    assert.match(cwdLine, /york-claude-/)
    assert.notEqual(cwdLine.slice(4), process.cwd())
    assert.equal(text.includes('xai-secret'), false)
    assert.equal(text.includes('cursor-secret'), false)
    assert.equal(text.includes('canary-secret'), false)
    assert.equal(text.includes('claude-secret'), true)
  } finally {
    await rm(binDir, { recursive: true, force: true })
  }
})

test('fast guard: cursor config file includes the workspace boundary and vim mode', async () => {
  const text = await completeCursor(req, new AbortController().signal, {
    async run(_cmd, args, _input, env, _signal, options) {
      const cwd = options?.cwd ?? ''
      const sandbox = JSON.parse(readFileSync(join(cwd, '.cursor', 'sandbox.json'), 'utf8')) as { readBoundary?: string }
      const cli = JSON.parse(readFileSync(join(cwd, '.cursor', 'cli-config.json'), 'utf8')) as {
        version?: number
        editor?: { vimMode?: boolean }
        sandbox?: { readBoundary?: string }
      }
      assert.equal(sandbox.readBoundary, 'workspace')
      assert.equal(cli.version, 1)
      assert.equal(cli.editor?.vimMode, false)
      assert.equal(cli.sandbox?.readBoundary, 'workspace')
      assert.equal(env.CURSOR_API_KEY, 'cursor-secret')
      assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, undefined)
      assert.equal(env.CANARY, undefined)
      assert.equal(args.includes('--force'), false)
      return { code: 0, stdout: 'The hall is stable.', stderr: '' }
    },
  }, {
    PATH: process.env.PATH,
    CURSOR_API_KEY: 'cursor-secret',
    CLAUDE_CODE_OAUTH_TOKEN: 'claude-secret',
    XAI_API_KEY: 'xai-secret',
    CANARY: 'canary-secret',
  })
  assert.equal(text, 'The hall is stable.')
  const adapters = buildAdapters({ CURSOR_API_KEY: 'cur', XAI_API_KEY: 'xai' }, async () => {
    throw new Error('no http')
  }, { async run() { return { code: 0, stdout: 'ok', stderr: '' } } })
  assert.equal(adapters.some((item) => item.id === 'cursor' && item.enabled()), true)
  assert.equal(CLI_STDOUT_MAX_BYTES, 256 * 1024)
})

test('CLI stdout over the cap kills the child', async () => {
  const script = "process.stdout.write('x'.repeat(200))"
  await assert.rejects(
    () => nodeRunner.run(process.execPath, ['-e', script], '', { PATH: process.env.PATH }, new AbortController().signal, { maxBytes: 64 }),
    /output too large/,
  )
})

test('an aborted CLI child dies after the grace period', async () => {
  const pidFile = join(tmpdir(), `york-child-${process.pid}-${Date.now()}`)
  const controller = new AbortController()
  const script = `process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`
  const pending = nodeRunner.run(process.execPath, ['-e', script], '', { PATH: process.env.PATH }, controller.signal, { killGraceMs: 80 })
  try {
    await waitFor(() => existsSync(pidFile))
    const pid = Number(readFileSync(pidFile, 'utf8'))
    controller.abort()
    await pending
    assert.equal(alive(pid), false)
  } finally {
    rmSync(pidFile, { force: true })
  }
})

test('every round counts, including round greater than 0', () => {
  const budget = createBudget(2, 30, 100)
  const now = 1_700_000_000_000
  assert.equal(budget.allow('10.0.0.8', 0, now).ok, true)
  assert.equal(budget.allow('10.0.0.8', 1, now + 1).ok, true)
  assert.equal(budget.allow('10.0.0.8', 2, now + 2).ok, false)
})

test('a global daily ceiling stops a second address', () => {
  const budget = createBudget(10, 30, 1)
  const now = 1_700_000_000_000
  assert.equal(budget.allow('10.0.0.1', 0, now).ok, true)
  assert.equal(budget.allow('10.0.0.2', 0, now + 1).ok, false)
})

test('a spoofed leftmost X-Forwarded-For is ignored', () => {
  assert.equal(trustedClientIp({ 'x-forwarded-for': '1.2.3.4, 9.9.9.9' }, '10.0.0.5'), '9.9.9.9')
  assert.equal(trustedClientIp({
    'x-real-ip': '203.0.113.9',
    'x-forwarded-for': '1.2.3.4, 9.9.9.9',
  }), '203.0.113.9')
  assert.notEqual(trustedClientIp({
    'x-real-ip': '203.0.113.9',
    'x-forwarded-for': '1.2.3.4',
  }), '1.2.3.4')
  assert.equal(trustedClientIp({}, '127.0.0.1'), '127.0.0.1')
})

test('the in-flight cap rejects a second LLM call', async () => {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let started = 0
  const inflight = createInflight(1)
  const complete = async () => {
    started += 1
    await gate
    return answer('{"answer":"The board is stable.","cites":[],"tools":[]}')
  }
  const first = handleChat({ question: 'One', snapshot: {} }, deps(complete, { inflight }))
  await waitFor(() => started === 1)
  const second = await handleChat({ question: 'Two', snapshot: {} }, deps(complete, { inflight }))
  assert.equal(second.body.status, 'unavailable')
  assert.equal(started, 1)
  release()
  const done = await first
  assert.equal(done.body.status, 'answer')
})

test('a client disconnect kills the CLI child', async () => {
  const pidFile = join(tmpdir(), `york-http-${process.pid}-${Date.now()}`)
  const script = `process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`
  const server = createYorkServer({
    budget: createBudget(20, 30, 1000),
    inflight: createInflight(4),
    complete: (_prompt, signal) => nodeRunner.run(
      process.execPath,
      ['-e', script],
      '',
      { PATH: process.env.PATH },
      signal,
      { killGraceMs: 80 },
    ).then(() => answer('{"answer":"The board is stable.","cites":[],"tools":[]}')),
  })
  const port = await listen(server)
  const client = new AbortController()
  let pid = 0
  try {
    const pending = fetch(`http://127.0.0.1:${port}/api/york/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Real-IP': '203.0.113.8' },
      body: JSON.stringify({ question: 'Read the hall', snapshot: {} }),
      signal: client.signal,
    })
    await waitFor(() => existsSync(pidFile))
    pid = Number(readFileSync(pidFile, 'utf8'))
    client.abort()
    await pending.catch(() => {})
    await waitFor(() => !alive(pid))
    assert.equal(alive(pid), false)
  } finally {
    if (pid && alive(pid)) process.kill(pid, 'SIGKILL')
    rmSync(pidFile, { force: true })
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('the server uses X-Real-IP and ignores a spoofed left X-Forwarded-For', async () => {
  const seen: string[] = []
  const inner = createBudget(10, 30, 100)
  const server = createYorkServer({
    budget: {
      allow(ip, round, now) {
        seen.push(ip)
        return inner.allow(ip, round, now)
      },
      size() {
        return inner.size()
      },
    },
    complete: async () => answer('{"answer":"The board is stable.","cites":[],"tools":[]}'),
  })
  const port = await listen(server)
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/york/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Real-IP': '203.0.113.9',
        'X-Forwarded-For': '1.2.3.4, 9.9.9.9',
      },
      body: JSON.stringify({ question: 'Read the hall', snapshot: {} }),
    })
    assert.equal(res.status, 200)
    assert.deepEqual(seen, ['203.0.113.9'])
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('fast guard: valve percent clamps and free text stays bounded', () => {
  assert.deepEqual(validateToolArgs('plant.setValve', { loop: 'chw', pct: 1e9 }), { loop: 'chw', pct: 100 })
  assert.deepEqual(validateToolArgs('plant.setValve', { loop: 'chw', pct: -4 }), { loop: 'chw', pct: 0 })
  assert.equal(validateToolArgs('chiller.start', { unit: 'A'.repeat(81) }), null)
  assert.equal(validateToolArgs('chiller.start', { unit: 'A'.repeat(80) })?.unit, 'A'.repeat(80))
  const units = Array.from({ length: 64 }, (_item, index) => ({ id: `U${index}`, running: true, capacityMw: 1 }))
  assert.equal(Array.isArray(validateToolArgs('plant.configureFleet', { units })?.units), true)
  assert.equal(validateToolArgs('plant.configureFleet', { units: units.concat({ id: 'extra', running: true, capacityMw: 1 }) }), null)
  assert.equal(validateToolArgs('plant.configureFleet', {
    units: [{ id: 'B'.repeat(65), running: true, capacityMw: 1 }],
  }), null)
})

test('fast guard: IPv6 clients share a /64 and old budget rows are pruned', () => {
  assert.equal(budgetKey('2001:db8:85a3::1'), budgetKey('2001:db8:85a3:0:ffff::2'))
  assert.notEqual(budgetKey('2001:db8:85a3::1'), budgetKey('2001:db8:85a4::1'))
  assert.equal(budgetKey('::ffff:10.0.0.8'), '10.0.0.8')
  const budget = createBudget(2, 30, 100)
  const start = Date.parse('2026-10-08T00:00:00Z')
  assert.equal(budget.allow('2001:db8:85a3::1', 0, start).ok, true)
  assert.equal(budget.allow('2001:db8:85a3::abcd', 1, start + 1).ok, true)
  assert.equal(budget.allow('2001:db8:85a3::9999', 2, start + 2).ok, false)
  assert.equal(budget.allow('2001:db8:85a4::1', 0, start + 3).ok, true)
  budget.allow('10.1.1.1', 0, start + 86_400_000)
  assert.equal(budget.size().daily, 1)
  assert.equal(budget.size().hits, 1)
})

test('fast guard: an old CLI tier is marked unavailable', () => {
  assert.equal(cursorVersionOk('2026.10.01-e373342'), true)
  assert.equal(cursorVersionOk('2026.09.30-aaaaaaa'), false)
  assert.equal(cursorVersionOk('2026.10.02-bbbbbbb'), true)
  assert.equal(claudeVersionOk('2.1.295 (Claude Code)'), true)
  assert.equal(claudeVersionOk('2.1.294'), false)
  assert.equal(claudeVersionOk('2.2.0'), true)
  const adapters = buildAdapters(
    { CURSOR_API_KEY: 'cur', CLAUDE_CODE_OAUTH_TOKEN: 'tok', YORK_CURSOR_CLI: 'unavailable' },
    async () => { throw new Error('no http') },
    { async run() { return { code: 0, stdout: 'ok', stderr: '' } } },
  )
  assert.equal(adapters.find((item) => item.id === 'cursor')?.enabled(), false)
  assert.equal(adapters.find((item) => item.id === 'claude')?.enabled(), true)
})

test('fast guard: a grandchild dies with the process group and the slot waits for exit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'york-group-'))
  const childPid = join(dir, 'child')
  const grandPid = join(dir, 'grand')
  const grand = join(dir, 'grand.cjs')
  const parent = join(dir, 'parent.cjs')
  writeFileSync(grand, `process.on('SIGTERM', () => {});\nrequire('node:fs').writeFileSync(process.env.GRAND_PID, String(process.pid));\nsetInterval(() => { try { process.stdout.write('x'); } catch (err) {} }, 30);\n`)
  writeFileSync(parent, `const { spawn } = require('node:child_process');\nconst fs = require('node:fs');\nspawn(process.execPath, [process.argv[2]], { stdio: 'inherit', env: process.env });\nfs.writeFileSync(process.env.CHILD_PID, String(process.pid));\nprocess.on('SIGTERM', () => {});\nsetInterval(() => {}, 1000);\n`)
  const controller = new AbortController()
  const env = { PATH: process.env.PATH, CHILD_PID: childPid, GRAND_PID: grandPid }
  const inflight = createInflight(1)
  let held = true
  const complete: ChatDeps['complete'] = (_prompt, signal) => nodeRunner.run(
    process.execPath,
    [parent, grand],
    '',
    env,
    signal,
    { killGraceMs: 200 },
  ).then(() => {
    held = false
    return answer('{"answer":"The board is stable.","cites":[],"tools":[]}')
  })
  const first = handleChat({ question: 'Hold', snapshot: {} }, deps(complete, { inflight, signal: controller.signal }))
  try {
    await waitFor(() => existsSync(childPid) && existsSync(grandPid))
    const child = Number(readFileSync(childPid, 'utf8'))
    const grandId = Number(readFileSync(grandPid, 'utf8'))
    controller.abort()
    const second = await handleChat(
      { question: 'Too soon', snapshot: {} },
      deps(async () => answer('{"answer":"The board is stable.","cites":[],"tools":[]}'), { inflight }),
    )
    assert.equal(second.body.status, 'unavailable')
    assert.equal(held, true)
    await first
    assert.equal(held, false)
    assert.equal(alive(child), false)
    assert.equal(alive(grandId), false)
    const third = await handleChat(
      { question: 'After', snapshot: {} },
      deps(async () => answer('{"answer":"The board is stable.","cites":[],"tools":[]}'), { inflight }),
    )
    assert.equal(third.body.status, 'answer')
  } finally {
    controller.abort()
    await rm(dir, { recursive: true, force: true })
  }
})

test('fast guard: the real-call checklist refuses to run on its own', () => {
  const script = fileURLToPath(new URL('../scripts/real-call-checklist.mjs', import.meta.url))
  const blocked = spawnSync(process.execPath, [script], { encoding: 'utf8' })
  assert.notEqual(blocked.status, 0)
  assert.match(blocked.stderr, /YORK_REAL_CALL/)
  const fake = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, YORK_REAL_CALL: '1', XAI_API_KEY: 'fake-key', YORK_API_BASE: 'http://127.0.0.1:9' },
  })
  assert.notEqual(fake.status, 0)
  assert.match(fake.stderr, /fake/)
})
