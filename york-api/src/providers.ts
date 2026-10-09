import { spawn, type ChildProcess } from 'node:child_process'
import { chmod, copyFile, lstat, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { redactReason } from './leak.ts'
import { resolvedPath } from './sandbox.ts'
import type { LlmRequest } from './types.ts'

export const GROK_MODEL = 'grok-4.7'
export const CLAUDE_MODEL = 'claude-haiku-5-5'
export const CURSOR_MODEL = 'auto'
export const CODEX_MODEL = 'codex'
export const CLI_STDOUT_MAX_BYTES = 256 * 1024
export const CLI_KILL_GRACE_MS = 200

/**
 * Deny rules written into the Cursor CLI config for the temp workspace.
 * Relative globs stay inside that workspace. Absolute globs name paths that
 * are outside it. readBoundary workspace is the general outside-read deny.
 */
export const CURSOR_READ_DENY = [
  'Read(.env*)',
  'Read(**/.env*)',
  'Read(**/*.key)',
  'Read(**/*.pem)',
  'Read(/etc/**)',
  'Read(/proc/**)',
  'Read(/home/**)',
  'Read(/Users/**)',
  'Read(~/**)',
  'Read(/root/**)',
  'Read(/opt/**)',
  'Read(/usr/**)',
  'Read(/var/**)',
  'Read(/run/**)',
] as const

export interface ProcessRun {
  code: number
  stdout: string
  stderr: string
}

export interface ProcessRunOptions {
  cwd?: string
  maxBytes?: number
  killGraceMs?: number
}

export interface ProcessRunner {
  run(
    cmd: string,
    args: string[],
    input: string,
    env: NodeJS.ProcessEnv,
    signal: AbortSignal,
    options?: ProcessRunOptions,
  ): Promise<ProcessRun>
}

function take(bucket: Buffer[], size: number, chunk: Buffer, max: number): number | null {
  const next = size + chunk.length
  if (next > max) return null
  bucket.push(chunk)
  return next
}

/**
 * Kills the child's process group.
 * A child that calls setsid leaves this group. The group kill does not reach it.
 */
function killGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid
  if (!pid) return
  try {
    process.kill(-pid, signal)
    return
  } catch {
    // The child is not a group leader.
  }
  try {
    child.kill(signal)
  } catch {
    // The process has already exited.
  }
}

/** True only when the process group has no members left. */
export function groupGone(pid: number): boolean {
  try {
    process.kill(-pid, 0)
    return false
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ESRCH'
  }
}

