export function cliStarted(saved: { code?: number; stdout?: string; stderr?: string } | null | undefined): boolean

export function hasToolRecord(text: string): boolean

export function deniedToolAttempt(text: string): boolean

export function isRefusal(text: string): boolean

export function searchContained(text: string): boolean

export function claudeNoTools(text: string, args?: string[]): boolean

export function grokCanaryHook(command: string): {
  hooks: {
    SessionStart: { hooks: { type: string; command: string }[] }[]
  }
}

export function mergeCursorCanary(existingText: string, command: string): string
