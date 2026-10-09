import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { claudeNoTools, cliStarted, deniedToolAttempt, hasToolRecord, isRefusal, searchContained, grokCanaryHook, mergeCursorCanary } from '../scripts/canary-hooks.mjs'
import { CLAUDE_BUDGET_MS, CURSOR_BUDGET_MS, GROK_BUDGET_MS, buildAdapters, tierBudgetMs } from '../src/adapters.ts'
import { claudeNeedsSignIn, claudeReprobeDelay, cursorBinIsGrok, grokSmokeAnswerOk, grokSmokeArgs, grokStartupVerdict, grokToolsEmpty, holdSmokeDir, nextReprobeDelay, probeAndLogClis, recoverClaude, recoverCursor, recoverGrok, resetSmokeShutdown, restoreClaudeFlag, retryOnce, smokeGroupIds, smokeVerdict, startClaudeReprobe, startCursorReprobe, startGrokReprobe, stopCliReprobes, stopOpenSmokes } from '../src/cliVersions.ts'
import { handleChat, type ChatDeps } from '../src/chat.ts'
import { createBudget } from '../src/budget.ts'
import { containsSecretMaterial, redactReason } from '../src/leak.ts'
import { proxySecretConfigured } from '../src/ip.ts'
import {
  CURSOR_READ_DENY,
  completeClaude,
  completeGrok,
  prepareClaudeLaunch,
  prepareCursorLaunch,
  GROK_DISALLOWED_TOOLS,
  grokArgs,
  grokHomeReadDeny,
  prepareGrokLaunch,
  providerChildEnv,
  failureReason,
  grokStreamText,
  replyText,
  timeoutReason,
} from '../src/providers.ts'
import { REQUEST_MS, chatWindowMs, rememberTimeouts, serverChatClock, yorkOnlyFrom } from '../src/server.ts'
import { applySandboxProbe, execTreeUnderHome, launchCommand, macSandboxProfile, probeSandbox, profileDeniesHome, serverGroupId } from '../src/sandbox.ts'
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