export const nodeRunner: ProcessRunner = {
  run(cmd, args, input, env, signal, options) {
    const max = options?.maxBytes ?? CLI_STDOUT_MAX_BYTES
    const grace = options?.killGraceMs ?? CLI_KILL_GRACE_MS
    if (signal.aborted) return Promise.reject(new Error('aborted'))
    return new Promise((resolveRun, reject) => {
      const child = spawn(cmd, args, {
        env,
        cwd: options?.cwd,
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const out: Buffer[] = []
      const err: Buffer[] = []
      let outSize = 0
      let errSize = 0
      let settled = false
      let failure: Error | null = null
      let code: number | null = null
      let killTimer: ReturnType<typeof setTimeout> | undefined
      let pollTimer: ReturnType<typeof setTimeout> | undefined
      const pid = child.pid

      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', onAbort)
        if (killTimer) clearTimeout(killTimer)
        if (pollTimer) clearTimeout(pollTimer)
        child.stdout?.destroy()
        child.stderr?.destroy()
        fn()
      }

      const release = () => {
        if (settled) return
        if (pid !== undefined && !groupGone(pid)) {
          killGroup(child, 'SIGKILL')
          if (pollTimer) clearTimeout(pollTimer)
          pollTimer = setTimeout(release, 20)
          return
        }
        finish(() => {
          if (failure) reject(failure)
          else resolveRun({
            code: code ?? 1,
            stdout: Buffer.concat(out).toString('utf8'),
            stderr: Buffer.concat(err).toString('utf8'),
          })
        })
      }

      const onAbort = () => {
        killGroup(child, 'SIGTERM')
        if (killTimer) clearTimeout(killTimer)
        killTimer = setTimeout(() => killGroup(child, 'SIGKILL'), grace)
      }

      signal.addEventListener('abort', onAbort, { once: true })
      const overflow = () => {
        failure = new Error('output too large')
        killGroup(child, 'SIGKILL')
      }
      child.stdout.on('data', (chunk: Buffer) => {
        const next = take(out, outSize, chunk, max)
        if (next === null) overflow()
        else outSize = next
      })
      child.stderr.on('data', (chunk: Buffer) => {
        const next = take(err, errSize, chunk, max)
        if (next === null) overflow()
        else errSize = next
      })
      child.stdin.on('error', () => {})
      child.stdout.on('error', () => {})
      child.stderr.on('error', () => {})
      child.on('error', (error) => {
        failure = error
        if (pid !== undefined) release()
        else finish(() => reject(error))
      })
      child.on('exit', (exited) => {
        code = exited
        // The main child is gone. Keep a group SIGKILL so a grandchild that
        // ignored SIGTERM, or that outlived a normal exit, does not stay up.
        // The slot stays held until kill(-pid, 0) returns ESRCH.
        killGroup(child, 'SIGKILL')
        const drain = setTimeout(() => release(), 50)
        child.once('close', () => {
          clearTimeout(drain)
          release()
        })
      })
      child.stdin.end(input)
    })
  },
}

const CWD_LEAK = new Set(['PWD', 'OLDPWD', 'INIT_CWD'])

/** The signed-in user environment, minus the proxy secret, the canary, and the caller's cwd. */
export function providerChildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue
    if (key === 'YORK_PROXY_SECRET' || key === 'YORK_CANARY') continue
    if (CWD_LEAK.has(key)) continue
    next[key] = value
  }
  return next
}

export const GROK_SANDBOX_PROFILE = 'york'

/** Compat scanners default on. York turns every one off. There is no --no-hooks flag. */
export const GROK_COMPAT_OFF: Record<string, string> = {
  GROK_CLAUDE_SKILLS_ENABLED: '0',
  GROK_CLAUDE_RULES_ENABLED: '0',
  GROK_CLAUDE_AGENTS_ENABLED: '0',
  GROK_CLAUDE_MCPS_ENABLED: '0',
  GROK_CLAUDE_HOOKS_ENABLED: '0',
  GROK_CURSOR_SKILLS_ENABLED: '0',
  GROK_CURSOR_RULES_ENABLED: '0',
  GROK_CURSOR_AGENTS_ENABLED: '0',
  GROK_CURSOR_MCPS_ENABLED: '0',
  GROK_CURSOR_HOOKS_ENABLED: '0',
  // Run 3 inspect on ghost128 showed these three session scanners off under this env.
  GROK_CLAUDE_SESSIONS_ENABLED: '0',
  GROK_CURSOR_SESSIONS_ENABLED: '0',
  GROK_CODEX_SESSIONS_ENABLED: '0',
}

const GROK_AUTH = ['auth.json', 'credentials.json', '.credentials.json'] as const
const CURSOR_AUTH = ['auth.json', 'cli-auth.json'] as const

export interface CliLaunch {
  cmd: string
  args: string[]
  env: NodeJS.ProcessEnv
  cwd: string
  input: string
}

/**
 * Run 11 on grok 1.0.50: an empty `--tools` value is ignored, and a non-empty
 * list only removes about six subagent and scheduler tools. `--disallowed-tools`
 * is the list that leaves the offered set empty. York does not pass `--tools`.
 */
export const GROK_DISALLOWED_TOOLS = [
  'read_file',
  'grep',
  'grep_search',
  'list_dir',
  'cat',
  'ls',
  'ps',
  'memory_get',
  'memory_search',
  'run_terminal_cmd',
  'run_terminal_command',
  'bash',
  'monitor',
  'search_replace',
  'write',
  'edit',
  'hashline_edit',
  'apply_patch',
  'task',
  'Agent',
  'kill_task',
  'get_task_output',
  'kill_command_or_subagent',
  'get_command_or_subagent_output',
  'spawn_subagent',
  'scheduler_create',
  'scheduler_delete',
  'scheduler_list',
  'workflow',
  'image_gen',
  'image_edit',
  'image_to_video',
  'reference_to_video',
  'use_tool',
  'search_tool',
  'todo_write',
  'todowrite',
  'ask_user_question',
  'send_feedback',
  'enter_plan_mode',
  'exit_plan_mode',
].join(',')

