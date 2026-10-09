import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { redactReason } from './leak.ts'
import { tierBudgetMs } from './adapters.ts'
import {
  codexArgs,
  codexLaunchArgsOk,
  grokArgs,
  grokLaunchArgsOk,
  nodeRunner,
  prepareClaudeLaunch,
  prepareCodexLaunch,
  prepareCursorLaunch,
  prepareGrokLaunch,
  failureReason,
  grokAdvertisedTools,
  grokStreamText,
  replyText,
  timeoutReason,
} from './providers.ts'
import { resolveBin } from './sandbox.ts'
import type { LlmRequest } from './types.ts'

/** Log-and-warn floors. An older binary still serves. A missing binary does not. */
export const CLAUDE_CLI_MIN = '2.1.293'
export const CURSOR_CLI_MIN = '2026.07.17'
export const GROK_CLI_MIN = '1.0.50'

const SMOKE_TOKEN = 'YORKOK'
const SMOKE_PROMPT: LlmRequest = {
  system: 'Reply with exactly this token and nothing else: YORKOK',
  user: SMOKE_TOKEN,
}
const GROK_SMOKE_PROMPT: LlmRequest = {
  system: 'You answer short arithmetic questions.',
  user: 'What is 2 + 3? Answer with the number only.',
}
const LAUNCH_FAIL = /sandbox-exec:\s*execvp|No such file or directory|\bENOENT\b|wrapper skipped|profile void|Not logged in|Authentication required|Couldn't start/i

const CLAUDE_MIN = [2, 1, 293] as const
const CURSOR_MIN = [2026, 7, 17] as const
const GROK_MIN = [1, 0, 50] as const

const SHARED_PROBE = ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TMPDIR', 'SHELL', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME'] as const

const OWN_PROBE: Record<string, readonly string[]> = {
  grok: ['GROK_BIN'],
  claude: ['CLAUDE_BIN', 'CLAUDE_CONFIG_DIR'],
  cursor: ['CURSOR_BIN'],
  codex: ['CODEX_BIN', 'CODEX_HOME'],
}

export function cliProbeEnv(env: NodeJS.ProcessEnv, name: string): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = {}
  const keys = [...SHARED_PROBE, ...(OWN_PROBE[name] ?? [])]
  for (const key of keys) {
    const value = env[key]
    if (typeof value === 'string' && value.length > 0) next[key] = value
  }
  return next
}

function atLeast(got: number[], min: readonly number[]): boolean {
  for (let i = 0; i < min.length; i += 1) {
    const part = got[i] ?? 0
    const pin = min[i] ?? 0
    if (part !== pin) return part > pin
  }
  return true
}

export function cursorVersionOk(text: string): boolean {
  const match = text.match(/(?:^|\D)(\d{4})\.(\d{2})\.(\d{2})\b/m)
  if (!match) return false
  return atLeast([Number(match[1]), Number(match[2]), Number(match[3])], CURSOR_MIN)
}

export function claudeVersionOk(text: string): boolean {
  const match = text.match(/^\s*v?(\d+)\.(\d+)\.(\d+)\b/m)
  if (!match) return false
  return atLeast([Number(match[1]), Number(match[2]), Number(match[3])], CLAUDE_MIN)
}

/** The version is the triple after the `grok ` prefix, not an earlier number in the text. */
export function grokVersionOk(text: string): boolean {
  const match = text.match(/(?:^|\n)\s*grok\s+v?(\d+)\.(\d+)\.(\d+)\b/i)
  if (!match) return false
  return atLeast([Number(match[1]), Number(match[2]), Number(match[3])], GROK_MIN)
}

/** True when `agent` is the grok binary. The xAI installer symlinks `agent` to grok. */
export function cursorBinIsGrok(agentReal: string | null, grokReal: string | null, versionText: string): boolean {
  if (versionText.trim().toLowerCase().startsWith('grok ')) return true
  if (agentReal && grokReal && agentReal === grokReal) return true
  return false
}

/**
 * Reads --version. Resolves on exit. A grandchild that keeps the pipe open
 * cannot hold this past the timeout, and the group is killed on the way out.
 */
export function readCliVersion(bin: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(bin, ['--version'], {
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const chunks: Buffer[] = []
    let settled = false
    const finish = (text: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const pid = child.pid
      if (pid) {
        try {
          process.kill(-pid, 'SIGKILL')
        } catch {
          // The group is already gone.
        }
      }
      resolve(text)
    }
    const timer = setTimeout(() => {
      finish(chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : null)
    }, 3_000)
    child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr?.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.on('error', () => finish(null))
    child.on('exit', () => {
      // A short drain catches the version line. Do not wait for 'close':
      // a grandchild holding the pipe must not block listen.
      setTimeout(() => finish(Buffer.concat(chunks).toString('utf8')), 100)
    })
  })
}

