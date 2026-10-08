import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { pathToFileURL } from 'node:url'
import { completeWithCascade } from './adapters.ts'
import { handleChat, defaultBudget } from './chat.ts'
import { UNAVAILABLE } from './copy.ts'
import index from '../data/trainer-index.json' with { type: 'json' }
import { searchChunks } from './rag.ts'
import type { Chunk } from './types.ts'

const chunks = index as Chunk[]
const budget = defaultBudget()
const MAX_BODY = 200_000

function send(res: ServerResponse, http: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(http, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) })
  res.end(payload)
}

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded
  if (typeof raw === 'string' && raw.trim()) return raw.split(',')[0]?.trim() || 'local'
  return req.socket.remoteAddress ?? 'local'
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

async function onChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const raw = await readJson(req)
    const result = await handleChat(raw, {
      ip: clientIp(req),
      now: () => Date.now(),
      budget,
      search: (query) => searchChunks(chunks, query),
      complete: (prompt, signal) => completeWithCascade(prompt, signal),
      signal: AbortSignal.timeout(100_000),
    })
    send(res, result.http, result.body)
  } catch {
    send(res, 200, { status: 'unavailable', answer: UNAVAILABLE })
  }
}

export function createYorkServer() {
  return createServer((req, res) => {
    const url = req.url ?? ''
    if (req.method === 'GET' && (url === '/api/york/health' || url.startsWith('/api/york/health?'))) {
      send(res, 200, { ok: true })
      return
    }
    if (req.method === 'POST' && (url === '/api/york/chat' || url.startsWith('/api/york/chat?'))) {
      void onChat(req, res)
      return
    }
    send(res, 404, { status: 'error', answer: UNAVAILABLE })
  })
}

const port = Number(process.env.PORT || 8787)
const isMain = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
if (isMain) createYorkServer().listen(port)