/** Headless grok does not read the prompt on stdin. --prompt-file is the supported path. */
export function grokArgs(promptFile: string): string[] {
  return [
    '--prompt-file',
    promptFile,
    '--permission-mode',
    'dontAsk',
    '--disable-web-search',
    '--no-subagents',
    '--no-memory',
    '--sandbox',
    GROK_SANDBOX_PROFILE,
    '--disallowed-tools',
    GROK_DISALLOWED_TOOLS,
  ]
}

export function grokLaunchArgsOk(args: string[]): boolean {
  const mode = args.indexOf('--permission-mode')
  const sandbox = args.indexOf('--sandbox')
  const blocked = args.indexOf('--disallowed-tools')
  const denied = blocked >= 0 ? args[blocked + 1] ?? '' : ''
  return mode >= 0
    && args[mode + 1] === 'dontAsk'
    && args.includes('--prompt-file')
    && sandbox >= 0
    && args[sandbox + 1] === GROK_SANDBOX_PROFILE
    && !args.includes('--tools')
    && denied === GROK_DISALLOWED_TOOLS
    && denied.includes('use_tool')
    && denied.includes('search_tool')
}

/** Permission deny for the copied auth tree. `--deny` takes `Read(glob)`. */
export function grokHomeReadDeny(grokHome: string): string {
  return `Read(${grokHome}/**)`
}

export function claudeArgs(model: string): string[] {
  return [
    '-p',
    '--safe-mode',
    '--no-session-persistence',
    '--model',
    model,
    '--strict-mcp-config',
    '--mcp-config',
    '{"mcpServers":{}}',
    '--output-format',
    'text',
    '--max-turns',
    '1',
    '--tools',
    '',
  ]
}

export function cursorArgs(model: string, workspace: string): string[] {
  return ['-p', '--model', model, '--mode', 'ask', '--output-format', 'text', '--sandbox', 'enabled', '--trust', '--workspace', workspace]
}

export function codexArgs(): string[] {
  return ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--ignore-user-config', '--ephemeral', '--ignore-rules']
}

export function codexLaunchArgsOk(args: string[]): boolean {
  const sandbox = args.indexOf('--sandbox')
  const value = sandbox >= 0 ? args[sandbox + 1] : undefined
  return Boolean(
    value
    && !value.startsWith('-')
    && args.includes('--ignore-user-config')
    && args.includes('--ephemeral')
    && args.includes('--ignore-rules'),
  )
}

function lineObject(line: string): Record<string, unknown> | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const whole = JSON.parse(trimmed) as unknown
    if (whole && typeof whole === 'object' && !Array.isArray(whole)) return whole as Record<string, unknown>
  } catch {
    // A prefixed line can still hold one object.
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const embedded = JSON.parse(trimmed.slice(start, end + 1)) as unknown
    if (embedded && typeof embedded === 'object' && !Array.isArray(embedded)) return embedded as Record<string, unknown>
  } catch {
    return null
  }
  return null
}

const GROK_STREAM = new Set([
  'text',
  'thought',
  'tool_call',
  'tool_call_update',
  'usage',
  'plan',
  'available_commands',
  'end',
  'error',
  'result',
])

function eventKind(row: Record<string, unknown>): string {
  return typeof row.type === 'string' ? row.type : ''
}

function streamEvents(text: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = []
  for (const line of text.split(/\r?\n/)) {
    const parsed = lineObject(line)
    if (parsed) events.push(parsed)
  }
  return events
}

function isGrokStream(events: Record<string, unknown>[]): boolean {
  for (const row of events) {
    if (GROK_STREAM.has(eventKind(row))) return true
  }
  return false
}