type CliFlag = 'YORK_GROK_CLI' | 'YORK_CLAUDE_CLI' | 'YORK_CURSOR_CLI' | 'YORK_CODEX_CLI'

export async function probeAndLogClis(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const cursorBin = env.CURSOR_BIN || 'agent'
  await Promise.all([
    logOne(env, 'grok', env.GROK_BIN || 'grok', GROK_CLI_MIN, grokVersionOk, 'YORK_GROK_CLI'),
    logOne(env, 'claude', env.CLAUDE_BIN || 'claude', CLAUDE_CLI_MIN, claudeVersionOk, 'YORK_CLAUDE_CLI'),
    logOne(env, 'cursor', cursorBin, CURSOR_CLI_MIN, cursorVersionOk, 'YORK_CURSOR_CLI', (text) => {
      const agentReal = resolveBin(cursorBin, env)
      const grokReal = resolveBin(env.GROK_BIN || 'grok', env)
      return cursorBinIsGrok(agentReal, grokReal, text) ? 'agent-is-grok' : null
    }),
    logOne(env, 'codex', env.CODEX_BIN || 'codex', '', () => true, 'YORK_CODEX_CLI'),
  ])
  if (env.YORK_GROK_CLI !== 'unavailable' && !grokLaunchArgsOk(grokArgs('probe'))) {
    console.log('york-api cli grok status=unavailable reason=permission-mode')
    env.YORK_GROK_CLI = 'unavailable'
  }
  if (env.YORK_CODEX === '1' && env.YORK_CODEX_CLI !== 'unavailable' && !codexLaunchArgsOk(codexArgs())) {
    console.log('york-api cli codex status=unavailable reason=sandbox')
    env.YORK_CODEX_CLI = 'unavailable'
  }
  if (platform === 'darwin') await smokeClis(env)
}

/** The available_commands event must report an empty tool list. The end event does not. */
export function grokToolsEmpty(text: string): boolean {
  const tools = grokAdvertisedTools(text)
  return Array.isArray(tools) && tools.length === 0
}

/** The smoke call asks for the tool report. A chat call stays on the text launch. */
export function grokSmokeArgs(args: string[]): string[] {
  if (args.includes('--output-format')) return args
  return [...args, '--output-format', 'streaming-json']
}

