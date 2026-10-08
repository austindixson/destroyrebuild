import { spawn } from 'node:child_process'

export const CURSOR_CLI_MIN = '2026.10.01-e373342'
export const CLAUDE_CLI_MIN = '2.1.295'

const CURSOR_PIN = { year: 2026, month: 10, day: 1, hash: 'e373342' }
const CLAUDE_PIN = [2, 1, 295] as const

export function cursorVersionOk(text: string): boolean {
  const match = text.match(/(\d{4})\.(\d{2})\.(\d{2})-([0-9a-fA-F]+)/)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year !== CURSOR_PIN.year) return year > CURSOR_PIN.year
  if (month !== CURSOR_PIN.month) return month > CURSOR_PIN.month
  if (day !== CURSOR_PIN.day) return day > CURSOR_PIN.day
  return match[4]?.toLowerCase() === CURSOR_PIN.hash
}

export function claudeVersionOk(text: string): boolean {
  const match = text.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!match) return false
  const got = [Number(match[1]), Number(match[2]), Number(match[3])]
  for (let i = 0; i < CLAUDE_PIN.length; i += 1) {
    const part = got[i] ?? 0
    const pin = CLAUDE_PIN[i] ?? 0
    if (part !== pin) return part > pin
  }
  return true
}

function readVersion(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(bin, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    const timer = setTimeout(() => child.kill('SIGKILL'), 5_000)
    const done = (text: string | null) => {
      clearTimeout(timer)
      resolve(text)
    }
    child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr?.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.on('error', () => done(null))
    child.on('close', () => done(Buffer.concat(chunks).toString('utf8')))
  })
}

export async function probeAndLogClis(env: NodeJS.ProcessEnv): Promise<void> {
  await logOne(env, 'claude', env.CLAUDE_BIN || 'claude', claudeVersionOk, 'YORK_CLAUDE_CLI')
  await logOne(env, 'cursor', env.CURSOR_BIN || 'agent', cursorVersionOk, 'YORK_CURSOR_CLI')
}

async function logOne(
  env: NodeJS.ProcessEnv,
  name: string,
  bin: string,
  okText: (text: string) => boolean,
  flag: 'YORK_CLAUDE_CLI' | 'YORK_CURSOR_CLI',
): Promise<void> {
  const text = await readVersion(bin)
  const version = text?.trim() || 'missing'
  const ok = text !== null && okText(text)
  const status = ok ? 'ready' : 'unavailable'
  console.log(`york-api cli ${name} version=${version} status=${status}`)
  if (!ok) env[flag] = 'unavailable'
}
