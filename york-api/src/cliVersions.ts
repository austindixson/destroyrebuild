import { execFileSync, spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
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
  prepareCodexLaunch,
  prepareCursorLaunch,
  prepareGrokLaunch,
  failureReason,
  grokAdvertisedTools,
  grokStreamText,
  replyText,
  timeoutReason,
} from './providers.ts'
import { resolveBin, serverGroupId, setCliDownHook } from './sandbox.ts'
import type { LlmRequest } from './types.ts'

/** Log-and-warn floors. An older binary still serves. A missing binary does not. */
export const CURSOR_CLI_MIN = '2026.07.17'
export const GROK_CLI_MIN = '1.0.50'
/** Highest grok build this tree was checked against. A newer build stays on and logs a warning. */
export const GROK_CLI_MAX = '1.0.50'

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

const CURSOR_MIN = [2026, 7, 17] as const
const GROK_MIN = [1, 0, 50] as const
const GROK_MAX = [1, 0, 50] as const

const SHARED_PROBE = ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TMPDIR', 'SHELL', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME'] as const

const OWN_PROBE: Record<string, readonly string[]> = {
  grok: ['GROK_BIN'],
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

function grokTriple(text: string): number[] | null {
  const match = text.match(/(?:^|\n)\s*grok\s+v?(\d+)\.(\d+)\.(\d+)\b/i)
  if (!match?.[1] || !match[2] || !match[3]) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function sameVersion(got: number[], pin: readonly number[]): boolean {
  for (let i = 0; i < pin.length; i += 1) {
    if ((got[i] ?? 0) !== (pin[i] ?? 0)) return false
  }
  return true
}

/** The version is the triple after the `grok ` prefix, not an earlier number in the text. The check is a floor. */
export function grokVersionOk(text: string): boolean {
  const got = grokTriple(text)
  if (!got) return false
  return atLeast(got, GROK_MIN)
}

/** True when the grok triple is above the tested maximum. The tier stays on. */
export function grokVersionAboveTested(text: string): boolean {
  const got = grokTriple(text)
  if (!got) return false
  return atLeast(got, GROK_MAX) && !sameVersion(got, GROK_MAX)
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
      if (pid && pid !== serverGroupId()) {
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

type CliFlag = 'YORK_GROK_CLI' | 'YORK_CURSOR_CLI' | 'YORK_CODEX_CLI'

export async function probeAndLogClis(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const cursorBin = env.CURSOR_BIN || 'agent'
  await Promise.all([
    logOne(env, 'grok', env.GROK_BIN || 'grok', GROK_CLI_MIN, grokVersionOk, 'YORK_GROK_CLI'),
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

/** The grok smoke answer is the number 5 alone. A final period is optional. */
export function grokSmokeAnswerOk(stdout: string): boolean {
  const text = grokStreamText(stdout).trim().replace(/\.$/, '')
  return text === '5'
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

/** Waits after a failed probe: 60 s, 2 min, 5 min, then every 10 min. */
export const CLAUDE_REPROBE_STEPS_MS = [60_000, 120_000, 300_000, 600_000] as const

const CLAUDE_AUTH_REPROBE_MS = 600_000

export function claudeNeedsSignIn(reason: string): boolean {
  return /oauth session expired|please run \/login|not logged in|invalid api key|authentication_error|authentication required|agent login|\b401\b/i.test(reason)
}

let smokeStopped = false

/** Tests keep going in one process. A real stop exits. */
export function resetSmokeShutdown(): void {
  smokeStopped = false
}

/** One more try after a failed probe. A shutdown does not start the next try. */
export async function retryOnce(probe: () => Promise<SmokeVerdict>): Promise<SmokeVerdict> {
  if (smokeStopped) return { ok: false, reason: 'shutdown' }
  const first = await probe()
  if (first.ok || smokeStopped) return first
  return probe()
}

export function claudeReprobeDelay(attempt: number, reason: string): number {
  if (claudeNeedsSignIn(reason)) return CLAUDE_AUTH_REPROBE_MS
  const index = Math.min(Math.max(attempt, 0), CLAUDE_REPROBE_STEPS_MS.length - 1)
  return CLAUDE_REPROBE_STEPS_MS[index] ?? CLAUDE_AUTH_REPROBE_MS
}

type SmokeJob = { dir: string; pgid?: number }
type ProcRow = { pid: number; pgid: number; command: string }

const openSmokes = new Set<SmokeJob>()
let smokeHooked = false
const KILL_GRACE_MS = 2_000

function listProcs(): ProcRow[] {
  let text = ''
  try {
    text = execFileSync('ps', ['-axww', '-o', 'pid=,pgid=,command='], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    })
  } catch {
    return []
  }
  const rows: ProcRow[] = []
  for (const line of text.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s*(.*)$/.exec(line)
    if (!match?.[1] || !match[2]) continue
    rows.push({ pid: Number(match[1]), pgid: Number(match[2]), command: match[3] ?? '' })
  }
  return rows
}

function childPids(pid: number): number[] {
  try {
    const text = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' })
    return text.split('\n').map((line) => Number(line)).filter((id) => id > 0)
  } catch {
    return []
  }
}

function addProc(rows: ProcRow[], seen: Set<number>, pid: number, byPid: Map<number, ProcRow>): boolean {
  if (pid === process.pid || seen.has(pid)) return false
  seen.add(pid)
  const known = byPid.get(pid)
  rows.push(known ?? { pid, pgid: pid, command: '' })
  return true
}

/** Helpers whose command names the directory, plus children found with pgrep. */
function procsForDir(dir: string): ProcRow[] {
  const listed = listProcs()
  const byPid = new Map(listed.map((row) => [row.pid, row]))
  const rows: ProcRow[] = []
  const seen = new Set<number>()
  const queue: number[] = []
  for (const row of listed) {
    if (row.command.includes(dir) && addProc(rows, seen, row.pid, byPid)) queue.push(row.pid)
  }
  while (queue.length > 0) {
    const pid = queue.shift()
    if (pid === undefined) continue
    for (const child of childPids(pid)) {
      if (addProc(rows, seen, child, byPid)) queue.push(child)
    }
  }
  return rows
}

function groupsFor(dir: string, pgid?: number): number[] {
  const own = serverGroupId()
  const ids = new Set<number>()
  if (pgid && pgid > 1 && pgid !== own) ids.add(pgid)
  for (const row of procsForDir(dir)) {
    if (row.pgid > 1 && row.pgid !== own) ids.add(row.pgid)
  }
  return [...ids]
}

/** Process groups a smoke stop would signal. The server's own group is left out. */
export function smokeGroupIds(dir: string, pgid?: number): number[] {
  return groupsFor(dir, pgid)
}

function signalGroup(pgid: number, signal: NodeJS.Signals): void {
  if (pgid === serverGroupId()) return
  try {
    process.kill(-pgid, signal)
  } catch {
    // The group is already gone.
  }
}

function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function signalAndReap(groups: number[], signal: NodeJS.Signals): Promise<number[]> {
  for (const id of groups) signalGroup(id, signal)
  let left = groups.filter((id) => groupAlive(id))
  const deadline = Date.now() + KILL_GRACE_MS
  while (left.length > 0 && Date.now() < deadline) {
    await sleep(50)
    left = left.filter((id) => groupAlive(id))
  }
  return left
}

/** SIGTERM, then SIGKILL after 2 s. The directory is removed after the groups exit. */
export async function releaseSmokeDir(dir: string, pgid?: number): Promise<void> {
  const groups = groupsFor(dir, pgid)
  const left = await signalAndReap(groups, 'SIGTERM')
  if (left.length > 0) await signalAndReap(left, 'SIGKILL')
  rmSync(dir, { recursive: true, force: true })
}

function onSmokeStop(): void {
  void stopOpenSmokes().finally(() => {
    process.exit(143)
  })
}

function armSmokeStop(): void {
  if (smokeHooked) return
  smokeHooked = true
  process.on('SIGTERM', onSmokeStop)
  process.on('SIGINT', onSmokeStop)
}

function disarmSmokeStop(): void {
  if (openSmokes.size > 0 || !smokeHooked) return
  process.off('SIGTERM', onSmokeStop)
  process.off('SIGINT', onSmokeStop)
  smokeHooked = false
}

/** A restart during startup finds this directory and clears it. */
export function holdSmokeDir(dir: string, pgid?: number): void {
  openSmokes.add({ dir, pgid })
  armSmokeStop()
}

function smokeJob(dir: string): SmokeJob | undefined {
  for (const job of openSmokes) {
    if (job.dir === dir) return job
  }
  return undefined
}

function forgetSmokeDir(dir: string): void {
  for (const job of openSmokes) {
    if (job.dir === dir) openSmokes.delete(job)
  }
  disarmSmokeStop()
}

/** Clears every smoke directory still open when a restart arrives. */
export async function stopOpenSmokes(): Promise<void> {
  smokeStopped = true
  const jobs = [...openSmokes]
  openSmokes.clear()
  for (const job of jobs) await releaseSmokeDir(job.dir, job.pgid)
  disarmSmokeStop()
}

async function smokeOne(
  env: NodeJS.ProcessEnv,
  name: string,
  flag: CliFlag,
  prepare: (dir: string) => Promise<Awaited<ReturnType<typeof prepareGrokLaunch>>>,
  force = false,
): Promise<SmokeVerdict | null> {
  if (smokeStopped) return { ok: false, reason: 'shutdown' }
  if (!force && env[flag] === 'unavailable') return null
  const limits = tierBudgetMs(env)
  const budgetMs = limits[name as keyof typeof limits]
  const dir = await mkdtemp(join(tmpdir(), `york-smoke-${name}-`))
  holdSmokeDir(dir)
  if (smokeStopped) {
    await releaseSmokeDir(dir, smokeJob(dir)?.pgid)
    forgetSmokeDir(dir)
    return { ok: false, reason: 'shutdown' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(timeoutReason(budgetMs)), budgetMs)
  try {
    const launch = await prepare(dir)
    const result = await nodeRunner.run(launch.cmd, launch.args, launch.input, launch.env, controller.signal, {
      cwd: launch.cwd,
      onSpawn: (pid) => {
        const job = smokeJob(dir)
        if (job) job.pgid = pid
      },
    })
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
    await releaseSmokeDir(dir, smokeJob(dir)?.pgid)
    forgetSmokeDir(dir)
  }
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

const reprobePending = new Map<string, ReturnType<typeof setTimeout>>()

/** The next wait after a probe. A healthy check stops this chain so a later outage can arm it again. */
export function nextReprobeDelay(
  verdict: SmokeVerdict | null,
  attempt: number,
): { attempt: number; delay: number } | null {
  if (!verdict || verdict.ok) return null
  const next = attempt + 1
  return { attempt: next, delay: claudeReprobeDelay(next, verdict.reason) }
}

export function stopCliReprobes(): void {
  for (const timer of reprobePending.values()) clearTimeout(timer)
  reprobePending.clear()
}

function armReprobe(
  env: NodeJS.ProcessEnv,
  name: string,
  recover: (probeEnv: NodeJS.ProcessEnv) => Promise<SmokeVerdict | null>,
): ReturnType<typeof setTimeout> {
  let attempt = 0
  const arm = (delay: number): ReturnType<typeof setTimeout> => {
    const previous = reprobePending.get(name)
    if (previous) clearTimeout(previous)
    const seconds = Math.round(delay / 1000)
    console.log(`york-api cli ${name} reprobe in ${seconds} s`)
    const timer = setTimeout(() => {
      reprobePending.delete(name)
      void recover(env).then((verdict) => {
        const step = nextReprobeDelay(verdict, attempt)
        if (!step) {
          attempt = 0
          return
        }
        attempt = step.attempt
        arm(step.delay)
      })
    }, delay)
    timer.unref()
    reprobePending.set(name, timer)
    return timer
  }
  return arm(claudeReprobeDelay(0, ''))
}

export function startGrokReprobe(env: NodeJS.ProcessEnv = process.env): ReturnType<typeof setTimeout> {
  return armReprobe(env, 'grok', (probeEnv) => recoverGrok(probeEnv))
}

/** Two tries. A later success clears the unavailable flag. */
async function cursorSmoke(env: NodeJS.ProcessEnv, force = false): Promise<SmokeVerdict | null> {
  if (!force && env.YORK_CURSOR_CLI === 'unavailable') return null
  const verdict = await retryOnce(async () => {
    const result = await smokeOne(env, 'cursor', 'YORK_CURSOR_CLI', (dir) => prepareCursorLaunch(dir, SMOKE_PROMPT, env), true)
    return result ?? { ok: false, reason: 'unavailable' }
  })
  if (verdict.ok) delete env.YORK_CURSOR_CLI
  return verdict
}

/** When cursor was unavailable, a later success marks it ready. */
export async function recoverCursor(
  env: NodeJS.ProcessEnv,
  probe?: () => Promise<SmokeVerdict>,
): Promise<SmokeVerdict | null> {
  if (env.YORK_CURSOR_CLI !== 'unavailable') return null
  const verdict = probe ? await probe() : await cursorSmoke(env, true)
  if (!verdict?.ok) {
    if (verdict) env.YORK_CURSOR_CLI = 'unavailable'
    if (verdict && claudeNeedsSignIn(verdict.reason)) console.log('york-api cli cursor needs sign-in')
    return verdict ?? null
  }
  env.YORK_CURSOR_CLI = 'ready'
  console.log('york-api cli cursor status=ready reason=recovered')
  return verdict
}

export function startCursorReprobe(env: NodeJS.ProcessEnv = process.env): ReturnType<typeof setTimeout> {
  return armReprobe(env, 'cursor', (probeEnv) => recoverCursor(probeEnv))
}

async function smokeClis(env: NodeJS.ProcessEnv): Promise<void> {
  const jobs = [
    grokSmoke(env),
    cursorSmoke(env),
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
  if (name === 'grok' && grokVersionAboveTested(text)) {
    console.warn(`york-api cli grok is newer than tested ${GROK_CLI_MAX}. This tier stays on.`)
  }
}

setCliDownHook((env) => {
  if (env.YORK_GROK_CLI === 'unavailable') startGrokReprobe(env)
  if (env.YORK_CURSOR_CLI === 'unavailable') startCursorReprobe(env)
})
