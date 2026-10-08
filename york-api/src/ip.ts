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
