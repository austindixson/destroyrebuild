import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { pathToFileURL } from 'node:url'
import { completeWithCascade } from './adapters.ts'
import { probeAndLogClis } from './cliVersions.ts'
import { handleChat, defaultBudget } from './chat.ts'
import { UNAVAILABLE } from './copy.ts'
import index from '../data/trainer-index.json' with { type: 'json' }
import { defaultInflight, type Inflight } from './inflight.ts'
import { trustedClientIp } from './ip.ts'
import { searchChunks } from './rag.ts'
import type { Budget } from './budget.ts'
import type { Chunk, LlmAnswer, LlmRequest } from './types.ts'

const chunks = index as Chunk[]
const MAX_BODY = 200_000
const REQUEST_MS = 100_000

export interface YorkServerOptions {
  complete?: (req: LlmRequest, signal: AbortSignal) => Promise<LlmAnswer>
  budget?: Budget
  inflight?: Inflight
  search?: (query: string) => Chunk[]
  proxySecret?: string
}

function send(res: ServerResponse, http: number, body: unknown): void {
  if (res.writableEnded || res.destroyed) return
  const payload = JSON.stringify(body)
  res.writeHead(http, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) })
  res.end(payload)
}

function clientIp(req: IncomingMessage, secret: string): string | null {
  return trustedClientIp(req.headers, req.socket.remoteAddress, secret)
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const parts: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buf.length
    if (size > MAX_BODY) throw new Error('too big')
    parts.push(buf)
  }
  if (size === 0) return {}
  return JSON.parse(Buffer.concat(parts).toString('utf8'))
}

function requestSignal(res: ServerResponse): { signal: AbortSignal; stop(): void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_MS)
  const onGone = () => {
    if (!res.writableFinished) controller.abort()
  }
  res.on('close', onGone)
  return {
    signal: controller.signal,
    stop() {
      clearTimeout(timer)
      res.off('close', onGone)
    },
  }
}

async function onChat(
  req: IncomingMessage,
  res: ServerResponse,
  options: YorkServerOptions,
  budget: Budget,
  inflight: Inflight,
  ip: string,
): Promise<void> {
  const abort = requestSignal(res)
  try {
    const raw = await readJson(req)
    const result = await handleChat(raw, {
      ip,
      now: () => Date.now(),
      budget,
      inflight,
      search: options.search ?? ((query) => searchChunks(chunks, query)),
      complete: options.complete ?? ((prompt, signal) => completeWithCascade(prompt, signal)),
      signal: abort.signal,
    })
    send(res, result.http, result.body)
  } catch {
    send(res, 200, { status: 'unavailable', answer: UNAVAILABLE })
  } finally {
    abort.stop()
  }
}

export function createYorkServer(options: YorkServerOptions = {}) {
  const budget = options.budget ?? defaultBudget()
  const inflight = options.inflight ?? defaultInflight()
  const proxySecret = options.proxySecret ?? ''
  return createServer((req, res) => {
    const url = req.url ?? ''
    const york = url.startsWith('/api/york/health') || url.startsWith('/api/york/chat')
    const ip = york ? clientIp(req, proxySecret) : 'local'
    if (york && !ip) {
      send(res, 200, { status: 'unavailable', answer: UNAVAILABLE })
      return
    }
    if (req.method === 'GET' && (url === '/api/york/health' || url.startsWith('/api/york/health?'))) {
      send(res, 200, { ok: true })
      return
    }
    if (req.method === 'POST' && (url === '/api/york/chat' || url.startsWith('/api/york/chat?'))) {
      void onChat(req, res, options, budget, inflight, ip ?? 'local')
      return
    }
    send(res, 404, { status: 'error', answer: UNAVAILABLE })
  })
}

const port = Number(process.env.PORT || 8787)
const host = process.env.YORK_BIND_HOST || '127.0.0.1'
const isMain = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
if (isMain) {
  await probeAndLogClis(process.env)
  createYorkServer({ proxySecret: process.env.YORK_PROXY_SECRET ?? '' }).listen(port, host)
}
