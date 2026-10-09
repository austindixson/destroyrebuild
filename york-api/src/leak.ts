const PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/
const PASSWD_LINE = /(?:^|[\s"'`(])[A-Za-z_][A-Za-z0-9_-]*:[*!x]:\d+:\d+:/
const TOKEN = /\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{8,}|xai-[A-Za-z0-9_-]{8,}|xox[a-z]-[A-Za-z0-9-]{8,}|gh[ohps]_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,}|sk_live_[A-Za-z0-9]{8,}|rk_live_[A-Za-z0-9]{8,}|AIza[0-9A-Za-z_-]{20,}|tskey-[A-Za-z0-9_-]{8,})/
const AWS_KEY = /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/
const AWS_SECRET = /(?:^|[\s"'`])aws_secret_access_key\s*=\s*\S+/i
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/
const ENV_LINE = /(?:^|[\n\r])\s*(?:export\s+)?[A-Z][A-Z0-9_]*(?:_KEY|_SECRET|_TOKEN|_PASSWORD)\s*=\s*\S+/
const ENCODED = /(?:c2stYW50|c2stcHJvag|eGFpLQ|c2tfbGl2ZQ|Z2hwX|Z2hvX|Z2hzX)[A-Za-z0-9+/=]{8,}|sk%2[Dd]/

function compactPrefixes(text: string): string {
  return text
    .replace(/sk-\s+/gi, 'sk-')
    .replace(/xai-\s+/gi, 'xai-')
    .replace(/ghp_\s+/gi, 'ghp_')
    .replace(/gho_\s+/gi, 'gho_')
    .replace(/ghs_\s+/gi, 'ghs_')
    .replace(/github_pat_\s+/gi, 'github_pat_')
    .replace(/tskey-\s+/gi, 'tskey-')
    .replace(/sk_live_\s+/gi, 'sk_live_')
    .replace(/rk_live_\s+/gi, 'rk_live_')
    .replace(/AIza\s+/g, 'AIza')
    .replace(/sk%2[Dd]/g, 'sk-')
}

function scan(text: string): boolean {
  if (PRIVATE_KEY.test(text)) return true
  if (PASSWD_LINE.test(text)) return true
  if (TOKEN.test(text)) return true
  if (AWS_KEY.test(text)) return true
  if (AWS_SECRET.test(text)) return true
  if (JWT.test(text)) return true
  if (ENV_LINE.test(text)) return true
  if (ENCODED.test(text)) return true
  return false
}

/** True when text holds a private key, a passwd line, a token, or a configured secret. */
export function containsSecretMaterial(text: string, secrets: readonly string[] = []): boolean {
  if (scan(text)) return true
  const compacted = compactPrefixes(text)
  if (compacted !== text && scan(compacted)) return true
  for (const secret of secrets) {
    if (secret.length >= 8 && text.includes(secret)) return true
  }
  return false
}

const TOKEN_G = new RegExp(TOKEN.source, 'g')
const AWS_KEY_G = new RegExp(AWS_KEY.source, 'g')
const JWT_G = new RegExp(JWT.source, 'g')

function redactTokens(text: string): string {
  return text
    .replace(TOKEN_G, '[redacted]')
    .replace(AWS_KEY_G, '[redacted]')
    .replace(JWT_G, '[redacted]')
    .replace(PRIVATE_KEY, '[redacted]')
}

/** First stderr line for an operator log. Tokens are removed. The prompt is not included. */
export function redactReason(text: string): string {
  const line = text.split(/\r?\n/).find((row) => row.trim().length > 0) ?? ''
  return redactTokens(line.trim().slice(0, 180))
}

/** Full debug text. Tokens are removed. The text is not cut. */
export function redactLog(text: string): string {
  return redactTokens(text)
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
