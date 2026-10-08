import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

/** The signed-in user environment, minus the proxy secret. HOME stays put. */
export function providerChildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue
    if (key === 'YORK_PROXY_SECRET') continue
    next[key] = value
  }
  return next
}

export function grokArgs(): string[] {
  return ['-p']
}

export function claudeArgs(model: string): string[] {
  return [
    '-p',
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
  return ['exec', '--skip-git-repo-check']
}

async function completeCli(
  bin: string,
  args: string[],
  req: LlmRequest,
  signal: AbortSignal,
  run: ProcessRunner,
  env: NodeJS.ProcessEnv,
  options: ProcessRunOptions,
): Promise<string> {
  const prompt = `${req.system}\n\n${req.user}`
  const result = await run.run(bin, args, prompt, env, signal, options)
  if (result.code !== 0) throw new Error(result.stderr.trim() || `${bin} failed`)
  const text = result.stdout.trim()
  if (!text) throw new Error(`${bin} empty`)
  return text
}

async function completeLocal(
  prefix: string,
  bin: string,
  args: string[],
  req: LlmRequest,
  signal: AbortSignal,
  run: ProcessRunner,
  env: NodeJS.ProcessEnv,
  prepare?: (dir: string) => Promise<void>,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  try {
    if (prepare) await prepare(dir)
    return await completeCli(bin, args, req, signal, run, providerChildEnv(env), { cwd: dir })
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
  const bin = env.GROK_BIN || 'grok'
  return completeLocal('york-grok-', bin, grokArgs(), req, signal, run, env)
}

export async function completeClaude(
  req: LlmRequest,
  signal: AbortSignal,
  run: ProcessRunner,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const bin = env.CLAUDE_BIN || 'claude'
  return completeLocal('york-claude-', bin, claudeArgs(CLAUDE_MODEL), req, signal, run, env)
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

export async function prepareCursorWorkspace(workspace: string): Promise<void> {
  const dir = join(workspace, '.cursor')
  await mkdir(dir, { recursive: true })
  const { sandbox, cli } = cursorConfig()
  await writeFile(join(dir, 'sandbox.json'), JSON.stringify(sandbox))
  await writeFile(join(dir, 'cli-config.json'), JSON.stringify(cli))
  await writeFile(join(dir, 'cli.json'), JSON.stringify({ permissions: cli.permissions }))
}

export async function completeCursor(
  req: LlmRequest,
  signal: AbortSignal,
  run: ProcessRunner,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const bin = env.CURSOR_BIN || 'agent'
  const dir = await mkdtemp(join(tmpdir(), 'york-cursor-'))
  try {
    await prepareCursorWorkspace(dir)
    return await completeCli(bin, cursorArgs(CURSOR_MODEL, dir), req, signal, run, providerChildEnv(env), { cwd: dir })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export async function completeCodex(
  req: LlmRequest,
  signal: AbortSignal,
  run: ProcessRunner,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const bin = env.CODEX_BIN || 'codex'
  return completeLocal('york-codex-', bin, codexArgs(), req, signal, run, env)
}
