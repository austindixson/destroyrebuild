/**
 * Canary hook shapes for the live checklist.
 * Grok 1.0.50 reads hooks.SessionStart[].hooks[].type = "command".
 * Cursor keeps the existing sessionStart and beforeSubmitPrompt commands.
 */

const LAUNCH_FAIL = /sandbox-exec:\s*execvp|No such file or directory|\bENOENT\b|wrapper skipped|profile void/i
const TOOL_RECORD = /invoke_tool|Error: Permission denied|\bWebFetch\b|\bGrep\b|\bGlob\b/

/** True only after the CLI itself produced a reply or a tool record. A seatbelt launch error is not enough. */
export function cliStarted(saved) {
  const stdout = `${saved?.stdout ?? ''}`
  const stderr = `${saved?.stderr ?? ''}`
  const text = `${stdout}\n${stderr}`
  if (LAUNCH_FAIL.test(text) && !stdout.trim()) return false
  if (saved?.code === 71 && !stdout.trim()) return false
  if (stdout.trim() && !LAUNCH_FAIL.test(stdout)) return true
  if (TOOL_RECORD.test(text)) return true
  return false
}

export function grokCanaryHook(command) {
  return {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command }] }],
    },
  }
}

function hookList(hooks, name) {
  const value = hooks?.[name]
  return Array.isArray(value) ? value : []
}

/** Appends the canary. Existing commands, including the captain's, stay in the list. */
export function mergeCursorCanary(existingText, command) {
  let parsed = {}
  try {
    const value = JSON.parse(existingText || '{}')
    if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value
  } catch {
    parsed = {}
  }
  const hooks = parsed.hooks && typeof parsed.hooks === 'object' && !Array.isArray(parsed.hooks) ? parsed.hooks : {}
  const entry = { command }
  return JSON.stringify({
    ...parsed,
    version: typeof parsed.version === 'number' ? parsed.version : 1,
    hooks: {
      ...hooks,
      sessionStart: [...hookList(hooks, 'sessionStart'), entry],
      beforeSubmitPrompt: [...hookList(hooks, 'beforeSubmitPrompt'), entry],
    },
  }, null, 2)
}