test('fast guard: the unused deny-default profile text still denies home', () => {
  const profile = macSandboxProfile({
    realHome: '/Users/ghost128',
    tempDir: '/private/var/folders/xx/york',
    binPath: '/Users/ghost128/Library/bin/grok',
    execPaths: ['/Users/ghost128/Library/bin/grok', '/bin/bash', '/bin/sh', '/usr/bin/realpath', '/usr/local/bin/node', '/usr/bin/sandbox-exec'],
    allowRead: ['/Users/ghost128/.grok/auth.json'],
  })
  assert.equal(profileDeniesHome(profile, '/Users/ghost128'), true)
  assert.equal(profile.includes('$HOME'), false)
  assert.equal(profile.includes('~/'), false)
  assert.equal(/\(subpath "\/private\/var"\)/.test(profile), false)
  assert.equal(/\(allow mach-lookup\)/.test(profile), false)
  assert.match(profile, /com\.apple\.system\.logger/)
  assert.match(profile, /\/private\/var\/folders\/xx\/york/)
  assert.match(profile, /deny file-read\* \(subpath "\/Users"\)/)
  assert.match(profile, /\/Users\/ghost128\/\.ssh/)
  assert.match(profile, /\/Users\/ghost128\/\.claude\/settings\.json/)
  assert.match(profile, /\/Users\/ghost128\/\.cursor\/hooks\.json/)
  assert.match(profile, /\/Users\/ghost128\/\.zshrc/)
  assert.match(profile, /Library\/LaunchAgents/)
  assert.match(profile, /auth\.json/)
  const denyAt = profile.indexOf('(deny file-read* (subpath "/Users/ghost128"))')
  const execAt = profile.lastIndexOf('(allow process-exec')
  const authAt = profile.indexOf('(literal "/Users/ghost128/.grok/auth.json")')
  const sshTail = profile.lastIndexOf('(deny file-read* (subpath "/Users/ghost128/.ssh"))')
  assert.ok(denyAt > 0)
  assert.ok(execAt > denyAt)
  assert.ok(authAt > execAt)
  assert.ok(sshTail > authAt)
  assert.match(profile, /literal "\/bin\/bash"/)
  assert.match(profile, /literal "\/usr\/bin\/sandbox-exec"/)
  assert.match(profile, /com\.apple\.secd/)
  assert.match(profile, /com\.apple\.SecurityAgent/)
  const rootAt = profile.indexOf('(allow file-read* (literal "/"))')
  assert.ok(rootAt > 0)
  assert.ok(rootAt < denyAt)
  assert.equal(profileDeniesHome('(version 1)\n(deny default)\n', '/Users/ghost128'), false)
  assert.equal(profileDeniesHome('(deny file-read* (subpath "$HOME"))\n', '/Users/ghost128'), false)
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
  mkdirSync(join(home, '.claude'), { recursive: true })
  writeFileSync(join(home, '.grok', 'config.toml'), 'permission_mode = "always-approve"\n')
  writeFileSync(join(home, '.grok', 'auth.json'), '{"token":"keep"}\n')
  writeFileSync(join(home, '.grok', 'hooks', 'cmux-session.json'), '{"command":"echo fired"}\n')
  writeFileSync(join(home, '.claude', 'settings.json'), '{"permissions":{"allow":["Bash(echo fired)"]}}\n')
  try {
    const launch = await prepareGrokLaunch(dir, req, {
      PATH: process.env.PATH,
      HOME: home,
      GROK_BIN: process.execPath,
      YORK_PROXY_SECRET: 'proxy-secret-value',
      YORK_CANARY: 'york-canary-marker',
      GROK_CLAUDE_HOOKS_ENABLED: '1',
      PWD: '/Users/ghost128/york-api',
      OLDPWD: '/Users/ghost128',
      INIT_CWD: '/Users/ghost128/york-api',
    }, 'darwin')
    assert.equal(launch.cmd, process.execPath)
    assert.notEqual(launch.cmd, 'sandbox-exec')
    assert.equal(launch.input, '')
    assert.equal(launch.env.TMPDIR, join(dir, 'tmp'))
    assert.equal(existsSync(launch.env.TMPDIR ?? ''), true)
    assert.equal(launch.env.PWD, dir)
    assert.equal(launch.env.OLDPWD, undefined)
    assert.equal(launch.env.INIT_CWD, undefined)
    assert.ok(launch.args.includes('--sandbox'))
    assert.ok(launch.args.includes('york'))
    assert.ok(launch.args.includes('dontAsk'))
    assert.equal(launch.env.YORK_PROXY_SECRET, undefined)
    assert.equal(launch.env.YORK_CANARY, undefined)
    assert.equal(launch.env.GROK_CLAUDE_HOOKS_ENABLED, '0')
    assert.equal(launch.env.GROK_CURSOR_HOOKS_ENABLED, '0')
    assert.equal(launch.env.GROK_CLAUDE_RULES_ENABLED, '0')
    assert.equal(launch.env.GROK_CLAUDE_SESSIONS_ENABLED, '0')
    assert.equal(launch.env.GROK_CURSOR_SESSIONS_ENABLED, '0')
    assert.equal(launch.env.GROK_CODEX_SESSIONS_ENABLED, '0')
    assert.ok(launch.env.GROK_HOME?.startsWith(dir))
    const promptAt = launch.args.indexOf('--prompt-file')
    const prompt = readFileSync(launch.args[promptAt + 1] ?? '', 'utf8')
    assert.match(prompt, /user text/)
    const config = readFileSync(join(launch.env.GROK_HOME ?? '', 'config.toml'), 'utf8')
    assert.match(config, /dontAsk/)
    assert.equal(config.includes('always-approve'), false)
    const sandbox = readFileSync(join(launch.env.GROK_HOME ?? '', 'sandbox.toml'), 'utf8')
    assert.equal(sandbox.includes('$HOME'), false)
    assert.equal(sandbox.includes('~/'), false)
    assert.match(sandbox, new RegExp(home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    const tempReal = realpathSync(dir)
    assert.match(sandbox, /read_write/)
    assert.match(sandbox, new RegExp(tempReal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    const deny = sandbox.split('read_write')[0] ?? ''
    assert.equal(deny.includes(`"${tempReal}"`), false)
    const grokHome = launch.env.GROK_HOME ?? ''
    assert.equal(deny.includes(grokHome), false)
    assert.equal(deny.includes(`"${grokHome}/**"`), false)
    assert.match(deny, new RegExp(`${home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\.grok/\\*\\*`))
    const denyAt = launch.args.indexOf('--deny')
    assert.equal(launch.args[denyAt + 1], grokHomeReadDeny(grokHome))
    assert.equal(launch.args.includes('--tools'), false)
    const blockedAt = launch.args.indexOf('--disallowed-tools')
    assert.equal(launch.args[blockedAt + 1], GROK_DISALLOWED_TOOLS)
    assert.equal(GROK_DISALLOWED_TOOLS.includes('use_tool'), true)
    assert.equal(GROK_DISALLOWED_TOOLS.includes('search_tool'), true)
    assert.equal(GROK_DISALLOWED_TOOLS.includes('kill_command_or_subagent'), true)
    assert.equal(GROK_DISALLOWED_TOOLS.includes('get_command_or_subagent_output'), true)
    assert.equal(deny.includes('"/tmp"'), false)
    assert.match(deny, /"\/Users"/)
    assert.match(sandbox, /\.ssh/)
    assert.match(sandbox, /\.zshrc/)
    assert.equal(launch.env.HOME, join(dir, 'home'))
    assert.notEqual(launch.env.HOME, home)
    const auth = lstatSync(join(launch.env.GROK_HOME ?? '', 'auth.json'))
    assert.equal(auth.isSymbolicLink(), false)
    assert.equal(auth.isFile(), true)
    assert.equal(auth.mode & 0o777, 0o600)
    assert.equal(readFileSync(join(launch.env.GROK_HOME ?? '', 'auth.json'), 'utf8'), '{"token":"keep"}\n')
    const settings = readFileSync(join(dir, 'home', '.claude', 'settings.json'), 'utf8')
    assert.equal(settings.includes('echo fired'), false)
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
    assert.notEqual(launch.cmd, 'sandbox-exec')
    assert.equal(launch.env.TMPDIR, join(dir, 'tmp'))
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
    const launch = await prepareCursorLaunch(dir, req, {
      PATH: process.env.PATH,
      HOME: home,
      CURSOR_BIN: process.execPath,
      CLAUDE_CONFIG_DIR: join(home, '.claude'),
    }, 'linux')
    assert.equal(launch.cmd, process.execPath)
    assert.notEqual(launch.cmd, 'sandbox-exec')
    assert.equal(launch.cwd, dir)
    assert.equal(launch.env.HOME?.startsWith(`${dir}/`), true)
    assert.equal(launch.env.CURSOR_CONFIG_DIR?.startsWith(`${dir}/`), true)
    assert.equal(launch.env.HOME, join(dir, 'home'))
    assert.equal(launch.env.CURSOR_CONFIG_DIR, join(dir, 'home', '.cursor'))
    assert.equal(launch.env.CLAUDE_CONFIG_DIR, undefined)
    assert.equal(launch.env.TMPDIR, join(dir, 'tmp'))
    const cli = JSON.parse(readFileSync(join(dir, 'home', '.cursor', 'cli-config.json'), 'utf8')) as { permissions?: { deny?: string[] } }
    assert.equal(cli.permissions?.deny?.includes('Read(/Users/**)'), true)
    assert.equal(cli.permissions?.deny?.includes('Read(~/**)'), true)
    assert.equal(cli.permissions?.deny?.includes('Read(/home/**)'), true)
    assert.equal(JSON.stringify(cli).includes('Shell(**)'), false)
    const hooks = readFileSync(join(dir, 'home', '.cursor', 'hooks.json'), 'utf8')
    assert.equal(hooks.includes('echo fired'), false)
    const settings = readFileSync(join(dir, 'home', '.claude', 'settings.json'), 'utf8')
    assert.equal(settings.includes('echo fired'), false)
    assert.equal(lstatSync(join(dir, 'home', '.cursor', 'auth.json')).isSymbolicLink(), true)
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
  assert.equal(containsSecretMaterial('sk-ant-api03-abcdefghij'), true)
  assert.equal(containsSecretMaterial('sk-proj-abcdefghij'), true)
  assert.equal(containsSecretMaterial('xai-abcdefghij'), true)
  assert.equal(containsSecretMaterial('gho_abcdefghij'), true)
  assert.equal(containsSecretMaterial('ghs_abcdefghij'), true)
  assert.equal(containsSecretMaterial('ghp_abcdefghij'), true)
  assert.equal(containsSecretMaterial('github_pat_abcdefghij'), true)
  assert.equal(containsSecretMaterial('AKIAIOSFODNN7EXAMPLE'), true)
  assert.equal(containsSecretMaterial('ASIAIOSFODNN7EXAMPLE'), true)
  assert.equal(containsSecretMaterial('sk_live_abcdefghij'), true)
  assert.equal(containsSecretMaterial('rk_live_abcdefghij'), true)
  assert.equal(containsSecretMaterial('AIzaSyA1234567890abcdefghij'), true)
  assert.equal(containsSecretMaterial('tskey-abcdefghij'), true)
  assert.equal(containsSecretMaterial('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'), true)
  assert.equal(containsSecretMaterial('AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'), true)
  assert.equal(containsSecretMaterial('export DATABASE_PASSWORD=hunter2'), true)
  assert.equal(containsSecretMaterial('sk- ant-abcdefghijklmnop'), true)
  assert.equal(containsSecretMaterial('c2stYW50LWFiY2RlZmdoaWprbG1u'), true)
  assert.equal(containsSecretMaterial('sk%2Dant-abcdefghij'), true)
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
  const allow = { YORK_ALLOW_TIER_OVERRIDE: '1' }
  const headers = { 'x-york-only': 'grok', 'x-york-proxy-secret': secret }
  assert.equal(yorkOnlyFrom(headers, secret, allow, '127.0.0.1'), 'grok')
  assert.equal(yorkOnlyFrom(headers, secret, allow, '::1'), 'grok')
  assert.equal(yorkOnlyFrom(headers, secret, allow, '::ffff:127.0.0.1'), 'grok')
  assert.equal(yorkOnlyFrom(headers, secret, {}, '127.0.0.1'), null)
  assert.equal(yorkOnlyFrom(headers, secret, allow, '203.0.113.9'), null)
  assert.equal(yorkOnlyFrom({ 'x-york-only': 'grok', 'x-york-proxy-secret': 'nope-not-the-secret' }, secret, allow, '127.0.0.1'), null)
  assert.equal(yorkOnlyFrom({ 'x-york-only': 'grok' }, '', allow, '127.0.0.1'), null)
  assert.equal(yorkOnlyFrom({ 'x-york-only': 'shell', 'x-york-proxy-secret': secret }, secret, allow, '127.0.0.1'), null)
  const child = providerChildEnv({
    HOME: '/Users/ghost128',
    YORK_CANARY: 'york-canary-marker',
    YORK_PROXY_SECRET: secret,
    PWD: '/Users/ghost128/york-api',
    OLDPWD: '/tmp',
    INIT_CWD: '/Users/ghost128/york-api',
  })
  assert.equal(child.YORK_CANARY, undefined)
  assert.equal(child.HOME, '/Users/ghost128')
  assert.equal(child.PWD, undefined)
  assert.equal(child.OLDPWD, undefined)
  assert.equal(child.INIT_CWD, undefined)
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
    const lines: string[] = []
    const log = console.log
    console.log = (msg?: unknown) => {
      lines.push(String(msg))
    }
    try {
      await probeAndLogClis(env)
    } finally {
      console.log = log
    }
    assert.equal(env.YORK_CURSOR_CLI, 'unavailable')
    assert.equal(lines.some((line) => line.includes('reason=agent-is-grok')), true)
    assert.equal(env.YORK_SANDBOX, undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('fast guard: sandbox probe fails closed and does not write a home canary off darwin', async () => {
  const home = mkdtempSync(join(tmpdir(), 'york-probe-home-'))
  try {
    const skipped = await probeSandbox({ PATH: '/usr/bin:/bin', HOME: home }, 'linux')
    assert.equal(skipped.ok, false)
    assert.equal(skipped.reason, 'wrapper-skipped')
    const missing = await probeSandbox({ PATH: '/nonexistent', HOME: home }, 'darwin')
    assert.equal(missing.ok, false)
    assert.equal(missing.reason, 'sandbox-exec-missing')
    assert.deepEqual(readdirSync(home), [])
    const env: NodeJS.ProcessEnv = { YORK_GROK_CLI: 'ready' }
    const lines: string[] = []
    const log = console.log
    console.log = (msg?: unknown) => {
      lines.push(String(msg))
    }
    try {
      applySandboxProbe(env, missing)
    } finally {
      console.log = log
      stopCliReprobes()
    }
    assert.equal(env.YORK_SANDBOX, 'unavailable')
    assert.equal(env.YORK_GROK_CLI, 'unavailable')
    assert.equal(env.YORK_CLAUDE_CLI, 'unavailable')
    assert.equal(env.YORK_CURSOR_CLI, 'unavailable')
    assert.equal(env.YORK_CODEX_CLI, 'unavailable')
    const joined = lines.join('\n')
    assert.match(joined, /grok reprobe in 60 s/)
    assert.match(joined, /claude reprobe in 60 s/)
    assert.match(joined, /cursor reprobe in 60 s/)
  } finally {
    stopCliReprobes()
    rmSync(home, { recursive: true, force: true })
  }
})

test('fast guard: deadlines cover grok then claude then cursor', () => {
  assert.equal(REQUEST_MS, 135_000)
  assert.ok(GROK_BUDGET_MS + CLAUDE_BUDGET_MS + CURSOR_BUDGET_MS <= REQUEST_MS)
  const shared = tierBudgetMs({ YORK_CODEX: '1' })
  assert.ok(shared.grok + shared.claude + shared.cursor + shared.codex <= REQUEST_MS)
  const loop = readFileSync(fileURLToPath(new URL('../../york-chiller/src/chat/loop.ts', import.meta.url)), 'utf8')
  assert.match(loop, /ABORT_MS = 145_000/)
  assert.equal(loop.includes('elapsedMs'), false)
  assert.equal(chatWindowMs({ elapsedMs: 0 }), REQUEST_MS)
  assert.equal(chatWindowMs({ elapsedMs: 80_000 }), 55_000)
  assert.equal(chatWindowMs({ elapsedMs: 200_000 }), 0)
  const clockBody = { question: 'server clock', round: 0, sessionId: 'clock-session', elapsedMs: 90_000, timedOut: ['claude'] }
  const opened = serverChatClock('127.0.0.1', clockBody, 1_000)
  assert.equal(opened.elapsedMs, 0)
  assert.deepEqual(opened.timedOut, [])
  rememberTimeouts('10.1.1.1', clockBody, ['grok'])
  const followed = serverChatClock('10.9.9.9', { question: 'a different question', round: 1, sessionId: 'clock-session', elapsedMs: 0, timedOut: ['cursor'] }, 81_000)
  assert.equal(followed.elapsedMs, 80_000)
  assert.deepEqual(followed.timedOut, ['grok'])
  const other = serverChatClock('127.0.0.1', { question: 'server clock', round: 1, sessionId: 'other-session' }, 81_000)
  assert.equal(other.elapsedMs, 0)
  const emptyTools = [
    '{"type":"available_commands","tools":[],"commands":[]}',
    '{"type":"thought","data":"15"}',
    '{"type":"text","data":"5"}',
    '{"type":"usage","inputTokens":1,"outputTokens":1}',
    '{"type":"end","stopReason":"end_turn","sessionId":"abc123","requestId":"xyz789"}',
  ].join('\n')
  const offeredTools = [
    '{"type":"available_commands","tools":["read_file"],"commands":[]}',
    '{"type":"text","data":"5"}',
    '{"type":"end","stopReason":"end_turn","sessionId":"abc123","requestId":"xyz789"}',
  ].join('\n')
  const answered = smokeVerdict(0, emptyTools, '', false, 70_000)
  assert.equal(answered.ok, false)
  assert.deepEqual(grokStartupVerdict(answered, emptyTools), { ok: true, reason: 'answered' })
  assert.equal(grokSmokeAnswerOk(emptyTools), true)
  assert.equal(grokToolsEmpty(offeredTools), false)
  assert.equal(grokToolsEmpty('{"type":"end","stopReason":"end_turn","sessionId":"abc123","requestId":"xyz789"}'), false)
  assert.equal(replyText(emptyTools), emptyTools)
  assert.equal(grokStreamText(emptyTools), '5')
  assert.equal(grokStreamText(emptyTools).includes('15'), false)
  const fifteen = emptyTools.replace('"data":"5"', '"data":"15"')
  assert.equal(grokSmokeAnswerOk(fifteen), false)
  assert.equal(grokSmokeAnswerOk(emptyTools.replace('"data":"5"', '"data":"5."')), true)
  assert.equal(grokSmokeAnswerOk(emptyTools.replace('"data":"5"', '"data":"The answer is 5"')), false)
  assert.equal(grokSmokeAnswerOk(emptyTools.replace('"data":"5"', '"data":"5.0"')), false)
  assert.equal(grokStartupVerdict(smokeVerdict(0, fifteen, '', false, 70_000), fifteen).ok, false)
  const thoughtFive = [
    '{"type":"available_commands","tools":[],"commands":[]}',
    '{"type":"thought","data":"5"}',
    '{"type":"usage","inputTokens":1,"outputTokens":1}',
    '{"type":"end","stopReason":"end_turn","sessionId":"abc123","requestId":"xyz789"}',
  ].join('\n')
  assert.equal(grokSmokeAnswerOk(thoughtFive), false)
  assert.deepEqual(grokStartupVerdict(smokeVerdict(0, offeredTools, '', false, 70_000), offeredTools), { ok: false, reason: 'tools' })
  const joined = [
    '{"type":"text","data":"YORK"}',
    '{"type":"text","data":"OK"}',
    '{"type":"thought","data":"Analyzing the directory structure..."}',
    '{"type":"end","stopReason":"end_turn","sessionId":"abc123","requestId":"xyz789"}',
  ].join('\n')
  assert.equal(grokStreamText(joined), 'YORKOK')
  assert.equal(grokStreamText(joined).includes('Analyzing'), false)
  const resultStream = [
    '{"type":"text","data":"YORK"}',
    '{"type":"text","data":"OK"}',
    '{"type":"result","subtype":"success","is_error":false,"result":"The hall is stable.","stop_reason":"end_turn"}',
  ].join('\n')
  assert.equal(replyText(resultStream), resultStream)
  assert.equal(grokStreamText(resultStream), 'The hall is stable.')
  const plainLines = '{"answer":"The hall is stable.","cites":[],"tools":[]}\n{"answer":"Supply is 42.5 psig.","cites":[],"tools":[]}'
  assert.equal(replyText(plainLines), plainLines)
  assert.equal(grokStreamText(plainLines), '')
  const thoughtToken = '{"type":"thought","data":"YORKOK"}\n{"type":"text","data":"no"}\n{"type":"end","stopReason":"end_turn","sessionId":"abc123","requestId":"xyz789"}'
  assert.equal(grokStartupVerdict(smokeVerdict(0, thoughtToken, '', false, 1_000), thoughtToken).ok, false)
  assert.equal(failureReason(1, '', 'Error: not logged in'), 'exit=1 stderr= stdout=Error: not logged in')
  assert.deepEqual(grokStartupVerdict({ ok: false, reason: 'timeout budget=1000' }, emptyTools), { ok: false, reason: 'timeout budget=1000' })
  assert.deepEqual(grokStartupVerdict({ ok: false, reason: 'exit=1 stderr=' }, ''), { ok: false, reason: 'exit=1 stderr=' })
  const smokeArgs = grokSmokeArgs(grokArgs('probe'))
  assert.equal(smokeArgs.at(-2), '--output-format')
  assert.equal(smokeArgs.at(-1), 'streaming-json')
  assert.equal(grokArgs('probe').includes('--output-format'), false)
  assert.ok(REQUEST_MS < 145_000)
  const caddy = readFileSync(fileURLToPath(new URL('../../Caddyfile', import.meta.url)), 'utf8')
  assert.match(caddy, /\{http\.request\.header\.X-Real-IP\}/)
  assert.equal(caddy.includes('header_up -X-Real-IP'), false)
  assert.equal(caddy.includes('{remote_host}'), false)
  assert.match(caddy, /request_header -X-York-Only/)
  assert.match(caddy, /response_header_timeout 155s/)
  const install = readFileSync(fileURLToPath(new URL('../scripts/install-mac.sh', import.meta.url)), 'utf8')
  assert.match(install, /umask 077/)
  assert.match(install, /chmod 600/)
  assert.equal(install.includes('YORK_DEBUG_RAW'), false)
  const docker = readFileSync(fileURLToPath(new URL('../Dockerfile', import.meta.url)), 'utf8')
  assert.match(docker, /no tarball checksum/)
  assert.equal(docker.includes('curl'), false)
  const envDoc = readFileSync(fileURLToPath(new URL('../ENV.md', import.meta.url)), 'utf8')
  assert.match(envDoc, /setsid/)
  const runner = {
    async run() {
      return { code: 0, stdout: 'ok', stderr: '' }
    },
  }
  const closed = buildAdapters({ YORK_CURSOR_CLI: 'unavailable' }, runner, 'cursor')
  assert.equal(closed.find((item) => item.id === 'cursor')?.enabled(), false)
  const forced = buildAdapters({}, runner, 'cursor')
  assert.equal(forced.find((item) => item.id === 'cursor')?.enabled(), true)
  assert.equal(forced.find((item) => item.id === 'grok')?.enabled(), false)
  const capsAt = install.indexOf('YORK_TEST_CAPS:-')
  const overrideAt = install.indexOf('YORK_ALLOW_TIER_OVERRIDE')
  assert.ok(capsAt >= 0)
  assert.ok(overrideAt > capsAt)
  assert.match(install, /without YORK_TEST_CAPS/)
})

test('fast guard: the version directory, env, and bash are allowed after the home deny', () => {
  const home = '/Users/ghost128'
  const version = `${home}/.local/share/cursor-agent/versions/2026.10.01-e373342`
  assert.equal(execTreeUnderHome(`${version}/cursor-agent`, home), version)
  assert.equal(execTreeUnderHome(`${home}/.grok/downloads/grok`, home), `${home}/.grok/downloads`)
  assert.equal(execTreeUnderHome(`${home}/.local/share/claude/versions/2.1.293`, home), `${home}/.local/share/claude/versions`)
  assert.equal(execTreeUnderHome(`${home}/.grok/auth.json`, home), null)
  assert.equal(execTreeUnderHome(`${home}/.cursor/hooks.json`, home), null)
  assert.equal(execTreeUnderHome('/usr/bin/env', home), null)
  assert.equal(execTreeUnderHome(home, home), null)
  const profile = macSandboxProfile({
    realHome: home,
    tempDir: '/private/tmp/york',
    binPath: `${version}/cursor-agent`,
    execPaths: [`${version}/cursor-agent`, '/usr/bin/env', '/bin/bash'],
    allowRead: [],
    allowExecTrees: [version],
    allowKeychain: true,
  })
  const denyAt = profile.indexOf(`(deny file-read* (subpath "${home}"))`)
  const treeAt = profile.indexOf(`(subpath "${version}")`)
  const envAt = profile.indexOf('(literal "/usr/bin/env")')
  const bashAt = profile.indexOf('(literal "/bin/bash")')
  const keyAt = profile.indexOf(`(subpath "${home}/Library/Keychains")`)
  assert.ok(denyAt > 0)
  assert.ok(treeAt > denyAt)
  assert.ok(envAt > denyAt)
  assert.ok(bashAt > denyAt)
  assert.ok(keyAt > denyAt)
  assert.equal(profile.includes(`(allow file-write* (subpath "${home}/Library/Keychains"))`), false)
  assert.equal(profile.includes('(subpath "/private/var")'), false)
  assert.equal(/\(allow mach-lookup\)/.test(profile), false)
})

test('fast guard: claude and cursor link the login keychain and drop CLAUDE_CONFIG_DIR', async () => {
  const home = await mkdtemp(join(tmpdir(), 'york-home-'))
  const dir = await mkdtemp(join(tmpdir(), 'york-claude-'))
  const keychain = join(home, 'Library', 'Keychains', 'login.keychain-db')
  mkdirSync(join(home, 'Library', 'Keychains'), { recursive: true })
  writeFileSync(keychain, 'keychain-bytes')
  writeFileSync(join(home, '.claude.json'), '{"oauth":"keep"}\n')
  const agent = process.execPath
  try {
    const claude = await prepareClaudeLaunch(dir, req, {
      PATH: process.env.PATH,
      HOME: home,
      CLAUDE_BIN: process.execPath,
      CLAUDE_CONFIG_DIR: join(home, '.claude'),
    }, 'darwin')
    const copied = join(dir, 'home', '.claude.json')
    assert.equal(readFileSync(copied, 'utf8'), '{"oauth":"keep"}\n')
    const mode = lstatSync(copied)
    assert.equal(mode.isSymbolicLink(), false)
    assert.equal(mode.mode & 0o777, 0o600)
    assert.equal(claude.cmd, process.execPath)
    assert.notEqual(claude.cmd, 'sandbox-exec')
    assert.equal(claude.env.HOME, join(dir, 'home'))
    assert.equal(claude.env.CLAUDE_CONFIG_DIR, undefined)
    assert.equal(claude.env.TMPDIR, join(dir, 'tmp'))
  assert.equal(claude.env.PWD, dir)
  assert.equal(claude.env.OLDPWD, undefined)
    assert.equal(existsSync(claude.env.TMPDIR ?? ''), true)
    assert.ok(claude.args.includes('--tools'))
    assert.equal(claude.args[claude.args.indexOf('--tools') + 1], '')
    const link = join(dir, 'home', 'Library', 'Keychains', 'login.keychain-db')
    assert.equal(lstatSync(link).isSymbolicLink(), true)
    assert.equal(realpathSync(link), realpathSync(keychain))
    assert.equal(existsSync(join(dir, '.york.sb')), false)
    const cursorDir = await mkdtemp(join(tmpdir(), 'york-cursor-'))
    try {
      const cursor = await prepareCursorLaunch(cursorDir, req, {
        PATH: process.env.PATH,
        HOME: home,
        CURSOR_BIN: agent,
        CLAUDE_CONFIG_DIR: join(home, '.claude'),
      }, 'darwin')
      assert.equal(cursor.cmd, agent)
      assert.notEqual(cursor.cmd, 'sandbox-exec')
      assert.equal(cursor.cwd, cursorDir)
      assert.equal(cursor.env.HOME, join(cursorDir, 'home'))
      assert.equal(cursor.env.CURSOR_CONFIG_DIR, join(cursorDir, 'home', '.cursor'))
      assert.equal(cursor.env.CLAUDE_CONFIG_DIR, undefined)
      assert.equal(cursor.env.TMPDIR, join(cursorDir, 'tmp'))
      assert.equal(cursor.env.PWD, cursorDir)
      const cursorLink = join(cursorDir, 'home', 'Library', 'Keychains', 'login.keychain-db')
      assert.equal(lstatSync(cursorLink).isSymbolicLink(), true)
      assert.equal(realpathSync(cursorLink), realpathSync(keychain))
      assert.equal(existsSync(join(cursorDir, '.york.sb')), false)
      assert.ok(cursor.args.includes('--sandbox'))
      assert.ok(cursor.args.includes('enabled'))
      assert.equal(cursor.args.includes('--force'), false)
    } finally {
      await rm(cursorDir, { recursive: true, force: true })
    }
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(dir, { recursive: true, force: true })
  }
})

test('fast guard: smoke verdict and failure logs do not keep the prompt', async () => {
  assert.equal(cliStarted({ code: 71, stdout: '', stderr: 'sandbox-exec: execvp() failed: Operation not permitted' }), false)
  assert.equal(cliStarted({ code: 1, stdout: '', stderr: 'Operation not permitted' }), false)
  assert.equal(cliStarted({ code: 1, stdout: 'hall', stderr: 'Error: Permission denied' }), true)
  assert.equal(cliStarted({ code: 1, stdout: '', stderr: 'Error: Permission denied' }), true)
  assert.equal(hasToolRecord('<invoke_tool name="WebFetch">'), false)
  assert.equal(hasToolRecord('Error: Permission denied'), true)
  assert.equal(deniedToolAttempt('User cancelled the execution for tool write'), true)
  assert.equal(deniedToolAttempt('readPermissionDenied'), true)
  assert.equal(deniedToolAttempt('Command blocked by permissions configuration'), true)
  assert.equal(deniedToolAttempt('WebFetch: isolated server'), true)
  assert.equal(deniedToolAttempt('rejected: User Rejected'), true)
  assert.equal(searchContained('Grep on /etc/passwd returned no matches (tool is workspace-scoped). Glob on /etc returned 0 paths'), true)
  assert.equal(claudeNoTools('{"tools":[],"mcp_servers":[]}', []), true)
  assert.equal(claudeNoTools('plain text', ['--tools', '']), true)
  assert.equal(isRefusal('I will not read those files.'), true)
  assert.equal(isRefusal('The snapshot does not contain that file. I do not quote it.'), true)
  assert.equal(isRefusal('That value is not in the snapshot.'), true)
  assert.equal(isRefusal('I have no file quote for that path.'), true)
  assert.equal(isRefusal('There is no file quote in the reply.'), true)
  assert.equal(isRefusal('% FLA means percent of full load amps.'), false)
  const missed = smokeVerdict(71, '', 'sandbox-exec: execvp() of grok failed: No such file or directory', false, 60_000)
  assert.equal(missed.ok, false)
  assert.match(missed.reason, /exit=71/)
  assert.match(missed.reason, /execvp/)
  assert.deepEqual(smokeVerdict(0, 'YORKOK.', '', false, 60_000), { ok: true, reason: 'answered' })
  assert.equal(smokeVerdict(0, 'The token is yorkok', '', false, 60_000).reason, 'answered')
  assert.equal(smokeVerdict(0, 'hall', '', false, 60_000).ok, false)
  const synonym = smokeVerdict(0, 'corridor', '', false, 50_000)
  assert.equal(synonym.ok, false)
  assert.match(synonym.reason, /^smoke-mismatch /)
  assert.match(synonym.reason, /corridor/)
  assert.equal(synonym.reason.includes('Reply with exactly'), false)
  assert.deepEqual(smokeVerdict(1, '', '', true, 60_000), { ok: false, reason: 'timeout budget=60000' })
  assert.equal(smokeVerdict(0, '', '', false, 60_000).ok, false)
  assert.match(smokeVerdict(0, '', '', false, 60_000).reason, /^smoke-mismatch/)
  assert.equal(smokeVerdict(0, 'Not logged in', '', false, 20_000).ok, false)
  const signedOut = smokeVerdict(1, '', 'Not signed in', false, 15_000)
  assert.equal(signedOut.ok, false)
  assert.match(signedOut.reason, /Not signed in/)
  assert.equal(redactReason('boom sk-ant-abcdefghij\nuser text'), 'boom [redacted]')
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  try {
    await assert.rejects(
      () => completeClaude(req, new AbortController().signal, {
        async run(_cmd, _args, input) {
          assert.match(input, /user text/)
          return { code: 71, stdout: '', stderr: 'sandbox-exec: execvp() failed' }
        },
      }, { PATH: process.env.PATH, HOME: '/tmp' }),
      /exit=71/,
    )
    const chat = await handleChat(
      { question: 'secret prompt text', snapshot: {} },
      deps(async () => {
        throw new Error('exit=71 stderr=sandbox-exec: execvp() failed')
      }),
    )
    assert.equal(chat.body.status, 'unavailable')
  } finally {
    console.log = log
  }
  const joined = lines.join('\n')
  assert.match(joined, /york-api cli launch failed reason=/)
  assert.match(joined, /york-api chat failed reason=/)
  assert.equal(joined.includes('secret prompt text'), false)
  assert.equal(joined.includes('user text'), false)
  const grok = grokCanaryHook('/tmp/york-canary-hook.sh') as { hooks: { SessionStart: { hooks: { type: string; command: string }[] }[] } }
  assert.equal(grok.hooks.SessionStart[0]?.hooks[0]?.type, 'command')
  const merged = JSON.parse(mergeCursorCanary(JSON.stringify({
    version: 1,
    hooks: { sessionStart: [{ command: 'kev' }], beforeSubmitPrompt: [{ command: 'kev' }] },
  }), '/tmp/york-canary-hook.sh')) as { hooks: { sessionStart: { command: string }[]; beforeSubmitPrompt: { command: string }[] } }
  assert.equal(merged.hooks.sessionStart[0]?.command, 'kev')
  assert.equal(merged.hooks.sessionStart[1]?.command, '/tmp/york-canary-hook.sh')
  assert.equal(merged.hooks.beforeSubmitPrompt[0]?.command, 'kev')
})

test('fast guard: a budget kill logs timeout budget, not an empty exit', async () => {
  const parent = new AbortController()
  parent.abort(timeoutReason(15_000))
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  try {
    await assert.rejects(
      () => completeClaude(req, parent.signal, {
        async run(_cmd, _args, _input, _env, signal) {
          assert.equal(signal.aborted, true)
          return { code: 1, stdout: '', stderr: '' }
        },
      }, { PATH: process.env.PATH, HOME: '/tmp' }),
      /timeout budget=15000/,
    )
  } finally {
    console.log = log
  }
  const joined = lines.join('\n')
  assert.match(joined, /york-api cli launch failed reason=timeout budget=15000/)
  assert.equal(joined.includes('exit=1 stderr='), false)
})

test('claude exit 1 with empty stderr logs stdout, and a later probe marks claude ready', async () => {
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  try {
    await assert.rejects(
      () => completeClaude(req, new AbortController().signal, {
        async run() {
          return { code: 1, stdout: 'Error: not logged in', stderr: '' }
        },
      }, { PATH: process.env.PATH, HOME: '/tmp' }),
      /exit=1/,
    )
  } finally {
    console.log = log
  }
  const joined = lines.join('\n')
  assert.match(joined, /exit=1/)
  assert.match(joined, /stdout=Error: not logged in/)
  const env: NodeJS.ProcessEnv = { YORK_CLAUDE_CLI: 'unavailable' }
  let during = ''
  const still = await recoverClaude(env, async () => {
    during = env.YORK_CLAUDE_CLI ?? 'cleared'
    return { ok: false, reason: 'exit=1 stderr= stdout=Error: not logged in' }
  })
  assert.equal(still?.ok, false)
  assert.equal(during, 'unavailable')
  assert.equal(env.YORK_CLAUDE_CLI, 'unavailable')
  const back = await recoverClaude(env, async () => ({ ok: true, reason: 'answered' }))
  assert.equal(back?.ok, true)
  assert.equal(env.YORK_CLAUDE_CLI, 'ready')
  const ready: NodeJS.ProcessEnv = { YORK_CLAUDE_CLI: 'ready' }
  const skipped = await recoverClaude(ready, async () => ({ ok: false, reason: 'OAuth session expired' }))
  assert.equal(skipped, null)
  assert.equal(ready.YORK_CLAUDE_CLI, 'ready')
})

test('claude reprobe backs off, and an expired OAuth session asks for sign-in', async () => {
  assert.equal(claudeReprobeDelay(0, ''), 60_000)
  assert.equal(claudeReprobeDelay(1, 'exit=1 stderr='), 120_000)
  assert.equal(claudeReprobeDelay(2, ''), 300_000)
  assert.equal(claudeReprobeDelay(3, ''), 600_000)
  assert.equal(claudeReprobeDelay(9, ''), 600_000)
  assert.equal(claudeReprobeDelay(1, 'exit=1 stderr=OAuth session expired'), 600_000)
  assert.equal(claudeNeedsSignIn('Please run /login'), true)
  assert.equal(claudeNeedsSignIn('Error: not logged in'), true)
  assert.equal(claudeNeedsSignIn('invalid api key'), true)
  assert.equal(claudeNeedsSignIn('401'), true)
  assert.equal(claudeNeedsSignIn('authentication_error'), true)
  assert.equal(claudeNeedsSignIn('Authentication required'), true)
  assert.equal(claudeNeedsSignIn('agent login'), true)
  assert.equal(claudeNeedsSignIn('exit=1 stderr='), false)
  assert.equal(claudeNeedsSignIn('1401'), false)
  assert.equal(claudeReprobeDelay(1, 'authentication_error'), 600_000)
  assert.equal(claudeReprobeDelay(0, 'error 401'), 600_000)
  assert.equal(claudeReprobeDelay(0, 'Please run /login'), 600_000)
  assert.equal(claudeReprobeDelay(2, 'invalid api key'), 600_000)
  const timer = startClaudeReprobe({ YORK_CLAUDE_CLI: 'ready' })
  clearTimeout(timer)
  stopCliReprobes()
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  try {
    const env: NodeJS.ProcessEnv = { YORK_CLAUDE_CLI: 'unavailable' }
    const verdict = await recoverClaude(env, async () => {
      assert.equal(env.YORK_CLAUDE_CLI, 'unavailable')
      return { ok: false, reason: 'exit=1 stderr=OAuth session expired' }
    })
    assert.equal(verdict?.ok, false)
    assert.equal(env.YORK_CLAUDE_CLI, 'unavailable')
  } finally {
    console.log = log
  }
  assert.match(lines.join('\n'), /claude needs sign-in/)
})

test('a claude retry keeps the YORK_CLAUDE_CLI setting', () => {
  const ready: NodeJS.ProcessEnv = { YORK_CLAUDE_CLI: 'ready' }
  restoreClaudeFlag(ready, 'ready', true)
  assert.equal(ready.YORK_CLAUDE_CLI, 'ready')
  restoreClaudeFlag(ready, 'ready', false)
  assert.equal(ready.YORK_CLAUDE_CLI, 'unavailable')
  assert.equal(Object.hasOwn(ready, 'YORK_CLAUDE_CLI'), true)
  const custom: NodeJS.ProcessEnv = { YORK_CLAUDE_CLI: 'local' }
  restoreClaudeFlag(custom, 'local', true)
  assert.equal(custom.YORK_CLAUDE_CLI, 'local')
  restoreClaudeFlag(custom, 'local', false)
  assert.equal(custom.YORK_CLAUDE_CLI, 'unavailable')
  const unset: NodeJS.ProcessEnv = {}
  restoreClaudeFlag(unset, undefined, true)
  assert.equal(unset.YORK_CLAUDE_CLI, 'ready')
  const failed: NodeJS.ProcessEnv = {}
  restoreClaudeFlag(failed, undefined, false)
  assert.equal(failed.YORK_CLAUDE_CLI, 'unavailable')
  const down: NodeJS.ProcessEnv = { YORK_CLAUDE_CLI: 'unavailable' }
  restoreClaudeFlag(down, 'unavailable', true)
  assert.equal(down.YORK_CLAUDE_CLI, 'ready')
})

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitForFile(path: string): Promise<void> {
  for (let i = 0; i < 50 && !existsSync(path); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

test('a restart clears helpers found by ps and the smoke directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'york-smoke-cursor-'))
  const pidFile = join(dir, 'helper.pid')
  const child = spawn(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000);', pidFile], {
    detached: true,
    stdio: 'ignore',
  })
  child.on('exit', () => {})
  child.unref()
  let pid = 0
  try {
    await waitForFile(pidFile)
    pid = Number(readFileSync(pidFile, 'utf8'))
    assert.ok(pid > 0)
    const started = Date.now()
    holdSmokeDir(dir)
    await stopOpenSmokes()
    assert.equal(existsSync(dir), false)
    assert.equal(processAlive(pid), false)
    assert.ok(Date.now() - started < 1_500)
  } finally {
    await stopOpenSmokes()
    resetSmokeShutdown()
    try { process.kill(-pid, 'SIGKILL') } catch { /* group already gone */ }
    if (existsSync(dir)) await rm(dir, { recursive: true, force: true })
  }
})

test('a helper that ignores SIGTERM is killed with its setsid child after 2 s', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'york-smoke-cursor-'))
  const pidFile = join(dir, 'helper.pid')
  const parentCode = [
    'const { spawn } = require("node:child_process");',
    'const fs = require("node:fs");',
    'const child = spawn(process.execPath, ["-e", "process.on(\\"SIGTERM\\", () => {}); setInterval(() => {}, 1000);"], { detached: true, stdio: "ignore" });',
    'child.unref();',
    'fs.writeFileSync(process.argv[1], String(process.pid) + " " + String(child.pid));',
    'setInterval(() => {}, 1000);',
  ].join('')
  const child = spawn(process.execPath, ['-e', parentCode, pidFile], {
    detached: true,
    stdio: 'ignore',
  })
  child.on('exit', () => {})
  child.unref()
  let parent = 0
  let grandchild = 0
  try {
    await waitForFile(pidFile)
    const ids = readFileSync(pidFile, 'utf8').trim().split(/\s+/).map(Number)
    parent = ids[0] ?? 0
    grandchild = ids[1] ?? 0
    assert.ok(parent > 0 && grandchild > 0)
    const started = Date.now()
    holdSmokeDir(dir)
    await stopOpenSmokes()
    const elapsed = Date.now() - started
    assert.equal(existsSync(dir), false)
    assert.equal(processAlive(parent), false)
    assert.equal(processAlive(grandchild), false)
    assert.ok(elapsed >= 1_800)
  } finally {
    await stopOpenSmokes()
    for (const stray of [parent, grandchild]) {
      try { process.kill(-stray, 'SIGKILL') } catch { /* group already gone */ }
      try { process.kill(stray, 'SIGKILL') } catch { /* already gone */ }
    }
    if (existsSync(dir)) await rm(dir, { recursive: true, force: true })
    resetSmokeShutdown()
  }
})

test('a tracked process group stops when the command line omits the directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'york-smoke-cursor-'))
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], {
    detached: true,
    stdio: 'ignore',
  })
  child.on('exit', () => {})
  child.unref()
  const pid = child.pid ?? 0
  try {
    assert.ok(pid > 0)
    holdSmokeDir(dir, pid)
    await stopOpenSmokes()
    assert.equal(existsSync(dir), false)
    assert.equal(processAlive(pid), false)
  } finally {
    await stopOpenSmokes()
    try { process.kill(-pid, 'SIGKILL') } catch { /* group already gone */ }
    if (existsSync(dir)) await rm(dir, { recursive: true, force: true })
    resetSmokeShutdown()
  }
})

test('a shutdown blocks the next smoke retry and keeps every open directory', async () => {
  const first = await mkdtemp(join(tmpdir(), 'york-smoke-cursor-'))
  const second = await mkdtemp(join(tmpdir(), 'york-smoke-cursor-'))
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);', first], { detached: true, stdio: 'ignore' })
  const other = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);', second], { detached: true, stdio: 'ignore' })
  child.on('exit', () => {})
  other.on('exit', () => {})
  child.unref()
  other.unref()
  const firstPid = child.pid ?? 0
  const secondPid = other.pid ?? 0
  try {
    holdSmokeDir(first, firstPid)
    holdSmokeDir(second, secondPid)
    let calls = 0
    const verdict = await retryOnce(async () => {
      calls += 1
      if (calls === 1) await stopOpenSmokes()
      return { ok: false, reason: 'smoke-mismatch' }
    })
    assert.equal(calls, 1)
    assert.equal(verdict.reason, 'smoke-mismatch')
    assert.equal(existsSync(first), false)
    assert.equal(existsSync(second), false)
    assert.equal(processAlive(firstPid), false)
    assert.equal(processAlive(secondPid), false)
  } finally {
    resetSmokeShutdown()
    try { process.kill(-firstPid, 'SIGKILL') } catch { /* group already gone */ }
    try { process.kill(-secondPid, 'SIGKILL') } catch { /* group already gone */ }
    if (existsSync(first)) await rm(first, { recursive: true, force: true })
    if (existsSync(second)) await rm(second, { recursive: true, force: true })
  }
})

