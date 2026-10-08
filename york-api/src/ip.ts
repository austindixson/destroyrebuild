/**
 * Client address for rate limits.
 *
 * Trusted header: X-Real-IP. On public Railway ingress the edge replaces this
 * header with the connecting client. It does not append the caller value.
 * Private *.railway.internal traffic is not sanitized, so it is not a client
 * identity. Caddy on the static site forwards the edge-written value.
 *
 * Fallback, only when X-Real-IP is absent: the rightmost hop of
 * X-Forwarded-For. The leftmost hop is client-supplied and is never used.
 * With neither header, the socket remote address is the identity.
 *
 * Budget keys use budgetKey(). IPv4 stays as written. IPv6 collapses to /64
 * so one client cannot rotate host bits. IPv4-mapped IPv6 uses the IPv4 form.
 */
export function trustedClientIp(
  headers: NodeJS.Dict<string | string[] | undefined>,
  socketAddr?: string | null,
): string {
  const real = oneAddress(headerValue(headers['x-real-ip']))
  if (real) return real
  const forwarded = oneAddress(headerValue(headers['x-forwarded-for']))
  if (forwarded) return forwarded
  const socket = socketAddr?.trim()
  return socket ? socket : 'local'
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    const last = value[value.length - 1]
    return typeof last === 'string' ? last.trim() : ''
  }
  return typeof value === 'string' ? value.trim() : ''
}

function oneAddress(raw: string): string {
  if (!raw) return ''
  if (!raw.includes(',')) return raw
  const hops = raw.split(',')
  for (let i = hops.length - 1; i >= 0; i -= 1) {
    const hop = hops[i]?.trim() ?? ''
    if (hop) return hop
  }
  return ''
}

export function budgetKey(ip: string): string {
  const raw = ip.trim().toLowerCase()
  const mapped = raw.startsWith('::ffff:') ? raw.slice('::ffff:'.length) : raw
  if (isIpv4(mapped)) return mapped
  const prefix = ipv6Prefix(raw)
  return prefix ?? raw
}

function isIpv4(value: string): boolean {
  const parts = value.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function ipv6Prefix(value: string): string | null {
  const hextets = expandIpv6(value)
  if (!hextets) return null
  return `${hextets.slice(0, 4).join(':')}::/64`
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
  const zeros = Array<string>(missing).fill('0000')
  const parts = [...left, ...zeros, ...right]
  if (parts.length !== 8) return null
  return parts.map((part) => part.padStart(4, '0'))
}
