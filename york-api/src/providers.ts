import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LlmRequest } from './types.ts'

export const GROK_MODEL = 'grok-4.7'
export const CLAUDE_MODEL = 'claude-haiku-5-5'
export const CURSOR_MODEL = 'auto'
export const CLI_STDOUT_MAX_BYTES = 256 * 1024
export const CLI_KILL_GRACE_MS = 200
const GROK_URL = 'https://api.x.ai/v1/chat/completions'

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

export interface FetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export type FetchLike = (url: string, init: RequestInit) => Promise<FetchResponse>

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
      let killTimer: ReturnType<typeof setTimeout> | undefined
      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', onAbort)
        if (killTimer) clearTimeout(killTimer)
        fn()
      }
      const settle = (code: number | null) => {
        child.stdout?.destroy()
        child.stderr?.destroy()
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
      child.on('error', (error) => finish(() => reject(error)))
      child.on('exit', (code) => {
        const drain = setTimeout(() => settle(code), 100)
        child.once('close', () => {
          clearTimeout(drain)
          settle(code)
        })
      })
      child.stdin.end(input)
    })
  },
}

function textFromGrok(body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const choices = (body as { choices?: Array<{ message?: { content?: unknown } }> }).choices
  const content = choices?.[0]?.message?.content
  return typeof content === 'string' ? content.trim() : ''
}

export async function completeGrok(req: LlmRequest, signal: AbortSignal, fetchImpl: FetchLike, env: NodeJS.ProcessEnv): Promise<string> {
  const key = env.XAI_API_KEY
  if (!key) throw new Error('XAI_API_KEY missing')
  const model = env.XAI_MODEL || GROK_MODEL
  const res = await fetchImpl(GROK_URL, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    }),
  })
  if (!res.ok) throw new Error(`grok ${res.status}`)
  const text = textFromGrok(await res.json())
  if (!text) throw new Error('grok empty')
  return text
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

/** HOME is the temp workspace, so the child does not load the host CLI config. */
export function providerChildEnv(
  env: NodeJS.ProcessEnv,
  secretName: 'CLAUDE_CODE_OAUTH_TOKEN' | 'CURSOR_API_KEY',
  home: string,
): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { HOME: home, TMPDIR: home }
  if (typeof env.PATH === 'string' && env.PATH.length > 0) next.PATH = env.PATH
  const secret = env[secretName]
  if (typeof secret === 'string' && secret.length > 0) next[secretName] = secret
  return next
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

export async function completeClaude(
  req: LlmRequest,
  signal: AbortSignal,
  run: ProcessRunner,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  if (!env.CLAUDE_CODE_OAUTH_TOKEN) throw new Error('CLAUDE_CODE_OAUTH_TOKEN missing')
  const home = await mkdtemp(join(tmpdir(), 'york-claude-'))
  try {
    const bin = env.CLAUDE_BIN || 'claude'
    const childEnv = providerChildEnv(env, 'CLAUDE_CODE_OAUTH_TOKEN', home)
    return await completeCli(bin, claudeArgs(CLAUDE_MODEL), req, signal, run, childEnv, { cwd: home })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
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

async function prepareCursorWorkspace(workspace: string): Promise<void> {
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
  if (!env.CURSOR_API_KEY) throw new Error('CURSOR_API_KEY missing')
  const home = await mkdtemp(join(tmpdir(), 'york-cursor-'))
  try {
    await prepareCursorWorkspace(home)
    const bin = env.CURSOR_BIN || 'agent'
    const childEnv = providerChildEnv(env, 'CURSOR_API_KEY', home)
    return await completeCli(bin, cursorArgs(CURSOR_MODEL, home), req, signal, run, childEnv, { cwd: home })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}