test('grok smoke retries once and reprobes on the claude backoff', async () => {
  resetSmokeShutdown()
  let calls = 0
  const retried = await retryOnce(async () => {
    calls += 1
    return calls === 1 ? { ok: false, reason: 'smoke-mismatch' } : { ok: true, reason: 'answered' }
  })
  assert.equal(calls, 2)
  assert.equal(retried.ok, true)
  const once = await retryOnce(async () => {
    calls += 1
    return { ok: true, reason: 'answered' }
  })
  assert.equal(calls, 3)
  assert.equal(once.ok, true)
  const linesReady: string[] = []
  const readyLog = console.log
  console.log = (msg?: unknown) => {
    linesReady.push(String(msg))
  }
  const timer = startGrokReprobe({ YORK_GROK_CLI: 'ready' })
  console.log = readyLog
  clearTimeout(timer)
  stopCliReprobes()
  assert.match(linesReady.join('\n'), /grok reprobe in 60 s/)
  assert.equal(nextReprobeDelay(null, 4), null)
  assert.equal(nextReprobeDelay({ ok: true, reason: 'answered' }, 2), null)
  const again = nextReprobeDelay({ ok: false, reason: 'smoke-mismatch' }, 0)
  assert.equal(again?.attempt, 1)
  assert.equal(again?.delay, 120_000)
  assert.equal(nextReprobeDelay({ ok: false, reason: 'Authentication required' }, 0)?.delay, 600_000)
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  try {
    const env: NodeJS.ProcessEnv = { YORK_GROK_CLI: 'unavailable' }
    let during = ''
    const still = await recoverGrok(env, async () => {
      during = env.YORK_GROK_CLI ?? 'cleared'
      return { ok: false, reason: 'exit=1 stderr=Please run /login' }
    })
    assert.equal(still?.ok, false)
    assert.equal(during, 'unavailable')
    assert.equal(env.YORK_GROK_CLI, 'unavailable')
    const back = await recoverGrok(env, async () => ({ ok: true, reason: 'answered' }))
    assert.equal(back?.ok, true)
    assert.equal(env.YORK_GROK_CLI, 'ready')
  } finally {
    console.log = log
  }
  assert.match(lines.join('\n'), /grok needs sign-in/)
  const ready: NodeJS.ProcessEnv = { YORK_GROK_CLI: 'ready' }
  const skipped = await recoverGrok(ready, async () => ({ ok: false, reason: 'not logged in' }))
  assert.equal(skipped, null)
  assert.equal(ready.YORK_GROK_CLI, 'ready')
})

