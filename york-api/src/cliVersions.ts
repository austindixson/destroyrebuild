import { spawn } from 'node:child_process'
import { codexArgs, codexLaunchArgsOk, grokArgs, grokLaunchArgsOk } from './providers.ts'
import { resolveBin } from './sandbox.ts'

/** Log-and-warn floors. An older binary still serves. A missing binary does not. */
export const CLAUDE_CLI_MIN = '2.1.293'
export const CURSOR_CLI_MIN = '2026.07.17'
export const GROK_CLI_MIN = '1.0.50'

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

export async function probeAndLogClis(env: NodeJS.ProcessEnv): Promise<void> {
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
