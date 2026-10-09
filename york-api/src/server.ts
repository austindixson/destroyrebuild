import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { pathToFileURL } from 'node:url'
import { probeAndLogClis } from './cliVersions.ts'
import { handleChat, defaultBudget } from './chat.ts'
import { UNAVAILABLE } from './copy.ts'
import index from '../data/trainer-index.json' with { type: 'json' }
import { defaultInflight, type Inflight } from './inflight.ts'
import { completeWithCascade, type CliTier } from './adapters.ts'
import { stampDeadline } from './deadline.ts'
import { headerText, proxySecretConfigured, proxySecretOk, trustedClientIp } from './ip.ts'
import { searchChunks } from './rag.ts'
import type { Budget } from './budget.ts'
import type { Chunk, LlmAnswer, LlmRequest } from './types.ts'

const chunks = index as Chunk[]
const MAX_BODY = 200_000
export const REQUEST_MS = 135_000

const CLI_TIERS = ['grok', 'claude', 'cursor', 'codex'] as const

export function readTier(value: string): CliTier | null {
  for (const tier of CLI_TIERS) {
    if (tier === value) return tier
  }
  return null
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

export function isLoopback(addr: string | null | undefined): boolean {
  return LOOPBACK.has((addr ?? '').trim().toLowerCase())
}

/**
 * The only-tier header is honored when YORK_ALLOW_TIER_OVERRIDE=1, the socket
 * is loopback, and the proxy secret matches. Caddy strips the header. The
 * LaunchAgent does not set the flag.
 */
export function yorkOnlyFrom(
  headers: NodeJS.Dict<string | string[] | undefined>,
  secret: string,
  env: NodeJS.ProcessEnv,
  socketAddr: string | null | undefined,
): CliTier | null {
  if (env.YORK_ALLOW_TIER_OVERRIDE !== '1') return null
  if (!isLoopback(socketAddr)) return null
  if (!proxySecretConfigured(secret)) return null
  if (!proxySecretOk(headerText(headers['x-york-proxy-secret']), secret)) return null
  return readTier(headerText(headers['x-york-only']))
}

type YorkRoute = 'health' | 'chat' | 'denied' | 'miss'

/** Route only. The request handler stays a switch over this result. */
export function yorkRoute(method: string | undefined, url: string, ip: string | null): YorkRoute {
  const path = url.split('?')[0] ?? ''
  if (path !== '/api/york/health' && path !== '/api/york/chat') return 'miss'
  if (!ip) return 'denied'
  if (method === 'GET' && path === '/api/york/health') return 'health'
  if (method === 'POST' && path === '/api/york/chat') return 'chat'
  return 'miss'
}

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
  stampDeadline(controller.signal, Date.now() + REQUEST_MS)
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
  only: CliTier | null,
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
      complete: options.complete ?? ((prompt, signal) => completeWithCascade(prompt, signal, process.env, only)),
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
    const ip = clientIp(req, proxySecret)
    const route = yorkRoute(req.method, url, ip)
    switch (route) {
      case 'health':
        send(res, 200, { ok: true })
        return
      case 'chat':
        void onChat(
          req,
          res,
          options,
          budget,
          inflight,
          ip ?? 'local',
          yorkOnlyFrom(req.headers, proxySecret, process.env, req.socket.remoteAddress),
        )
        return
      case 'denied':
        send(res, 200, { status: 'unavailable', answer: UNAVAILABLE })
        return
      case 'miss':
        send(res, 404, { status: 'error', answer: UNAVAILABLE })
        return
      default: {
        const neverRoute: never = route
        send(res, 404, { status: 'error', answer: UNAVAILABLE })
        return neverRoute
      }
    }
  })
}

const port = Number(process.env.PORT || 8787)
const host = process.env.YORK_BIND_HOST || '127.0.0.1'
const isMain = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
if (isMain) {
  const secret = process.env.YORK_PROXY_SECRET ?? ''
  if (!proxySecretConfigured(secret)) {
    console.error('YORK_PROXY_SECRET must be set and at least 16 characters. Refusing to listen.')
    process.exit(1)
  }
  await probeAndLogClis(process.env)
  createYorkServer({ proxySecret: secret }).listen(port, host)
}
