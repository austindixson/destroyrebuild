export function cliStarted(saved: { code?: number; stdout?: string; stderr?: string } | null | undefined): boolean

export function grokCanaryHook(command: string): {
  hooks: {
    SessionStart: { hooks: { type: string; command: string }[] }[]
  }
}

export function mergeCursorCanary(existingText: string, command: string): string
