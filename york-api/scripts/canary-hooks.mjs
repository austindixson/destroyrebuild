/**
 * Canary hook shapes for the live checklist.
 * Grok 1.0.50 reads hooks.SessionStart[].hooks[].type = "command".
 * Cursor keeps the existing sessionStart and beforeSubmitPrompt commands.
 */

const LAUNCH_FAIL = /sandbox-exec:\s*execvp|No such file or directory|\bENOENT\b|wrapper skipped|profile void/i
const TOOL_RECORD = /Error: Permission denied|PermissionDenied|readPermissionDenied|"tool_use"|\bWebFetch\b|\bGrep\b|\bGlob\b/
const DENIED_TOOL = /permissiondenied|readpermissiondenied|permission denied|access denied|operation not permitted|\bEPERM\b|\bEACCES\b|blocked by sandbox|blocked by permissions configuration|deny file-read|sandbox restriction|user cancelled|user rejected|isolated server/i
const REFUSAL = /\b(i will not|i cannot|cannot read|will not read|do not have (?:shell|file|tools)|no shell or file|does not contain|do not quote|not in the snapshot|not in the passages|no file quote|have no)\b/i
const CONTAINED = /workspace-scoped|workspace only|\b0 matches\b|\b0 paths\b|no matches/i

/** A structured tool record. Claude's plain-text `<invoke_tool>` tag is not one. */
export function hasToolRecord(text) {
  return TOOL_RECORD.test(text) && !/<invoke_tool\b/i.test(text)
}

export function deniedToolAttempt(text) {
  return DENIED_TOOL.test(text)
}

export function isRefusal(text) {
  return REFUSAL.test(text)
}

/** Cursor grep or glob that stayed inside the request workspace. */
export function searchContained(text) {
  return CONTAINED.test(text)
}

/** Claude was launched with an empty tool list, or the stream says tools is empty. */
export function claudeNoTools(text, args = []) {
  if (/"tools"\s*:\s*\[\s*\]/.test(text)) return true
  const at = args.indexOf('--tools')
  return at >= 0 && args[at + 1] === ''
}

/** True only after the CLI itself produced a reply or a tool record. A seatbelt launch error is not enough. */
export function cliStarted(saved) {
  const stdout = `${saved?.stdout ?? ''}`
  const stderr = `${saved?.stderr ?? ''}`
  const text = `${stdout}\n${stderr}`
  if (LAUNCH_FAIL.test(text) && !stdout.trim()) return false
  if (saved?.code === 71 && !stdout.trim()) return false
  if (stdout.trim() && !LAUNCH_FAIL.test(stdout)) return true
  if (hasToolRecord(text)) return true
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
