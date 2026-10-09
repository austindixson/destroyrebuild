import { timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'

/**
 * Client address for rate limits.
 *
 * The public path is Railway Caddy, then Tailscale Funnel, then this process
 * on 127.0.0.1. Caddy sets X-York-Proxy-Secret and copies the edge
 * X-Real-IP header into X-York-Client-IP. York trusts that client IP
 * header only after the secret matches. The value must be one IP. A repeated
 * header, a comma-joined list, or a missing header on a proxied request is
 * rejected. York does not fall back to the socket, and it does not read
 * X-Real-IP or X-Forwarded-For as a client identity.
 *
 * With no configured secret, the socket address is the identity and forwarded
 * headers are ignored.
 *
 * Budget keys use budgetKey(). IPv4 stays as written. IPv4-mapped IPv6,
 * including the hex form ::ffff:cb00:7105, uses the IPv4 form so it does not
 * share the ::/64 bucket with ::1. NAT64 64:ff9b::/96 does the same. Other
 * IPv6 addresses collapse to /64.
 */
export const PROXY_SECRET_MIN = 16

export function proxySecretConfigured(secret: string | undefined): boolean {
  return typeof secret === 'string' && secret.length >= PROXY_SECRET_MIN
}

export function proxySecretOk(provided: string, secret: string): boolean {
  const got = Buffer.from(provided)
  const want = Buffer.from(secret)
  if (got.length !== want.length) {
    timingSafeEqual(want, want)
    return false
  }
  return timingSafeEqual(got, want)
}

export function headerText(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    const last = value[value.length - 1]
    return typeof last === 'string' ? last.trim() : ''
  }
  return typeof value === 'string' ? value.trim() : ''
}

/** One IP, or null. Arrays and comma-joined hop lists are rejected. */
export function clientHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return null
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.includes(',')) return null
  if (isIP(text) === 0) return null
  return text
}

export function trustedClientIp(
  headers: NodeJS.Dict<string | string[] | undefined>,
  socketAddr: string | null | undefined,
  secret: string,
): string | null {
  const socket = socketAddr?.trim() || 'local'
  if (!secret) return socket
  if (!proxySecretOk(headerText(headers['x-york-proxy-secret']), secret)) return null
  return clientHeader(headers['x-york-client-ip'])
}

export function budgetKey(ip: string): string {
  const raw = (ip.trim().toLowerCase().split('%')[0] ?? '').trim()
  if (isIpv4(raw)) return raw
  const expanded = expandIpv6(embedDotted(raw))
  if (!expanded) return raw
  if (isMapped(expanded) || isNat64(expanded)) return ipv4FromLast(expanded)
  return `${expanded.slice(0, 4).join(':')}::/64`
}

function isIpv4(value: string): boolean {
  const parts = value.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function embedDotted(value: string): string {
  const match = value.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (!match?.[1] || !match[2] || !isIpv4(match[2])) return value
  const parts = match[2].split('.').map((part) => Number(part))
  const hi = (((parts[0] ?? 0) << 8) | (parts[1] ?? 0)).toString(16)
  const lo = (((parts[2] ?? 0) << 8) | (parts[3] ?? 0)).toString(16)
  return `${match[1]}${hi}:${lo}`
}

function ipv4FromLast(hextets: string[]): string {
  const hi = Number.parseInt(hextets[6] ?? '0', 16)
  const lo = Number.parseInt(hextets[7] ?? '0', 16)
  const n = ((hi << 16) | lo) >>> 0
  return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`
}

function isMapped(hextets: string[]): boolean {
  return hextets[5] === 'ffff' && hextets.slice(0, 5).every((part) => part === '0000')
}

function isNat64(hextets: string[]): boolean {
  return hextets[0] === '0064'
    && hextets[1] === 'ff9b'
    && hextets.slice(2, 6).every((part) => part === '0000')
}

function splitSide(side: string): string[] | null {
  if (!side) return []
  const parts = side.split(':')
  if (parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null
  return parts
}

function expandIpv6(value: string): string[] | null {
  const head = value.split('%')[0] ?? ''
  if (!head.includes(':')) return null
  const sides = head.split('::')
  if (sides.length > 2) return null
  const left = splitSide(sides[0] ?? '')
  const right = sides.length === 2 ? splitSide(sides[1] ?? '') : []
  if (!left || !right) return null
  const missing = 8 - left.length - right.length
  if (sides.length === 1 && missing !== 0) return null
  if (sides.length === 2 && missing < 1) return null
  const zeros = Array<string>(Math.max(0, missing)).fill('0000')
  const parts = [...left, ...zeros, ...right]
  if (parts.length !== 8) return null
  return parts.map((part) => part.padStart(4, '0'))
}
