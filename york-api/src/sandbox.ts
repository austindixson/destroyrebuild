import { execFileSync, spawn } from 'node:child_process'
import { accessSync, constants, realpathSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Deny-default seatbelt text. CLI launches do not apply it.
 * Run 3 on ghost128 at a5b48bf showed grok cannot start inside sandbox-exec
 * (forbidden-sandbox-reinit) and cursor stalled after the outer profile.
 * These helpers stay so unit tests can still read the profile text.
 *
 * The text is deny default, then allow system libraries and a short mach-lookup list.
 * The real home is denied. The CLI binary, its helper chain, and auth files
 * are allowed after that deny, so last-match still runs a binary that lives
 * under the home. A version directory under the home (cursor-agent, Claude,
 * grok downloads) is allowed after that deny, plus /usr/bin/env and /bin/bash.
 * The root inode is readable so stat of / succeeds. ~/Library/Keychains is
 * readable only when the caller asks, so Claude can open login.keychain-db.
 * Reads of /private/var are not opened. Only this call's temp directory is
 * writable. Linux tests check the text. They do not run sandbox-exec.
 *
 * A nested sandbox-exec inside this profile is allowed to start. macOS can
 * still refuse the inner sandbox. The startup probe uses /bin/cat, not a CLI.
 */
export interface SandboxSpec {
  realHome: string
  tempDir: string
  binPath: string
  execPaths: string[]
  allowRead: string[]
  /** Directories under the home that hold a CLI and its bundled runtime. */
  allowExecTrees?: string[]
  /** Read of ~/Library/Keychains. Claude opens login.keychain-db by path. */
  allowKeychain?: boolean
}

export interface LaunchCommand {
  cmd: string
  args: string[]
}

export interface SandboxProbeResult {
  ok: boolean
  reason: string
}

const HELPER_BINS = ['bash', 'sh', 'realpath', 'node', 'sandbox-exec', 'env', 'cat'] as const

const MACH_NAMES = [
  'com.apple.system.logger',
  'com.apple.system.notification_center',
  'com.apple.distributed_notifications.2',
  'com.apple.CoreServices.coreservicesd',
  'com.apple.coreservices.launchservicesd',
  'com.apple.lsd.mapdb',
  'com.apple.SecurityServer',
  'com.apple.securityd',
  'com.apple.secd',
  'com.apple.SecurityAgent',
  'com.apple.ocspd',
  'com.apple.trustd',
  'com.apple.system.DirectoryService.libinfo_v1',
  'com.apple.system.opendirectoryd.libinfo',
  'com.apple.system.opendirectoryd.membership',
  'com.apple.system.dirhelper',
  'com.apple.cfprefsd.agent',
  'com.apple.cfprefsd.daemon',
  'com.apple.fonts',
  'com.apple.FontObjectsServer',
] as const

const SYSTEM_READS = ['/usr', '/bin', '/sbin', '/System', '/Library', '/opt', '/dev'] as const

function sbString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function unique(paths: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const path of paths) {
    if (!path || seen.has(path)) continue
    seen.add(path)
    out.push(path)
  }
  return out
}

