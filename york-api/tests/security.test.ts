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
import { cliProbeEnv, cursorVersionOk, GROK_CLI_MAX, grokVersionAboveTested, grokVersionOk, readCliVersion } from '../src/cliVersions.ts'
import { INCIDENT_KINDS } from '../../york-chiller/src/sim/plantSim.ts'
import { buildAdapters } from '../src/adapters.ts'
import { createBudget } from '../src/budget.ts'
import { handleChat, type ChatDeps } from '../src/chat.ts'
import { TOOL_GATES } from '../src/gates.ts'
import { createInflight } from '../src/inflight.ts'
import { budgetKey, proxySecretOk, trustedClientIp } from '../src/ip.ts'
import {
  CLI_STDOUT_MAX_BYTES,
  completeCursor,
  cursorArgs,
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

/** Linux reads /proc. macOS prints the process environment the same way. */
function childEnvironNode(): string {
  return [
    "const fs=require('node:fs');",
    "if (fs.existsSync('/proc/self/environ')) process.stdout.write(fs.readFileSync('/proc/self/environ'));",
    "else process.stdout.write(Object.entries(process.env).map(([k,v])=>k+'='+v).join('\\0'));",
  ].join('')
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
      answer: '',
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

test('fast guard: a CLI child keeps the signed-in home and drops the proxy secret', async () => {
  const env = providerChildEnv({
    PATH: process.env.PATH,
    HOME: '/Users/ghost128',
    YORK_PROXY_SECRET: 'proxy-secret',
    CANARY: 'canary-secret',
  })
  const script = childEnvironNode()
  const result = await nodeRunner.run(process.execPath, ['-e', script], '', env, new AbortController().signal)
  assert.equal(result.stdout.includes('proxy-secret'), false)
  assert.equal(result.stdout.includes('canary-secret'), true)
  assert.equal(result.stdout.includes('HOME=/Users/ghost128'), true)
})

test('fast guard: cursor config file includes the workspace boundary and vim mode', async () => {
  const text = await completeCursor(req, new AbortController().signal, {
    async run(_cmd, args, _input, env, _signal, options) {
      const homeDir = env.HOME ?? ''
      const sandbox = JSON.parse(readFileSync(join(homeDir, '.cursor', 'sandbox.json'), 'utf8')) as { readBoundary?: string }
      const cli = JSON.parse(readFileSync(join(homeDir, '.cursor', 'cli-config.json'), 'utf8')) as {
        version?: number
        editor?: { vimMode?: boolean }
        sandbox?: { readBoundary?: string }
      }
      assert.equal(sandbox.readBoundary, 'workspace')
      assert.equal(cli.version, 1)
      assert.equal(cli.editor?.vimMode, false)
      assert.equal(cli.sandbox?.readBoundary, 'workspace')
      assert.notEqual(env.HOME, '/Users/ghost128')
      assert.match(homeDir, /york-cursor-.*\/home$/)
      assert.equal(env.YORK_PROXY_SECRET, undefined)
      assert.equal(env.CANARY, 'canary-secret')
      assert.equal(args.includes('--force'), false)
      assert.equal(args.includes(options?.cwd ?? ''), true)
      return { code: 0, stdout: 'The hall is stable.', stderr: '' }
    },
  }, {
    PATH: process.env.PATH,
    HOME: '/Users/ghost128',
    YORK_PROXY_SECRET: 'proxy-secret',
    CANARY: 'canary-secret',
  })
  assert.equal(text, 'The hall is stable.')
  const adapters = buildAdapters({ YORK_SANDBOX: 'ready' }, { async run() { return { code: 0, stdout: 'ok', stderr: '' } } })
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

test('fast guard: forwarded headers are ignored until the proxy secret matches', () => {
  assert.equal(proxySecretOk('same-secret-value', 'same-secret-value'), true)
  assert.equal(proxySecretOk('wrong-secret-value', 'same-secret-value'), false)
  assert.equal(proxySecretOk('short', 'same-secret-value'), false)
  assert.equal(trustedClientIp({
    'x-york-client-ip': '203.0.113.9',
    'x-real-ip': '1.2.3.4',
    'x-forwarded-for': '8.8.8.8, 9.9.9.9',
    'x-york-proxy-secret': 'same-secret-value',
  }, '127.0.0.1', 'same-secret-value'), '203.0.113.9')
  assert.equal(trustedClientIp({
    'x-york-client-ip': '198.51.100.4',
    'x-york-proxy-secret': 'attacker-secret',
  }, '127.0.0.1', 'same-secret-value'), null)
  assert.equal(trustedClientIp({
    'x-real-ip': '203.0.113.9',
    'x-forwarded-for': '1.2.3.4, 9.9.9.9',
  }, '10.0.0.5', ''), '10.0.0.5')
  assert.equal(trustedClientIp({
    'x-york-proxy-secret': 'same-secret-value',
  }, '127.0.0.1', 'same-secret-value'), null)
  assert.equal(trustedClientIp({
    'x-york-client-ip': ['203.0.113.9', '198.51.100.4'],
    'x-york-proxy-secret': 'same-secret-value',
  }, '127.0.0.1', 'same-secret-value'), null)
  assert.equal(trustedClientIp({
    'x-york-client-ip': '203.0.113.9, 198.51.100.4',
    'x-york-proxy-secret': 'same-secret-value',
  }, '127.0.0.1', 'same-secret-value'), null)
  assert.equal(trustedClientIp({
    'x-york-client-ip': 'not-an-ip',
    'x-york-proxy-secret': 'same-secret-value',
  }, '127.0.0.1', 'same-secret-value'), null)
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
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  let second: Awaited<ReturnType<typeof handleChat>>
  try {
    second = await handleChat({ question: 'Two', snapshot: {} }, deps(complete, { inflight }))
  } finally {
    console.log = log
  }
  assert.equal(second.body.status, 'unavailable')
  assert.equal(started, 1)
  assert.match(lines.join('\n'), /york-api chat busy reason=inflight/)
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

test('fast guard: the server trusts X-York-Client-IP only with the proxy secret', async () => {
  const seen: string[] = []
  const inner = createBudget(10, 30, 100)
  const server = createYorkServer({
    proxySecret: 'same-secret-value',
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
        'X-York-Proxy-Secret': 'same-secret-value',
        'X-York-Client-IP': '203.0.113.9',
        'X-Real-IP': '1.2.3.4',
        'X-Forwarded-For': '8.8.8.8, 9.9.9.9',
      },
      body: JSON.stringify({ question: 'Read the hall', snapshot: {} }),
    })
    assert.equal(res.status, 200)
    const spoof = await fetch(`http://127.0.0.1:${port}/api/york/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-York-Proxy-Secret': 'attacker-secret',
        'X-York-Client-IP': '198.51.100.4',
      },
      body: JSON.stringify({ question: 'Read the hall', snapshot: {} }),
    })
    const spoofBody = await spoof.json() as { status?: string }
    assert.equal(spoofBody.status, 'unavailable')
    const missing = await fetch(`http://127.0.0.1:${port}/api/york/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-York-Proxy-Secret': 'same-secret-value',
      },
      body: JSON.stringify({ question: 'Read the hall', snapshot: {} }),
    })
    const missingBody = await missing.json() as { status?: string }
    assert.equal(missingBody.status, 'unavailable')
    assert.deepEqual(seen, ['203.0.113.9'])
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('fast guard: valve percent clamps and free text stays bounded', () => {
  assert.deepEqual(validateToolArgs('plant.setValve', { loop: 'chw', pct: 1e9 }), { loop: 'chw', pct: 100 })
  assert.deepEqual(validateToolArgs('plant.setValve', { loop: 'chw', pct: -4 }), { loop: 'chw', pct: 0 })
  assert.deepEqual(validateToolArgs('plant.configureFleet', {
    units: [{ id: 'CH-01', running: true, capacityMw: -5 }],
  }), { units: [{ id: 'CH-01', running: true, capacityMw: 0 }] })
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
  assert.equal(budgetKey('::ffff:cb00:7105'), '203.0.113.5')
  assert.notEqual(budgetKey('::ffff:cb00:7105'), budgetKey('::1'))
  assert.equal(budgetKey('64:ff9b::192.0.2.1'), '192.0.2.1')
  assert.equal(budgetKey('64:ff9b::c000:201'), '192.0.2.1')
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

test('fast guard: version floors warn, and only a missing binary is off', () => {
  assert.equal(cursorVersionOk('2026.10.01-e373342'), true)
  assert.equal(cursorVersionOk('2026.07.17-anything'), true)
  assert.equal(cursorVersionOk('2026.07.16-aaaaaaa'), false)
  assert.equal(cursorVersionOk('2026.09.30-aaaaaaa'), true)
  assert.equal(grokVersionOk('grok 1.0.50 (abc) [stable]'), true)
  assert.equal(grokVersionOk('0.0.1\ngrok 1.0.50 (abc) [stable]'), true)
  assert.equal(grokVersionOk('grok 1.0.49 (abc) [stable]'), false)
  assert.equal(grokVersionOk('grok 1.0.51 (abc) [stable]'), true)
  assert.equal(grokVersionOk('1.0.50'), false)
  assert.equal(grokVersionOk('grok-1.0.50'), false)
  assert.equal(GROK_CLI_MAX, '1.0.50')
  assert.equal(grokVersionAboveTested('grok 1.0.50 (abc) [stable]'), false)
  assert.equal(grokVersionAboveTested('grok 1.0.51 (abc) [stable]'), true)
  assert.equal(grokVersionAboveTested('grok 1.1.0 (abc) [stable]'), true)
  assert.equal(grokVersionAboveTested('1.0.51'), false)
  const probed = cliProbeEnv({
    PATH: '/usr/bin',
    HOME: '/Users/ghost128',
    YORK_PROXY_SECRET: 'nope',
    CURSOR_API_KEY: 'cursor-secret',
    CURSOR_BIN: '/bin/agent',
  }, 'cursor')
  assert.equal(probed.CURSOR_BIN, '/bin/agent')
  assert.equal(probed.HOME, '/Users/ghost128')
  assert.equal(probed.CURSOR_API_KEY, undefined)
  assert.equal(probed.YORK_PROXY_SECRET, undefined)
  const adapters = buildAdapters(
    { YORK_SANDBOX: 'ready', YORK_CURSOR_CLI: 'unavailable' },
    { async run() { return { code: 0, stdout: 'ok', stderr: '' } } },
  )
  assert.equal(adapters.find((item) => item.id === 'cursor')?.enabled(), false)
  assert.equal(adapters.find((item) => item.id === 'grok')?.enabled(), true)
})

function groupScripts(dir: string, parentDiesOnTerm: boolean, parentExits: boolean): { parent: string; grand: string; childPid: string; grandPid: string } {
  const childPid = join(dir, 'child')
  const grandPid = join(dir, 'grand')
  const grand = join(dir, 'grand.cjs')
  const parent = join(dir, 'parent.cjs')
  writeFileSync(grand, `process.on('SIGTERM', () => {});\nprocess.on('SIGINT', () => {});\nrequire('node:fs').writeFileSync(process.env.GRAND_PID, String(process.pid));\nsetInterval(() => {}, 1000);\n`)
  const trap = parentDiesOnTerm ? '' : `process.on('SIGTERM', () => {});\n`
  const leave = parentExits
    ? `const wait = setInterval(() => { if (fs.existsSync(process.env.GRAND_PID)) { clearInterval(wait); process.exit(0); } }, 10);\n`
    : `setInterval(() => {}, 1000);\n`
  writeFileSync(parent, `const { spawn } = require('node:child_process');\nconst fs = require('node:fs');\nspawn(process.execPath, [process.argv[2]], { stdio: 'ignore', env: process.env });\nfs.writeFileSync(process.env.CHILD_PID, String(process.pid));\n${trap}${leave}`)
  return { parent, grand, childPid, grandPid }
}

test('fast guard: a parent that dies on TERM still kills the grandchild', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'york-group-'))
  const files = groupScripts(dir, true, false)
  const controller = new AbortController()
  const env = { PATH: process.env.PATH, CHILD_PID: files.childPid, GRAND_PID: files.grandPid }
  const pending = nodeRunner.run(process.execPath, [files.parent, files.grand], '', env, controller.signal, { killGraceMs: 8_000 })
  try {
    await waitFor(() => existsSync(files.childPid) && existsSync(files.grandPid))
    const grandId = Number(readFileSync(files.grandPid, 'utf8'))
    const started = Date.now()
    controller.abort()
    await pending
    assert.ok(Date.now() - started < 3_000)
    assert.equal(alive(grandId), false)
  } finally {
    controller.abort()
    await rm(dir, { recursive: true, force: true })
  }
})

test('fast guard: a normal exit kills a lingering grandchild before the slot frees', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'york-group-exit-'))
  const files = groupScripts(dir, true, true)
  const env = { PATH: process.env.PATH, CHILD_PID: files.childPid, GRAND_PID: files.grandPid }
  const inflight = createInflight(1)
  let held = true
  const complete: ChatDeps['complete'] = (_prompt, signal) => nodeRunner.run(
    process.execPath,
    [files.parent, files.grand],
    '',
    env,
    signal,
    { killGraceMs: 8_000 },
  ).then(() => {
    const grandId = Number(readFileSync(files.grandPid, 'utf8'))
    assert.equal(alive(grandId), false)
    held = false
    return answer('{"answer":"The board is stable.","cites":[],"tools":[]}')
  })
  const first = handleChat({ question: 'Hold', snapshot: {} }, deps(complete, { inflight }))
  try {
    await first
    assert.equal(held, false)
    const second = await handleChat(
      { question: 'After', snapshot: {} },
      deps(async () => answer('{"answer":"The board is stable.","cites":[],"tools":[]}'), { inflight }),
    )
    assert.equal(second.body.status, 'answer')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('fast guard: the grace SIGKILL still runs when the parent ignores TERM', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'york-group-grace-'))
  const files = groupScripts(dir, false, false)
  const controller = new AbortController()
  const env = { PATH: process.env.PATH, CHILD_PID: files.childPid, GRAND_PID: files.grandPid }
  const pending = nodeRunner.run(process.execPath, [files.parent, files.grand], '', env, controller.signal, { killGraceMs: 150 })
  try {
    await waitFor(() => existsSync(files.grandPid))
    const grandId = Number(readFileSync(files.grandPid, 'utf8'))
    controller.abort()
    await pending
    assert.equal(alive(grandId), false)
  } finally {
    controller.abort()
    await rm(dir, { recursive: true, force: true })
  }
})

test('fast guard: the real-call checklist refuses to run on its own', () => {
  const script = fileURLToPath(new URL('../scripts/real-call-checklist.mjs', import.meta.url))
  const source = readFileSync(script, 'utf8')
  assert.match(source, /https:\/\/www\.destroyrebuild\.xyz\/api\/york\/chat/)
  assert.equal(source.includes('REVIEW'), false)
  assert.match(source, /The daily trainer chat limit is close/)
  assert.match(source, /Grep/)
  assert.match(source, /Glob/)
  assert.match(source, /prepareCursorWorkspace/)
  assert.match(source, /prepareCursorLaunch/)
  assert.match(source, /prepareGrokLaunch/)
  assert.equal(source.includes('prepareClaudeLaunch'), false)
  assert.equal(source.includes('root:\\*:0:0'), true)
  assert.match(source, /X-York-Only/)
  assert.match(source, /permission denied/)
  assert.match(source, /EPERM/)
  assert.match(source, /SIGINT/)
  assert.match(source, /SIGTERM/)
  assert.match(source, /uncaughtException/)
  assert.match(source, /tier=\$\{tier\}/)
  assert.match(source, /cliStarted/)
  const hooks = readFileSync(fileURLToPath(new URL('../scripts/canary-hooks.mjs', import.meta.url)), 'utf8')
  assert.match(hooks, /execvp/)
  assert.match(hooks, /function cliStarted/)
  assert.match(source, /YORK_SERVER_RATE_PER_MINUTE/)
  assert.match(source, /YORK_TEST_CAPS/)
  assert.match(source, /utimes/)
  assert.match(source, /SessionStart/)
  assert.match(source, /status !== 'unavailable'/)
  assert.match(source, /york-api cli /)
  assert.match(source, /parsed === 'unavailable'/)
  assert.match(source, /SKIP/)
  assert.match(source, /YORK_PEER_BUDGET_KEY/)
  assert.equal(source.includes("'x-york-client-ip': '203.0.113.11'"), false)
  assert.equal(cursorArgs('auto', '/tmp/york').includes('--force'), false)
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

test('fast guard: budget pruning is amortized', () => {
  const budget = createBudget(10, 2, 100_000, { pruneEvery: 1_000, pruneMs: 600_000 })
  const start = 1_700_000_000_000
  for (let i = 0; i < 40; i += 1) budget.allow(`10.8.0.${i}`, 0, start)
  assert.equal(budget.size().hits, 40)
  assert.equal(budget.allow('10.8.0.3', 0, start + 1).ok, true)
  assert.equal(budget.allow('10.8.0.3', 0, start + 2).ok, false)
  assert.equal(budget.allow('10.8.0.3', 0, start + 61_000).ok, true)
  assert.equal(budget.size().hits, 40)
})

test('fast guard: a version probe does not wait on a stray pipe', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'york-version-'))
  const strayFile = join(dir, 'stray')
  const bin = join(dir, 'fake-version.sh')
  writeFileSync(bin, `#!/bin/sh
node -e 'const {spawn}=require("node:child_process"); const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{detached:true,stdio:"inherit"}); child.unref(); require("node:fs").writeFileSync(process.env.STRAY, String(child.pid)); process.stdout.write("2.1.293\\n");'
`)
  chmodSync(bin, 0o755)
  try {
    const started = Date.now()
    const text = await readCliVersion(bin, { PATH: process.env.PATH, HOME: dir, STRAY: strayFile })
    assert.ok(Date.now() - started < 1_500)
    assert.match(text ?? '', /2\.1\.293/)
  } finally {
    if (existsSync(strayFile)) {
      const stray = Number(readFileSync(strayFile, 'utf8'))
      try { process.kill(stray, 'SIGKILL') } catch { /* already gone */ }
    }
    await rm(dir, { recursive: true, force: true })
  }
})