/** The tools list is the available_commands event. The end event does not carry it. */
export function grokAdvertisedTools(text: string): unknown[] | null {
  const events = streamEvents(text)
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const row = events[i]
    if (!row || eventKind(row) !== 'available_commands') continue
    return Array.isArray(row.tools) ? row.tools : null
  }
  return null
}

function resultEventText(events: Record<string, unknown>[]): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const row = events[i]
    if (!row || eventKind(row) !== 'result') continue
    return typeof row.result === 'string' ? row.result : null
  }
  return null
}

function joinedTextEvents(events: Record<string, unknown>[]): string {
  let out = ''
  for (const row of events) {
    if (eventKind(row) === 'text' && typeof row.data === 'string') out += row.data
  }
  return out
}

function streamReply(text: string): string | null {
  const events = streamEvents(text)
  if (!isGrokStream(events)) return null
  const result = resultEventText(events)
  if (result !== null) return result
  return joinedTextEvents(events)
}

/** Joined text from a streaming-json launch. A chat reply stays on replyText. */
export function grokStreamText(stdout: string): string {
  return streamReply(stdout.trim()) ?? ''
}

/** A reply that is only reasoning_effort tags is an empty failure. */
export function replyText(stdout: string): string {
  const text = stdout.trim()
  if (!text) return ''
  if (/^(?:\s*<reasoning_effort>\s*\d*\s*<\/reasoning_effort>\s*)+$/i.test(text)) return ''
  return text
}

export function grokConfigToml(): string {
  return [
    '[ui]',
    'permission_mode = "dontAsk"',
    '',
    '[compat.claude]',
    'skills = false',
    'rules = false',
    'agents = false',
    'mcps = false',
    'hooks = false',
    '',
    '[compat.cursor]',
    'skills = false',
    'rules = false',
    'agents = false',
    'mcps = false',
    'hooks = false',
    '',
  ].join('\n')
}

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

const OUTSIDE_WRITE_ROOTS = ['/tmp', '/private/tmp', '/var/tmp', '/private/var/tmp', '/Users'] as const

function pathCovers(root: string, dir: string): boolean {
  return dir === root || dir.startsWith(`${root}/`)
}

/** Deny roots that are not the request directory and not a parent of it. */
function outsideWriteDeny(writableDir: string): string[] {
  const found: string[] = []
  for (const root of OUTSIDE_WRITE_ROOTS) {
    if (writableDir && pathCovers(root, writableDir)) continue
    found.push(root, `${root}/**`)
  }
  return found
}

function grokWritable(realHome: string, writableDir: string): string[] {
  if (!writableDir.startsWith('/')) return []
  if (writableDir === realHome || writableDir.startsWith(`${realHome}/`)) return []
  return [
    'read_write = [',
    `  ${tomlString(writableDir)},`,
    `  ${tomlString(`${writableDir}/**`)},`,
    ']',
  ]
}

/**
 * Absolute deny paths. Grok 1.0.50 does not expand $HOME or ~. Those strings
 * became folders inside the cwd. Run 10 showed a deny of the temp GROK_HOME
 * makes grok exit with "Failed to load config: Operation not permitted".
 * The profile denies the real home and leaves the temp GROK_HOME off that list.
 * read_write names the per-request directory so grok can load config.toml there.
 * Other write roots (/Users, and /tmp when the request dir is elsewhere) are denied.
 */
export function grokSandboxToml(realHome: string, writableDir = ''): string {
  const home = realHome.startsWith('/') ? realHome : '/Users'
  const deny = [
    home,
    `${home}/**`,
    ...outsideWriteDeny(writableDir),
    `${home}/.ssh`,
    `${home}/.ssh/**`,
    `${home}/.config`,
    `${home}/.config/**`,
    `${home}/.zshrc`,
    `${home}/.claude`,
    `${home}/.claude/**`,
    `${home}/.claude/settings.json`,
    `${home}/.cursor`,
    `${home}/.cursor/**`,
    `${home}/.cursor/hooks.json`,
    `${home}/Library`,
    `${home}/Library/**`,
    `${home}/.grok`,
    `${home}/.grok/**`,
    `${home}/.grok/hooks`,
    `${home}/.grok/hooks/**`,
  ]
  return [
    '[profiles.york]',
    'extends = "strict"',
    'deny = [',
    ...deny.map((path) => `  ${tomlString(path)},`),
    ']',
    ...grokWritable(home, writableDir),
    '',
  ].join('\n')
}

function childEnv(env: NodeJS.ProcessEnv, extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = providerChildEnv(env)
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) next[key] = value
  }
  return next
}