export function resolvedPath(path: string): string {
  if (!path) return path
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

export function resolveBin(bin: string, env: NodeJS.ProcessEnv): string | null {
  if (bin.includes('/')) {
    try {
      return realpathSync(bin)
    } catch {
      return null
    }
  }
  const path = env.PATH ?? ''
  for (const dir of path.split(':')) {
    if (!dir) continue
    const candidate = join(dir, bin)
    try {
      accessSync(candidate, constants.X_OK)
      return realpathSync(candidate)
    } catch {
      continue
    }
  }
  return null
}

export function helperExecPaths(env: NodeJS.ProcessEnv): string[] {
  const found: string[] = []
  for (const name of HELPER_BINS) {
    const resolved = resolveBin(name, env)
    if (resolved) found.push(resolved)
  }
  return found
}

const FIXED_INTERPRETERS = ['/usr/bin/env', '/bin/bash', '/bin/sh'] as const

/** Shebang interpreters. cursor-agent is `#!/usr/bin/env bash`. */
export function fixedInterpreters(): string[] {
  const found: string[] = []
  for (const path of FIXED_INTERPRETERS) {
    const resolved = resolvedPath(path)
    try {
      accessSync(resolved, constants.X_OK)
      found.push(resolved)
    } catch {
      // This host has no interpreter at that path.
    }
  }
  return found
}

const CLOSED_TREE = ['.grok', '.claude', '.cursor', '.codex', '.ssh', '.config', 'Library'] as const

/**
 * The directory that holds a CLI installed under the real home.
 * The home itself, and the auth directories, are not returned.
 */
export function execTreeUnderHome(resolved: string, realHome: string): string | null {
  if (!realHome.startsWith('/') || !resolved.startsWith(`${realHome}/`)) return null
  const dir = dirname(resolved)
  if (dir === realHome || dir === '/') return null
  if (CLOSED_TREE.some((name) => dir === `${realHome}/${name}`)) return null
  return dir
}

function filterBlock(op: string, paths: readonly string[], form: 'subpath' | 'literal'): string {
  const body = paths.map((path) => `(${form} ${sbString(path)})`).join('\n  ')
  return `(${op}\n  ${body})`
}

/** True when the profile text actually denies the absolute home. */
export function profileDeniesHome(profile: string, realHome: string): boolean {
  if (!profile.trim() || !realHome.startsWith('/')) return false
  if (profile.includes('$HOME') || profile.includes('~/')) return false
  if (!profile.includes(`(deny file-read* (subpath ${sbString(realHome)}))`)) return false
  if (profile.includes('(allow mach-lookup)')) return false
  if (profile.includes('(subpath "/private/var")')) return false
  return true
}

export function macSandboxProfile(spec: SandboxSpec): string {
  const home = spec.realHome
  const execs = unique(spec.execPaths.length > 0 ? spec.execPaths : [spec.binPath])
  const auth = unique(spec.allowRead)
  const mach = MACH_NAMES.map((name) => `(global-name ${sbString(name)})`).join('\n  ')
  const lines = [
    '(version 1)',
    '(deny default)',
    filterBlock('allow file-read*', SYSTEM_READS, 'subpath'),
    filterBlock('allow file-map-executable', SYSTEM_READS, 'subpath'),
    '(allow process-fork)',
    '(allow signal (target self))',
    '(allow sysctl-read)',
    '(allow ipc-posix-shm)',
    '(allow system-socket)',
    '(allow network-outbound)',
    '(allow network-bind)',
    `(allow mach-lookup\n  ${mach})`,
    `(allow file-ioctl (literal ${sbString('/dev/null')}))`,
    '(allow file-read* (literal "/"))',
    `(deny file-read* (subpath ${sbString('/Users')}))`,
    `(deny file-write* (subpath ${sbString('/Users')}))`,
    `(deny file-read* (subpath ${sbString(home)}))`,
    `(deny file-write* (subpath ${sbString(home)}))`,
    `(deny file-read* (subpath ${sbString(`${home}/.ssh`)}))`,
    `(deny file-write* (subpath ${sbString(`${home}/.ssh`)}))`,
    `(deny file-read* (subpath ${sbString(`${home}/.config`)}))`,
    `(deny file-write* (subpath ${sbString(`${home}/.config`)}))`,
    `(deny file-read* (subpath ${sbString(`${home}/.claude`)}))`,
    `(deny file-read* (literal ${sbString(`${home}/.claude/settings.json`)}))`,
    `(deny file-read* (subpath ${sbString(`${home}/.cursor`)}))`,
    `(deny file-read* (literal ${sbString(`${home}/.cursor/hooks.json`)}))`,
    `(deny file-read* (subpath ${sbString(`${home}/.grok/hooks`)}))`,
    `(deny file-read* (literal ${sbString(`${home}/.zshrc`)}))`,
    `(deny file-write* (literal ${sbString(`${home}/.zshrc`)}))`,
    `(deny file-write* (subpath ${sbString(`${home}/Library/LaunchAgents`)}))`,
    `(allow file-read* (subpath ${sbString(spec.tempDir)}))`,
    `(allow file-write* (subpath ${sbString(spec.tempDir)}))`,
  ]
  const trees = unique(spec.allowExecTrees ?? [])
  if (trees.length > 0) {
    lines.push(filterBlock('allow process-exec', trees, 'subpath'))
    lines.push(filterBlock('allow file-read*', trees, 'subpath'))
    lines.push(filterBlock('allow file-map-executable', trees, 'subpath'))
  }
  if (execs.length > 0) {
    lines.push(filterBlock('allow process-exec', execs, 'literal'))
    lines.push(filterBlock('allow file-read*', execs, 'literal'))
    lines.push(filterBlock('allow file-map-executable', execs, 'literal'))
  }
  if (spec.allowKeychain) {
    lines.push(`(allow file-read* (subpath ${sbString(`${home}/Library/Keychains`)}))`)
  }
  if (auth.length > 0) lines.push(filterBlock('allow file-read*', auth, 'literal'))
  lines.push(
    `(deny file-read* (subpath ${sbString(`${home}/.ssh`)}))`,
    `(deny file-read* (literal ${sbString(`${home}/.claude/settings.json`)}))`,
    `(deny file-read* (literal ${sbString(`${home}/.cursor/hooks.json`)}))`,
    `(deny file-read* (subpath ${sbString(`${home}/.grok/hooks`)}))`,
    `(deny file-write* (literal ${sbString(`${home}/.zshrc`)}))`,
    `(deny file-write* (subpath ${sbString(`${home}/Library/LaunchAgents`)}))`,
  )
  return `${lines.join('\n')}\n`
}

/** darwin wraps with sandbox-exec. Every other platform runs the CLI directly. */
export function launchCommand(bin: string, args: string[], profilePath: string | null, platform: NodeJS.Platform): LaunchCommand {
  if (platform === 'darwin' && profilePath) {
    return { cmd: 'sandbox-exec', args: ['-f', profilePath, '--', bin, ...args] }
  }
  return { cmd: bin, args: [...args] }
}

export function sandboxReady(env: NodeJS.ProcessEnv): boolean {
  return env.YORK_SANDBOX === 'ready'
}

let cachedGroup = 0

/** The server process group. A smoke kill must not signal this group. */
export function serverGroupId(): number {
  if (cachedGroup > 1) return cachedGroup
  try {
    const text = execFileSync('ps', ['-o', 'pgid=', '-p', String(process.pid)], { encoding: 'utf8' })
    const id = Number(text.trim().split(/\s+/)[0])
    if (Number.isFinite(id) && id > 1) {
      cachedGroup = id
      return cachedGroup
    }
  } catch {
    // ps can be missing in a tight sandbox.
  }
  cachedGroup = process.pid > 1 ? process.pid : 1
  return cachedGroup
}

type CliDownHook = (env: NodeJS.ProcessEnv) => void
let cliDownHook: CliDownHook | null = null

/** cliVersions registers this so a later unavailable mark arms the reprobe again. */
export function setCliDownHook(hook: CliDownHook): void {
  cliDownHook = hook
}

/** Fail closed. A failed probe turns every CLI tier off and arms the reprobes again. */
export function applySandboxProbe(env: NodeJS.ProcessEnv, result: SandboxProbeResult): void {
  if (!result.ok) {
    console.log(`york-api sandbox status=unavailable reason=${result.reason}`)
    env.YORK_SANDBOX = 'unavailable'
    env.YORK_GROK_CLI = 'unavailable'
    env.YORK_CURSOR_CLI = 'unavailable'
    env.YORK_CODEX_CLI = 'unavailable'
    cliDownHook?.(env)
    return
  }
  env.YORK_SANDBOX = 'ready'
  console.log('york-api sandbox status=ready')
}

function runCaptured(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    const out: Buffer[] = []
    const err: Buffer[] = []
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
    }, 5_000)
    child.stdout?.on('data', (chunk: Buffer) => out.push(chunk))
    child.stderr?.on('data', (chunk: Buffer) => err.push(chunk))
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ code: 1, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      })
    })
  })
}

