import { spawn } from 'node:child_process'
import type { LlmRequest } from './types.ts'

export const GROK_MODEL = 'grok-4.7'
export const CLAUDE_MODEL = 'claude-haiku-5-5'
export const CURSOR_MODEL = 'auto'
const GROK_URL = 'https://api.x.ai/v1/chat/completions'

export interface ProcessRun {
  code: number
  stdout: string
  stderr: string
}

export interface ProcessRunner {
  run(cmd: string, args: string[], input: string, env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<ProcessRun>
}

export interface FetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export type FetchLike = (url: string, init: RequestInit) => Promise<FetchResponse>

export const nodeRunner: ProcessRunner = {
  run(cmd, args, input, env, signal) {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { env, stdio: ['pipe', 'pipe', 'pipe'], signal })
      const out: Buffer[] = []
      const err: Buffer[] = []
      child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
      child.stderr.on('data', (chunk: Buffer) => err.push(chunk))
      child.on('error', reject)
      child.on('close', (code) => {
        resolve({ code: code ?? 1, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') })
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
  return ['-p', '--model', model, '--output-format', 'text', '--max-turns', '1', '--tools', '']
}

export function cursorArgs(model: string, workspace: string): string[] {
  return ['-p', '--model', model, '--mode', 'ask', '--output-format', 'text', '--sandbox', 'enabled', '--trust', '--workspace', workspace]
}

async function completeCli(
  bin: string,
  args: string[],
  req: LlmRequest,
  signal: AbortSignal,
  run: ProcessRunner,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const prompt = `${req.system}\n\n${req.user}`
  const result = await run.run(bin, args, prompt, env, signal)
  if (result.code !== 0) throw new Error(result.stderr.trim() || `${bin} failed`)
  const text = result.stdout.trim()
  if (!text) throw new Error(`${bin} empty`)
  return text
}

export function completeClaude(req: LlmRequest, signal: AbortSignal, run: ProcessRunner, env: NodeJS.ProcessEnv): Promise<string> {
  if (!env.CLAUDE_CODE_OAUTH_TOKEN) return Promise.reject(new Error('CLAUDE_CODE_OAUTH_TOKEN missing'))
  const bin = env.CLAUDE_BIN || 'claude'
  return completeCli(bin, claudeArgs(CLAUDE_MODEL), req, signal, run, env)
}

export function completeCursor(req: LlmRequest, signal: AbortSignal, run: ProcessRunner, env: NodeJS.ProcessEnv, workspace: string): Promise<string> {
  if (!env.CURSOR_API_KEY) return Promise.reject(new Error('CURSOR_API_KEY missing'))
  const bin = env.CURSOR_BIN || 'agent'
  return completeCli(bin, cursorArgs(CURSOR_MODEL, workspace), req, signal, run, env)
}