function promptOf(req: LlmRequest): string {
  return `${req.system}\n\n${req.user}`
}

async function linkAuth(sourceDir: string, destDir: string, names: readonly string[]): Promise<void> {
  await mkdir(destDir, { recursive: true })
  for (const name of names) {
    const source = join(sourceDir, name)
    try {
      const info = await lstat(source)
      if (info.isDirectory()) continue
      await symlink(source, join(destDir, name))
    } catch {
      // The auth file is absent. The CLI may still use the keychain.
    }
  }
}

/**
 * Ghost128 stores the Claude account in ~/.claude.json. The login secrets
 * stay in the macOS login keychain. There is no ~/.claude/.credentials.json.
 */
async function copyClaudeAccount(realHome: string, homeDir: string): Promise<void> {
  const source = join(realHome, '.claude.json')
  try {
    const info = await lstat(source)
    if (!info.isFile() && !info.isSymbolicLink()) return
    const dest = join(homeDir, '.claude.json')
    await copyFile(source, dest)
    await chmod(dest, 0o600)
  } catch {
    // The account file is absent. Keychain login may still work.
  }
}

/** A copy, not a symlink. The seatbelt denies the real home, so a symlink would miss. */
async function copyAuth(sourceDir: string, destDir: string, names: readonly string[]): Promise<void> {
  await mkdir(destDir, { recursive: true })
  for (const name of names) {
    const source = join(sourceDir, name)
    try {
      const info = await lstat(source)
      if (!info.isFile() && !info.isSymbolicLink()) continue
      const dest = join(destDir, name)
      await copyFile(source, dest)
      await chmod(dest, 0o600)
    } catch {
      // The auth file is absent. The CLI may still use the keychain.
    }
  }
}

async function isolatedHome(dir: string): Promise<string> {
  const homeDir = join(dir, 'home')
  const claudeDir = join(homeDir, '.claude')
  await mkdir(claudeDir, { recursive: true })
  await mkdir(join(homeDir, '.config'), { recursive: true })
  await writeFile(join(claudeDir, 'settings.json'), `${JSON.stringify({ permissions: { allow: [], deny: [] }, hooks: {} })}\n`)
  return homeDir
}

/**
 * A temp HOME hides the login keychain. Claude and Cursor find
 * login.keychain-db by path under HOME/Library/Keychains.
 */
export async function linkLoginKeychain(realHome: string, homeDir: string): Promise<void> {
  if (!realHome.startsWith('/')) return
  const source = join(realHome, 'Library', 'Keychains', 'login.keychain-db')
  const destDir = join(homeDir, 'Library', 'Keychains')
  await mkdir(destDir, { recursive: true })
  try {
    const info = await lstat(source)
    if (!info.isFile() && !info.isSymbolicLink()) return
    await symlink(source, join(destDir, 'login.keychain-db'))
  } catch {
    // This host has no login keychain.
  }
}

async function requestTmp(dir: string): Promise<string> {
  const tmpDir = join(dir, 'tmp')
  await mkdir(tmpDir, { recursive: true })
  return tmpDir
}

function dropKeys(env: NodeJS.ProcessEnv, keys: readonly string[]): NodeJS.ProcessEnv {
  const next = { ...env }
  for (const key of keys) delete next[key]
  return next
}

function requestEnv(env: NodeJS.ProcessEnv, dir: string, extra: NodeJS.ProcessEnv, drop: readonly string[] = []): NodeJS.ProcessEnv {
  return dropKeys(childEnv(env, { ...extra, PWD: dir }), drop)
}

/** Exit code, the first stderr line, and the first stdout line when stderr is empty. */
export function failureReason(code: number | null, stderr: string, stdout = ''): string {
  const err = redactReason(stderr)
  const out = redactReason(stdout)
  const head = `exit=${code ?? 'null'} stderr=${err}`
  if (!out || out === err) return head
  return `${head} stdout=${out}`
}