/** The grok smoke answer is the number 5 in a text event. A thought does not count. */
export function grokSmokeAnswerOk(stdout: string): boolean {
  const text = grokStreamText(stdout).replace(/^[\s"'`.,:;!?()[\]{}]+|[\s"'`.,:;!?()[\]{}]+$/g, '')
  return /(?<![\d.])5(?![\d.])/.test(text)
}

/** A missing smoke token is rechecked as the number 5. A timeout or a bad exit stays a failure. */
export function grokStartupVerdict(verdict: SmokeVerdict, stdout: string): SmokeVerdict {
  const mismatch = verdict.reason.startsWith('smoke-mismatch')
  if (!verdict.ok && !mismatch) return verdict
  if (!grokSmokeAnswerOk(stdout)) return mismatch ? verdict : { ok: false, reason: 'smoke-mismatch' }
  if (grokToolsEmpty(stdout)) return { ok: true, reason: 'answered' }
  return { ok: false, reason: 'tools' }
}

/** True when the reply contains the smoke token. Case and surrounding punctuation do not matter. */
export function smokeAnswerOk(stdout: string): boolean {
  const text = replyText(stdout).replace(/^[\s"'`.,:;!?()[\]{}]+|[\s"'`.,:;!?()[\]{}]+$/g, '')
  return new RegExp(SMOKE_TOKEN, 'i').test(text)
}

function smokeSample(stdout: string): string {
  const text = replyText(stdout).replace(/\s+/g, ' ').trim()
  return redactReason(text).slice(0, 40)
}

export interface SmokeVerdict {
  ok: boolean
  reason: string
}

function launchFailed(code: number | null, stdout: string, stderr: string): boolean {
  if (LAUNCH_FAIL.test(stderr)) return true
  if (!stdout.trim() && (code === 71 || LAUNCH_FAIL.test(stdout))) return true
  return false
}

/** Pure logic. A live CLI is not started here. A timer with no finished answer is not ready. */
export function smokeVerdict(
  code: number | null,
  stdout: string,
  stderr: string,
  timedOut: boolean,
  budgetMs: number,
): SmokeVerdict {
  if (timedOut) return { ok: false, reason: timeoutReason(budgetMs) }
  const reason = failureReason(code, stderr, stdout)
  if (launchFailed(code, stdout, stderr)) return { ok: false, reason }
  if (code === 0 && smokeAnswerOk(stdout)) return { ok: true, reason: 'answered' }
  if (code === 0) return { ok: false, reason: `smoke-mismatch ${smokeSample(stdout)}` }
  return { ok: false, reason }
}

function noteSmoke(env: NodeJS.ProcessEnv, name: string, flag: CliFlag, verdict: SmokeVerdict): void {
  if (verdict.ok) {
    console.log(`york-api cli ${name} status=ready reason=answered`)
    return
  }
  console.log(`york-api cli ${name} status=unavailable reason=${verdict.reason}`)
  env[flag] = 'unavailable'
}

/** Waits after a failed claude probe: 60 s, 2 min, 5 min, then every 10 min. */
export const CLAUDE_REPROBE_STEPS_MS = [60_000, 120_000, 300_000, 600_000] as const

const CLAUDE_AUTH_REPROBE_MS = 600_000

export function claudeNeedsSignIn(reason: string): boolean {
  return /oauth session expired|please run \/login|not logged in|invalid api key/i.test(reason)
}

/** One more try after a failed probe. A success returns on the first call. */
export async function retryOnce(probe: () => Promise<SmokeVerdict>): Promise<SmokeVerdict> {
  const first = await probe()
  if (first.ok) return first
  return probe()
}

export function claudeReprobeDelay(attempt: number, reason: string): number {
  if (claudeNeedsSignIn(reason)) return CLAUDE_AUTH_REPROBE_MS
  const index = Math.min(Math.max(attempt, 0), CLAUDE_REPROBE_STEPS_MS.length - 1)
  return CLAUDE_REPROBE_STEPS_MS[index] ?? CLAUDE_AUTH_REPROBE_MS
}

async function smokeOne(
  env: NodeJS.ProcessEnv,
  name: string,
  flag: CliFlag,
  prepare: (dir: string) => Promise<Awaited<ReturnType<typeof prepareGrokLaunch>>>,
  force = false,
): Promise<SmokeVerdict | null> {
  if (!force && env[flag] === 'unavailable') return null
  const limits = tierBudgetMs(env)
  const budgetMs = limits[name as keyof typeof limits]
  const dir = await mkdtemp(join(tmpdir(), `york-smoke-${name}-`))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(timeoutReason(budgetMs)), budgetMs)
  try {
    const launch = await prepare(dir)
    const result = await nodeRunner.run(launch.cmd, launch.args, launch.input, launch.env, controller.signal, { cwd: launch.cwd })
    clearTimeout(timer)
    const timedOut = controller.signal.aborted
    const verdict = smokeVerdict(result.code, result.stdout, result.stderr, timedOut, budgetMs)
    const reported = name === 'grok' ? grokStartupVerdict(verdict, result.stdout) : verdict
    noteSmoke(env, name, flag, reported)
    return reported
  } catch (err) {
    const message = err instanceof Error ? err.message : 'error'
    const verdict = { ok: false, reason: redactReason(message) }
    noteSmoke(env, name, flag, verdict)
    return verdict
  } finally {
    clearTimeout(timer)
    await rm(dir, { recursive: true, force: true })
  }
}

/** Probe claude without clearing YORK_CLAUDE_CLI. A failure leaves the saved flag. */
async function claudeSmoke(env: NodeJS.ProcessEnv): Promise<SmokeVerdict> {
  const saved = env.YORK_CLAUDE_CLI
  const verdict = await smokeOne(env, 'claude', 'YORK_CLAUDE_CLI', (dir) => prepareClaudeLaunch(dir, SMOKE_PROMPT, env), true)
  if (!verdict?.ok) {
    env.YORK_CLAUDE_CLI = saved ?? 'unavailable'
    return verdict ?? { ok: false, reason: 'unavailable' }
  }
  return verdict
}

/** When claude was unavailable, a later success marks it ready. */
export async function recoverClaude(
  env: NodeJS.ProcessEnv,
  probe?: () => Promise<SmokeVerdict>,
): Promise<SmokeVerdict | null> {
  if (env.YORK_CLAUDE_CLI !== 'unavailable') return null
  const verdict = probe ? await probe() : await claudeSmoke(env)
  if (!verdict.ok) {
    env.YORK_CLAUDE_CLI = 'unavailable'
    if (claudeNeedsSignIn(verdict.reason)) console.log('york-api cli claude needs sign-in')
    return verdict
  }
  env.YORK_CLAUDE_CLI = 'ready'
  console.log('york-api cli claude status=ready reason=recovered')
  return verdict
}

async function grokPrepare(env: NodeJS.ProcessEnv, dir: string): Promise<Awaited<ReturnType<typeof prepareGrokLaunch>>> {
  const launch = await prepareGrokLaunch(dir, GROK_SMOKE_PROMPT, env)
  return { ...launch, args: grokSmokeArgs(launch.args) }
}

/** Two tries. The second runs after a failure has marked grok unavailable. */
async function grokSmoke(env: NodeJS.ProcessEnv, force = false): Promise<SmokeVerdict | null> {
  if (!force && env.YORK_GROK_CLI === 'unavailable') return null
  const verdict = await retryOnce(async () => {
    const result = await smokeOne(env, 'grok', 'YORK_GROK_CLI', (dir) => grokPrepare(env, dir), true)
    return result ?? { ok: false, reason: 'unavailable' }
  })
  if (verdict.ok) delete env.YORK_GROK_CLI
  return verdict
}

/** When grok was unavailable, a later success marks it ready. */
export async function recoverGrok(
  env: NodeJS.ProcessEnv,
  probe?: () => Promise<SmokeVerdict>,
): Promise<SmokeVerdict | null> {
  if (env.YORK_GROK_CLI !== 'unavailable') return null
  const verdict = probe ? await probe() : await grokSmoke(env, true)
  if (!verdict?.ok) {
    if (verdict) env.YORK_GROK_CLI = 'unavailable'
    if (verdict && claudeNeedsSignIn(verdict.reason)) console.log('york-api cli grok needs sign-in')
    return verdict ?? null
  }
  env.YORK_GROK_CLI = 'ready'
  console.log('york-api cli grok status=ready reason=recovered')
  return verdict
}

function armReprobe(
  env: NodeJS.ProcessEnv,
  recover: (probeEnv: NodeJS.ProcessEnv) => Promise<SmokeVerdict | null>,
): ReturnType<typeof setTimeout> {
  let attempt = 0
  const arm = (delay: number): ReturnType<typeof setTimeout> => {
    const timer = setTimeout(() => {
      void recover(env).then((verdict) => {
        if (!verdict || verdict.ok) {
          attempt = 0
          return
        }
        attempt += 1
        arm(claudeReprobeDelay(attempt, verdict.reason))
      })
    }, delay)
    timer.unref()
    return timer
  }
  return arm(claudeReprobeDelay(0, ''))
}

export function startClaudeReprobe(env: NodeJS.ProcessEnv = process.env): ReturnType<typeof setTimeout> {
  return armReprobe(env, (probeEnv) => recoverClaude(probeEnv))
}

export function startGrokReprobe(env: NodeJS.ProcessEnv = process.env): ReturnType<typeof setTimeout> {
  return armReprobe(env, (probeEnv) => recoverGrok(probeEnv))
}

async function smokeClis(env: NodeJS.ProcessEnv): Promise<void> {
  const jobs = [
    grokSmoke(env),
    smokeOne(env, 'claude', 'YORK_CLAUDE_CLI', (dir) => prepareClaudeLaunch(dir, SMOKE_PROMPT, env)),
    smokeOne(env, 'cursor', 'YORK_CURSOR_CLI', (dir) => prepareCursorLaunch(dir, SMOKE_PROMPT, env)),
  ]
  if (env.YORK_CODEX === '1') {
    jobs.push(smokeOne(env, 'codex', 'YORK_CODEX_CLI', (dir) => prepareCodexLaunch(dir, SMOKE_PROMPT, env)))
  }
  await Promise.all(jobs)
}

async function logOne(
  env: NodeJS.ProcessEnv,
  name: string,
  bin: string,
  minimum: string,
  okText: (text: string) => boolean,
  flag: CliFlag,
  reject?: (text: string) => string | null,
): Promise<void> {
  const text = await readCliVersion(bin, cliProbeEnv(env, name))
  if (text === null) {
    console.log(`york-api cli ${name} version=missing status=unavailable`)
    env[flag] = 'unavailable'
    return
  }
  const version = text.trim() || 'unparsed'
  const reason = reject?.(text) ?? null
  if (reason) {
    console.log(`york-api cli ${name} version=${version} status=unavailable reason=${reason}`)
    env[flag] = 'unavailable'
    return
  }
  const ok = minimum.length === 0 || okText(text)
  console.log(`york-api cli ${name} version=${version} status=ready`)
  if (!ok) console.warn(`york-api cli ${name} is older than ${minimum}. This tier stays on.`)
}
