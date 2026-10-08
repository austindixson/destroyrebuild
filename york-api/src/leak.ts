const PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/
const PASSWD_LINE = /(?:^|[\s"'`(])[A-Za-z_][A-Za-z0-9_-]*:[*!x]:\d+:\d+:/
const TOKEN = /\b(?:sk-[A-Za-z0-9]{8,}|xox[a-z]-[A-Za-z0-9-]{8,}|ghp_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,})/

/** True when text holds a private key, a passwd line, a token, or a configured secret. */
export function containsSecretMaterial(text: string, secrets: readonly string[] = []): boolean {
  if (PRIVATE_KEY.test(text)) return true
  if (PASSWD_LINE.test(text)) return true
  if (TOKEN.test(text)) return true
  for (const secret of secrets) {
    if (secret.length >= 8 && text.includes(secret)) return true
  }
  return false
}

/** Proxy secret and canary, when they are long enough to be unambiguous. */
export function publicSecrets(env: NodeJS.ProcessEnv = process.env): string[] {
  const found: string[] = []
  const proxy = env.YORK_PROXY_SECRET
  if (typeof proxy === 'string' && proxy.length >= 16) found.push(proxy)
  const canary = env.YORK_CANARY
  if (typeof canary === 'string' && canary.length >= 8) found.push(canary)
  return found
}