/** The abort reason for a tier timer. A budget kill logs this string. */
export function timeoutReason(ms: number): string {
  return `timeout budget=${ms}`
}

export function budgetTimeoutReason(reason: unknown): string | null {
  if (typeof reason !== 'string') return null
  return /^timeout budget=\d+$/.test(reason) ? reason : null
}

async function runLaunch(launch: CliLaunch, signal: AbortSignal, run: ProcessRunner): Promise<string> {
  const result = await run.run(launch.cmd, launch.args, launch.input, launch.env, signal, { cwd: launch.cwd })
  const text = replyText(result.stdout)
  if (result.code === 0 && text) return text
  const timeout = signal.aborted ? budgetTimeoutReason(signal.reason) : null
  if (timeout) {
    console.log(`york-api cli launch failed reason=${timeout}`)
    throw new Error(timeout)
  }
  if (signal.aborted) {
    console.log('york-api cli launch failed reason=aborted')
    throw new Error('aborted')
  }
  if (result.code !== 0) {
    const reason = failureReason(result.code, result.stderr, result.stdout)
    console.log(`york-api cli launch failed reason=${redactReason(reason)}`)
    throw new Error(reason)
  }
  console.log('york-api cli launch failed reason=cli empty')
  throw new Error('cli empty')
}

export async function prepareGrokLaunch(
  dir: string,
  req: LlmRequest,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): Promise<CliLaunch> {
  void platform
  const realHome = resolvedPath(env.HOME ?? '')
  const homeDir = await isolatedHome(dir)
  const tmpDir = await requestTmp(dir)
  const grokHome = join(homeDir, '.grok')
  await mkdir(join(grokHome, 'hooks'), { recursive: true })
  await mkdir(join(dir, '.grok'), { recursive: true })
  const promptFile = join(dir, 'prompt.txt')
  await writeFile(promptFile, promptOf(req))
  await writeFile(join(grokHome, 'config.toml'), grokConfigToml())
  const sandbox = grokSandboxToml(realHome, resolvedPath(dir))
  await writeFile(join(grokHome, 'sandbox.toml'), sandbox)
  await writeFile(join(dir, '.grok', 'sandbox.toml'), sandbox)
  if (realHome) await copyAuth(join(realHome, '.grok'), grokHome, GROK_AUTH)
  const bin = env.GROK_BIN || 'grok'
  return {
    cmd: bin,
    args: [...grokArgs(promptFile), '--deny', grokHomeReadDeny(grokHome)],
    env: requestEnv(env, dir, {
      ...GROK_COMPAT_OFF,
      HOME: homeDir,
      GROK_HOME: grokHome,
      TMPDIR: tmpDir,
      CLAUDE_CONFIG_DIR: join(homeDir, '.claude'),
      XDG_CONFIG_HOME: join(homeDir, '.config'),
    }),
    cwd: dir,
    input: '',
  }
}

export async function prepareClaudeLaunch(
  dir: string,
  req: LlmRequest,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): Promise<CliLaunch> {
  void platform
  const realHome = resolvedPath(env.HOME ?? '')
  const homeDir = await isolatedHome(dir)
  const tmpDir = await requestTmp(dir)
  const bin = env.CLAUDE_BIN || 'claude'
  if (realHome) {
    await copyClaudeAccount(realHome, homeDir)
    await linkLoginKeychain(realHome, homeDir)
  }
  return {
    cmd: bin,
    args: claudeArgs(CLAUDE_MODEL),
    env: requestEnv(env, dir, {
      CLAUDE_CODE_SKIP_PROMPT_HISTORY: '1',
      HOME: homeDir,
      TMPDIR: tmpDir,
      XDG_CONFIG_HOME: join(homeDir, '.config'),
    }, ['CLAUDE_CONFIG_DIR']),
    cwd: dir,
    input: promptOf(req),
  }
}