/**
 * Confirms a denied read of a canary under the real home.
 * Non-darwin returns immediately and does not write that canary.
 */
export async function probeSandbox(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): Promise<SandboxProbeResult> {
  if (platform !== 'darwin') return { ok: false, reason: 'wrapper-skipped' }
  const sandboxExec = resolveBin('sandbox-exec', env)
  const cat = resolveBin('cat', env)
  if (!sandboxExec || !cat) return { ok: false, reason: 'sandbox-exec-missing' }
  const realHome = resolvedPath(env.HOME ?? '')
  if (!realHome.startsWith('/')) return { ok: false, reason: 'profile-void' }
  const marker = `york-probe-${process.pid}-${Date.now()}`
  const canary = join(realHome, `.york-probe-${process.pid}-${Date.now()}`)
  const temp = await mkdtemp(join(tmpdir(), 'york-probe-'))
  const tempReal = resolvedPath(temp)
  try {
    const execPaths = unique([cat, ...helperExecPaths(env)])
    const text = macSandboxProfile({
      realHome,
      tempDir: tempReal,
      binPath: cat,
      execPaths,
      allowRead: [],
    })
    if (!profileDeniesHome(text, realHome)) return { ok: false, reason: 'profile-void' }
    await writeFile(canary, `${marker}\n`, { mode: 0o600 })
    const profilePath = join(temp, 'probe.sb')
    await writeFile(profilePath, text)
    const result = await runCaptured(sandboxExec, ['-f', profilePath, '--', cat, canary], {
      PATH: env.PATH ?? '',
      HOME: tempReal,
      TMPDIR: tempReal,
    })
    if (result.stdout.includes(marker)) return { ok: false, reason: 'profile-void' }
    const denied = /operation not permitted|deny file-read|\bEPERM\b|\bEACCES\b|sandbox restriction/i.test(result.stderr)
    if (result.code !== 0 && denied) return { ok: true, reason: '' }
    return { ok: false, reason: 'profile-void' }
  } catch {
    return { ok: false, reason: 'profile-void' }
  } finally {
    await rm(canary, { force: true })
    await rm(temp, { recursive: true, force: true })
  }
}
