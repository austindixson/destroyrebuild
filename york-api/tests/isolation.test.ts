import assert from 'node:assert/strict'
import { chmodSync, lstatSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { CLAUDE_BUDGET_MS, CURSOR_BUDGET_MS, GROK_BUDGET_MS, buildAdapters } from '../src/adapters.ts'
import { cursorBinIsGrok, probeAndLogClis } from '../src/cliVersions.ts'
import { handleChat, type ChatDeps } from '../src/chat.ts'
import { createBudget } from '../src/budget.ts'
import { containsSecretMaterial } from '../src/leak.ts'
import { proxySecretConfigured } from '../src/ip.ts'
import {
  CURSOR_READ_DENY,
  completeClaude,
  prepareCursorLaunch,
  prepareGrokLaunch,
  providerChildEnv,
  replyText,
} from '../src/providers.ts'
import { REQUEST_MS, yorkOnlyFrom } from '../src/server.ts'
import { launchCommand, macSandboxProfile } from '../src/sandbox.ts'
import type { LlmAnswer, LlmRequest } from '../src/types.ts'

const req: LlmRequest = { system: 'sys', user: 'user text' }

function answer(text: string): LlmAnswer {
  return { text, provider: 'grok', model: 'grok-4.7' }
}

function deps(complete: ChatDeps['complete']): ChatDeps {
  return {
    ip: '203.0.113.8',
    now: () => 1_700_000_000_000,
    budget: createBudget(20, 30, 1000),
    search: () => [],
    complete,
    signal: new AbortController().signal,
  }
}

test('fast guard: the seatbelt denies home and darwin wraps sandbox-exec', () => {
  const profile = macSandboxProfile({
    home: '/Users/ghost128',
    tempDir: '/tmp/york',
    binPath: '/usr/local/bin/grok',
    allowRead: ['/Users/ghost128/.grok/auth.json'],
  })
  assert.match(profile, /deny file-read\* \(subpath "\/Users"\)/)
  assert.match(profile, /\/Users\/ghost128\/\.ssh/)
  assert.match(profile, /\/Users\/ghost128\/\.zshrc/)
  assert.match(profile, /Library\/LaunchAgents/)
  assert.match(profile, /auth\.json/)
  assert.match(profile, /process-exec \(literal "\/usr\/local\/bin\/grok"\)/)
  const wrapped = launchCommand('grok', ['--sandbox', 'york'], '/tmp/york.sb', 'darwin')
  assert.equal(wrapped.cmd, 'sandbox-exec')
  assert.deepEqual(wrapped.args.slice(0, 3), ['-f', '/tmp/york.sb', '--'])
  const plain = launchCommand('grok', ['--sandbox', 'york'], '/tmp/york.sb', 'linux')
  assert.equal(plain.cmd, 'grok')
  assert.deepEqual(plain.args, ['--sandbox', 'york'])
})

test('fast guard: grok uses a prompt file, an isolated home, and compat scanners off', async () => {
  const home = await mkdtemp(join(tmpdir(), 'york-home-'))
  const dir = await mkdtemp(join(tmpdir(), 'york-grok-'))
  mkdirSync(join(home, '.grok', 'hooks'), { recursive: true })
  writeFileSync(join(home, '.grok', 'config.toml'), 'permission_mode = "always-approve"\n')
  writeFileSync(join(home, '.grok', 'auth.json'), '{"token":"keep"}\n')
  writeFileSync(join(home, '.grok', 'hooks', 'cmux-session.json'), '{"command":"echo fired"}\n')
  try {
    const launch = await prepareGrokLaunch(dir, req, {
      PATH: process.env.PATH,
      HOME: home,
      GROK_BIN: process.execPath,
      YORK_PROXY_SECRET: 'proxy-secret-value',
      YORK_CANARY: 'york-canary-marker',
      GROK_CLAUDE_HOOKS_ENABLED: '1',
    }, 'darwin')
    assert.equal(launch.cmd, 'sandbox-exec')
    assert.equal(launch.input, '')
    assert.equal(launch.env.YORK_PROXY_SECRET, undefined)
    assert.equal(launch.env.YORK_CANARY, undefined)
    assert.equal(launch.env.GROK_CLAUDE_HOOKS_ENABLED, '0')
    assert.equal(launch.env.GROK_CURSOR_HOOKS_ENABLED, '0')
    assert.equal(launch.env.GROK_CLAUDE_RULES_ENABLED, '0')
    assert.ok(launch.env.GROK_HOME?.startsWith(dir))
    const promptAt = launch.args.indexOf('--prompt-file')
    const prompt = readFileSync(launch.args[promptAt + 1] ?? '', 'utf8')
    assert.match(prompt, /user text/)
    const config = readFileSync(join(launch.env.GROK_HOME ?? '', 'config.toml'), 'utf8')
    assert.match(config, /dontAsk/)
    assert.equal(config.includes('always-approve'), false)
    const sandbox = readFileSync(join(launch.env.GROK_HOME ?? '', 'sandbox.toml'), 'utf8')
    assert.match(sandbox, /\$HOME/)
    assert.match(sandbox, /\.ssh/)
    assert.equal(lstatSync(join(launch.env.GROK_HOME ?? '', 'auth.json')).isSymbolicLink(), true)
    assert.deepEqual(readdirSync(join(launch.env.GROK_HOME ?? '', 'hooks')), [])
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(dir, { recursive: true, force: true })
  }
})

test('fast guard: grok hooks dir stays empty and linux does not call sandbox-exec', async () => {
  const home = await mkdtemp(join(tmpdir(), 'york-home-'))
  const dir = await mkdtemp(join(tmpdir(), 'york-grok-'))
  mkdirSync(join(home, '.grok', 'hooks'), { recursive: true })
  writeFileSync(join(home, '.grok', 'hooks', 'cmux-session.json'), '{}\n')
  writeFileSync(join(home, '.grok', 'auth.json'), '{}\n')
  try {
    const launch = await prepareGrokLaunch(dir, req, { PATH: process.env.PATH, HOME: home }, 'linux')
    assert.equal(launch.cmd, 'grok')
    const hookFile = join(launch.env.GROK_HOME ?? '', 'hooks', 'cmux-session.json')
    assert.throws(() => readFileSync(hookFile))
    const listed = await readFile(join(launch.env.GROK_HOME ?? '', 'sandbox.toml'), 'utf8')
    assert.match(listed, /deny/)
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(dir, { recursive: true, force: true })
  }
})

test('fast guard: cursor config dir is the temp .cursor and user hooks are not copied', async () => {
  const home = await mkdtemp(join(tmpdir(), 'york-home-'))
  const dir = await mkdtemp(join(tmpdir(), 'york-cursor-'))
  mkdirSync(join(home, '.cursor'), { recursive: true })
  writeFileSync(join(home, '.cursor', 'cli-config.json'), '{"permissions":{"allow":["Shell(**)"]}}')
  writeFileSync(join(home, '.cursor', 'hooks.json'), '{"version":1,"hooks":{"sessionStart":[{"command":"echo fired"}]}}')
  writeFileSync(join(home, '.cursor', 'auth.json'), '{"session":"ok"}\n')
  try {
    const launch = await prepareCursorLaunch(dir, req, { PATH: process.env.PATH, HOME: home, CURSOR_BIN: process.execPath }, 'linux')
    assert.equal(launch.env.CURSOR_CONFIG_DIR, join(dir, '.cursor'))
    const cli = JSON.parse(readFileSync(join(dir, '.cursor', 'cli-config.json'), 'utf8')) as { permissions?: { deny?: string[] } }
    assert.equal(cli.permissions?.deny?.includes('Read(/Users/**)'), true)
    assert.equal(cli.permissions?.deny?.includes('Read(~/**)'), true)
    assert.equal(cli.permissions?.deny?.includes('Read(/home/**)'), true)
    assert.equal(JSON.stringify(cli).includes('Shell(**)'), false)
    const hooks = readFileSync(join(dir, '.cursor', 'hooks.json'), 'utf8')
    assert.equal(hooks.includes('echo fired'), false)
    assert.equal(lstatSync(join(dir, '.cursor', 'auth.json')).isSymbolicLink(), true)
    assert.equal(CURSOR_READ_DENY.includes('Read(/Users/**)'), true)
    assert.equal(CURSOR_READ_DENY.includes('Read(~/**)'), true)
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(dir, { recursive: true, force: true })
  }
})

test('fast guard: a reasoning_effort-only reply is empty', async () => {
  assert.equal(replyText('<reasoning_effort>8</reasoning_effort>'), '')
  assert.equal(replyText('<reasoning_effort>8</reasoning_effort>\n<reasoning_effort>8</reasoning_effort>'), '')
  assert.equal(replyText('The hall is stable.'), 'The hall is stable.')
  await assert.rejects(
    () => completeClaude(req, new AbortController().signal, {
      async run() {
        return { code: 0, stdout: '<reasoning_effort>8</reasoning_effort>', stderr: '' }
      },
    }, { PATH: process.env.PATH, HOME: '/tmp' }),
    /cli empty/,
  )
})

test('fast guard: leaked model text becomes the unavailable sentence', async () => {
  assert.equal(containsSecretMaterial('root:*:0:0:System Administrator'), true)
  assert.equal(containsSecretMaterial('root:x:0:0:root:/root:/bin/bash'), true)
  assert.equal(containsSecretMaterial('-----BEGIN OPENSSH PRIVATE KEY-----'), true)
  assert.equal(containsSecretMaterial('token sk-abc1234567890 more'), true)
  assert.equal(containsSecretMaterial('ghp_abcdefghij'), true)
  assert.equal(containsSecretMaterial('The hall is stable.'), false)
  const previous = process.env.YORK_CANARY
  process.env.YORK_CANARY = 'york-canary-marker'
  try {
    const leaked = await handleChat(
      { question: 'Read the hall', snapshot: {} },
      deps(async () => answer('The line is root:*:0:0:System Administrator.')),
    )
    assert.equal(leaked.body.status, 'unavailable')
    assert.equal(JSON.stringify(leaked.body).includes('root:*'), false)
    const canary = await handleChat(
      { question: 'Read the hall', snapshot: {} },
      deps(async () => answer('york-canary-marker')),
    )
    assert.equal(canary.body.status, 'unavailable')
    assert.equal(JSON.stringify(canary.body).includes('york-canary-marker'), false)
  } finally {
    if (previous === undefined) delete process.env.YORK_CANARY
    else process.env.YORK_CANARY = previous
  }
})

test('fast guard: a short proxy secret is refused and the only-tier header needs the secret', () => {
  assert.equal(proxySecretConfigured(undefined), false)
  assert.equal(proxySecretConfigured('short-secret'), false)
  assert.equal(proxySecretConfigured('1234567890123456'), true)
  const secret = 'same-secret-value'
  assert.equal(yorkOnlyFrom({ 'x-york-only': 'grok', 'x-york-proxy-secret': secret }, secret), 'grok')
  assert.equal(yorkOnlyFrom({ 'x-york-only': 'grok', 'x-york-proxy-secret': 'nope-not-the-secret' }, secret), null)
  assert.equal(yorkOnlyFrom({ 'x-york-only': 'grok' }, ''), null)
  assert.equal(yorkOnlyFrom({ 'x-york-only': 'shell' , 'x-york-proxy-secret': secret }, secret), null)
  const child = providerChildEnv({ HOME: '/Users/ghost128', YORK_CANARY: 'york-canary-marker', YORK_PROXY_SECRET: secret })
  assert.equal(child.YORK_CANARY, undefined)
  assert.equal(child.HOME, '/Users/ghost128')
})

test('fast guard: agent that resolves to grok stays off', async () => {
  assert.equal(cursorBinIsGrok('/bin/agent', '/bin/agent', '2026.07.17-abc'), true)
  assert.equal(cursorBinIsGrok('/bin/agent', '/bin/grok', 'grok 1.0.50 (abc) [stable]'), true)
  assert.equal(cursorBinIsGrok('/bin/agent', '/bin/grok', '2026.07.17-abc'), false)
  const dir = mkdtempSync(join(tmpdir(), 'york-agent-'))
  const grok = join(dir, 'grok')
  const agent = join(dir, 'agent')
  writeFileSync(grok, '#!/bin/sh\necho "grok 1.0.50 (abc) [stable]"\n')
  chmodSync(grok, 0o755)
  symlinkSync(grok, agent)
  const env: NodeJS.ProcessEnv = {
    PATH: `${dir}:${process.env.PATH ?? ''}`,
    HOME: dir,
    CURSOR_BIN: agent,
    GROK_BIN: grok,
  }
  try {
    await probeAndLogClis(env)
    assert.equal(env.YORK_CURSOR_CLI, 'unavailable')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('fast guard: deadlines cover grok then claude then cursor', () => {
  assert.equal(REQUEST_MS, 110_000)
  assert.ok(GROK_BUDGET_MS + CLAUDE_BUDGET_MS + CURSOR_BUDGET_MS < REQUEST_MS)
  const loop = readFileSync(fileURLToPath(new URL('../../york-chiller/src/chat/loop.ts', import.meta.url)), 'utf8')
  assert.match(loop, /ABORT_MS = 120_000/)
  const caddy = readFileSync(fileURLToPath(new URL('../../Caddyfile', import.meta.url)), 'utf8')
  assert.match(caddy, /\{http\.request\.header\.X-Real-IP\}/)
  assert.equal(caddy.includes('header_up -X-Real-IP'), false)
  assert.equal(caddy.includes('{remote_host}'), false)
  const install = readFileSync(fileURLToPath(new URL('../scripts/install-mac.sh', import.meta.url)), 'utf8')
  assert.match(install, /umask 077/)
  assert.match(install, /chmod 600/)
  const docker = readFileSync(fileURLToPath(new URL('../Dockerfile', import.meta.url)), 'utf8')
  assert.match(docker, /no tarball checksum/)
  assert.equal(docker.includes('curl'), false)
  const envDoc = readFileSync(fileURLToPath(new URL('../ENV.md', import.meta.url)), 'utf8')
  assert.match(envDoc, /setsid/)
  const forced = buildAdapters({}, {
    async run() {
      return { code: 0, stdout: 'ok', stderr: '' }
    },
  }, 'cursor')
  assert.equal(forced.find((item) => item.id === 'cursor')?.enabled(), true)
  assert.equal(forced.find((item) => item.id === 'grok')?.enabled(), false)
})