export async function prepareCursorLaunch(
  dir: string,
  req: LlmRequest,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): Promise<CliLaunch> {
  void platform
  const realHome = resolvedPath(env.HOME ?? '')
  const homeDir = await isolatedHome(dir)
  const tmpDir = await requestTmp(dir)
  const configDir = await prepareCursorWorkspace(homeDir, realHome)
  if (realHome) await linkLoginKeychain(realHome, homeDir)
  const bin = env.CURSOR_BIN || 'agent'
  return {
    cmd: bin,
    args: cursorArgs(CURSOR_MODEL, dir),
    env: requestEnv(env, dir, {
      HOME: homeDir,
      TMPDIR: tmpDir,
      CURSOR_CONFIG_DIR: configDir,
      XDG_CONFIG_HOME: join(homeDir, '.config'),
    }, ['CLAUDE_CONFIG_DIR']),
    cwd: dir,
    input: promptOf(req),
  }
}

export async function prepareCodexLaunch(
  dir: string,
  req: LlmRequest,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): Promise<CliLaunch> {
  void platform
  const realHome = resolvedPath(env.HOME ?? '')
  const homeDir = await isolatedHome(dir)
  const tmpDir = await requestTmp(dir)
  const bin = env.CODEX_BIN || 'codex'
  if (realHome) {
    await linkAuth(join(realHome, '.codex'), join(homeDir, '.codex'), ['auth.json'])
    await linkLoginKeychain(realHome, homeDir)
  }
  return {
    cmd: bin,
    args: codexArgs(),
    env: requestEnv(env, dir, {
      HOME: homeDir,
      TMPDIR: tmpDir,
      CODEX_HOME: join(homeDir, '.codex'),
      XDG_CONFIG_HOME: join(homeDir, '.config'),
    }, ['CLAUDE_CONFIG_DIR']),
    cwd: dir,
    input: promptOf(req),
  }
}

async function completePrepared(
  prefix: string,
  prepare: (dir: string) => Promise<CliLaunch>,
  signal: AbortSignal,
  run: ProcessRunner,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  try {
    return await runLaunch(await prepare(dir), signal, run)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export async function completeGrok(
  req: LlmRequest,
  signal: AbortSignal,
  run: ProcessRunner,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  return completePrepared('york-grok-', (dir) => prepareGrokLaunch(dir, req, env), signal, run)
}

export async function completeClaude(
  req: LlmRequest,
  signal: AbortSignal,
  run: ProcessRunner,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  return completePrepared('york-claude-', (dir) => prepareClaudeLaunch(dir, req, env), signal, run)
}

function cursorConfig(): { sandbox: Record<string, unknown>; cli: Record<string, unknown> } {
  const sandbox = {
    type: 'workspace_readonly',
    readBoundary: 'workspace',
    additionalReadPaths: [] as string[],
    additionalReadwritePaths: [] as string[],
    additionalReadonlyPaths: [] as string[],
  }
  const cli = {
    version: 1,
    editor: { vimMode: false },
    sandbox: { readBoundary: 'workspace' },
    permissions: { allow: [] as string[], deny: [...CURSOR_READ_DENY] },
  }
  return { sandbox, cli }
}

export async function prepareCursorWorkspace(homeDir: string, realHome?: string): Promise<string> {
  const dir = join(homeDir, '.cursor')
  await mkdir(dir, { recursive: true })
  const { sandbox, cli } = cursorConfig()
  await writeFile(join(dir, 'sandbox.json'), JSON.stringify(sandbox))
  await writeFile(join(dir, 'cli-config.json'), JSON.stringify(cli))
  await writeFile(join(dir, 'cli.json'), JSON.stringify({ permissions: cli.permissions }))
  await writeFile(join(dir, 'hooks.json'), JSON.stringify({ version: 1, hooks: {} }))
  if (realHome) await linkAuth(join(realHome, '.cursor'), dir, CURSOR_AUTH)
  return dir
}

export async function completeCursor(
  req: LlmRequest,
  signal: AbortSignal,
  run: ProcessRunner,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  return completePrepared('york-cursor-', (dir) => prepareCursorLaunch(dir, req, env), signal, run)
}

export async function completeCodex(
  req: LlmRequest,
  signal: AbortSignal,
  run: ProcessRunner,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  return completePrepared('york-codex-', (dir) => prepareCodexLaunch(dir, req, env), signal, run)
}
