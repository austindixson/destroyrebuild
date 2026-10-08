import { accessSync, constants, realpathSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Outer macOS seatbelt for a york CLI call.
 * deny default, then allow the CLI binary, system libraries, temp writes,
 * and network for the model API. $HOME and /Users are denied. Auth files are
 * allow-listed after that deny. Last-match is the intended evaluation.
 * This module does not run sandbox-exec. Linux tests only check the text.
 */
export interface SandboxSpec {
  home: string
  tempDir: string
  binPath: string
  allowRead: string[]
}

export interface LaunchCommand {
  cmd: string
  args: string[]
}

function sbString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
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

export function macSandboxProfile(spec: SandboxSpec): string {
  const systemReads = ['/usr', '/bin', '/sbin', '/System', '/Library', '/opt', '/dev', '/private/tmp', '/private/var', '/tmp']
  const readFilters = systemReads.map((path) => `(subpath ${sbString(path)})`).join('\n  ')
  const auth = spec.allowRead.map((path) => `(literal ${sbString(path)})`).join('\n  ')
  const home = spec.home
  const lines = [
    '(version 1)',
    '(deny default)',
    '(allow process-fork)',
    '(allow signal (target self))',
    '(allow sysctl-read)',
    '(allow mach-lookup)',
    '(allow ipc-posix-shm)',
    '(allow system-socket)',
    '(allow network-outbound)',
    '(allow network-bind)',
    '(allow file-map-executable)',
    `(allow file-ioctl (literal ${sbString('/dev/null')}))`,
    `(allow process-exec (literal ${sbString(spec.binPath)}))`,
    `(allow file-read*\n  ${readFilters}\n  (literal ${sbString(spec.binPath)}))`,
    `(deny file-read* (subpath ${sbString('/Users')}))`,
    `(deny file-write* (subpath ${sbString('/Users')}))`,
    `(deny file-read* (subpath ${sbString(home)}))`,
    `(deny file-write* (subpath ${sbString(home)}))`,
    `(allow file-read* (subpath ${sbString(spec.tempDir)}))`,
    `(allow file-write* (subpath ${sbString(spec.tempDir)}))`,
    `(allow file-write* (subpath ${sbString('/private/tmp')}))`,
    `(allow file-write* (subpath ${sbString('/tmp')}))`,
  ]
  if (auth) lines.push(`(allow file-read*\n  ${auth})`)
  lines.push(
    `(deny file-read* (subpath ${sbString(`${home}/.ssh`)}))`,
    `(deny file-read* (subpath ${sbString(`${home}/.config`)}))`,
    `(deny file-read* (subpath ${sbString(`${home}/Library`)}))`,
    `(deny file-write* (literal ${sbString(`${home}/.zshrc`)}))`,
    `(deny file-write* (subpath ${sbString(`${home}/Library/LaunchAgents`)}))`,
    `(deny file-read* (subpath ${sbString(`${home}/.grok/hooks`)}))`,
    `(deny file-read* (literal ${sbString(`${home}/.cursor/hooks.json`)}))`,
    `(deny file-read* (literal ${sbString(`${home}/.claude/settings.json`)}))`,
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