test('a smoke stop leaves the server process group alone', () => {
  const own = serverGroupId()
  assert.ok(own > 1)
  assert.deepEqual(smokeGroupIds('/no/such/york-smoke-dir', own), [])
  const foreign = own === 424242 ? 424243 : 424242
  assert.deepEqual(smokeGroupIds('/no/such/york-smoke-dir', foreign), [foreign])
})

test('cursor reprobe uses the same backoff and marks a recovered check ready', async () => {
  const linesReady: string[] = []
  const readyLog = console.log
  console.log = (msg?: unknown) => {
    linesReady.push(String(msg))
  }
  const timer = startCursorReprobe({ YORK_CURSOR_CLI: 'ready' })
  console.log = readyLog
  clearTimeout(timer)
  stopCliReprobes()
  assert.match(linesReady.join('\n'), /cursor reprobe in 60 s/)
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  try {
    const env: NodeJS.ProcessEnv = { YORK_CURSOR_CLI: 'unavailable' }
    const still = await recoverCursor(env, async () => ({ ok: false, reason: 'exit=1 stderr=Please run /login' }))
    assert.equal(still?.ok, false)
    assert.equal(env.YORK_CURSOR_CLI, 'unavailable')
    const back = await recoverCursor(env, async () => ({ ok: true, reason: 'answered' }))
    assert.equal(back?.ok, true)
    assert.equal(env.YORK_CURSOR_CLI, 'ready')
  } finally {
    console.log = log
  }
  assert.match(lines.join('\n'), /cursor needs sign-in/)
  assert.match(lines.join('\n'), /cursor status=ready reason=recovered/)
  const ready: NodeJS.ProcessEnv = { YORK_CURSOR_CLI: 'ready' }
  const skipped = await recoverCursor(ready, async () => ({ ok: false, reason: 'not logged in' }))
  assert.equal(skipped, null)
  assert.equal(ready.YORK_CURSOR_CLI, 'ready')
})

test('a grok chat reply keeps every plain JSON line', async () => {
  const plain = '{"answer":"The hall is stable.","cites":[],"tools":[]}\n{"answer":"Supply is 42.5 psig.","cites":[],"tools":[]}'
  const text = await completeGrok(req, new AbortController().signal, {
    async run() {
      return { code: 0, stdout: plain, stderr: '' }
    },
  }, { PATH: process.env.PATH, HOME: '/tmp' })
  assert.equal(text, plain)
})

test('fast guard: a client abort logs aborted, not exit=1', async () => {
  const parent = new AbortController()
  parent.abort()
  const lines: string[] = []
  const log = console.log
  console.log = (msg?: unknown) => {
    lines.push(String(msg))
  }
  try {
    await assert.rejects(
      () => completeClaude(req, parent.signal, {
        async run(_cmd, _args, _input, _env, signal) {
          assert.equal(signal.aborted, true)
          return { code: 1, stdout: '', stderr: '' }
        },
      }, { PATH: process.env.PATH, HOME: '/tmp' }),
      /aborted/,
    )
  } finally {
    console.log = log
  }
  const joined = lines.join('\n')
  assert.match(joined, /york-api cli launch failed reason=aborted/)
  assert.equal(joined.includes('exit=1'), false)
})
