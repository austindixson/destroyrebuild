import { LIVE_LABEL, NO_ANSWER } from './copy.ts'
import { dropUnmatchedQuotes, dropUntracedNumbers, labelLiveNumbers, stripMarkers, yorkFlaWording } from './guard.ts'
import { containsSecretMaterial, redactReason } from './leak.ts'
import { OPEN_DECLINE } from './prompt.ts'
import { steHits } from './steRuntime.ts'
import type { ChatSource, Chunk, LlmRequest, ToolResultIn } from './types.ts'

function corpusFor(snapshot: unknown, chunks: Chunk[], toolText: string): string {
  return `${JSON.stringify(snapshot)}\n${chunks.map((chunk) => chunk.text).join('\n')}\n${toolText}`
}

function toolText(results: ToolResultIn[]): string {
  return results.map((row) => (row.rows ? `${row.message}\n${JSON.stringify(row.rows)}` : row.message)).join('\n')
}

function sourcesFor(ids: string[], chunks: Chunk[]): ChatSource[] {
  const wanted = new Set(ids)
  return chunks
    .filter((chunk) => wanted.has(chunk.id))
    .map((chunk) => ({ id: chunk.id, title: chunk.title, href: chunk.href }))
}

function matchedCite(id: string, allowed: Set<string>): string {
  if (allowed.has(id)) return id
  const prefixed = `trainer:${id}`
  return allowed.has(prefixed) ? prefixed : ''
}

/** One passive or long sentence must not discard the rest of a real answer. */
function dropSteSentences(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((sentence) => sentence.length > 0 && steHits(sentence).length === 0)
    .join(' ')
}

const DECLINE_SENTENCES = OPEN_DECLINE.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter((part) => part.length > 0)

function caseOpen(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false
  return (snapshot as Record<string, unknown>).blocksWrites === true
}

function sentenceList(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((sentence) => sentence.length > 0)
}

/** An open case keeps the decline when the model wrote it. Other filters must not drop it. */
function restoreDecline(cleaned: string, raw: string, open: boolean): string {
  if (!open) return cleaned
  const have = new Set(sentenceList(cleaned))
  const kept = DECLINE_SENTENCES.filter((sentence) => raw.includes(sentence) && !have.has(sentence))
  if (kept.length === 0) return cleaned
  return [...kept, cleaned].filter((part) => part.length > 0).join(' ')
}

function logRaw(raw: string): void {
  if (process.env.YORK_DEBUG_RAW !== '1') return
  console.debug(`york-api finish raw=${redactReason(raw)}`)
}

type EmptyCode = 'ste-drop' | 'label-only' | 'quote-drop' | 'number-drop' | 'leak' | 'parse'

function logEmpty(reason: EmptyCode): void {
  console.log(`york-api finish empty reason=${reason}`)
}

function wipedReason(stripped: string, traced: string, quoted: string, ste: string, raw: string): EmptyCode {
  if (containsSecretMaterial(raw)) return 'leak'
  if (sentenceList(stripped).length === 0) return 'parse'
  if (sentenceList(traced).length === 0) return 'number-drop'
  if (sentenceList(quoted).length === 0) return 'quote-drop'
  if (sentenceList(ste).length === 0) return 'ste-drop'
  return 'label-only'
}

function withoutLabel(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((sentence) => sentence.length > 0 && sentence !== LIVE_LABEL)
    .join(' ')
}

export function polishAnswer(
  raw: string,
  citeIds: string[],
  chunks: Chunk[],
  snapshot: unknown,
  results: ToolResultIn[] = [],
  extraCorpus = '',
): { answer: string; sources: ChatSource[]; empty?: EmptyCode } {
  const allowed = new Set(chunks.map((chunk) => chunk.id))
  const knownCites = citeIds.map((id) => matchedCite(id, allowed)).filter(Boolean)
  const stripped = stripMarkers(yorkFlaWording(raw), allowed)
  const cites = stripped.cites.length > 0 ? stripped.cites : knownCites
  const traced = dropUntracedNumbers(
    stripped.text,
    `${corpusFor(snapshot, chunks.filter((chunk) => cites.includes(chunk.id)), toolText(results))}\n${extraCorpus}`,
  )
  const quoted = dropUnmatchedQuotes(traced)
  const ste = dropSteSentences(quoted)
  const clear = restoreDecline(labelLiveNumbers(ste), raw, caseOpen(snapshot))
  if (!withoutLabel(clear)) {
    return { answer: '', sources: [], empty: wipedReason(stripped.text, traced, quoted, ste, raw) }
  }
  return { answer: clear, sources: sourcesFor(cites, chunks) }
}

export async function finishAnswer(
  raw: string,
  citeIds: string[],
  chunks: Chunk[],
  snapshot: unknown,
  rewrite: (req: LlmRequest) => Promise<string>,
  results: ToolResultIn[] = [],
  extraCorpus = '',
): Promise<{ answer: string; sources: ChatSource[] }> {
  if (!raw.trim()) {
    logEmpty('parse')
    return { answer: NO_ANSWER, sources: [] }
  }
  logRaw(raw)
  if (containsSecretMaterial(raw)) {
    logEmpty('leak')
    return { answer: NO_ANSWER, sources: [] }
  }
  const first = polishAnswer(raw, citeIds, chunks, snapshot, results, extraCorpus)
  if (first.answer) return first
  logEmpty(first.empty ?? 'parse')
  try {
    const secondText = await rewrite({
      system: 'Rewrite the answer in short active sentences. Do not use contractions. Keep trainer-model on live numbers. Reply with the answer text only.',
      user: raw,
    })
    if (!secondText.trim()) {
      logEmpty('parse')
      return { answer: NO_ANSWER, sources: [] }
    }
    if (containsSecretMaterial(secondText)) {
      logEmpty('leak')
      return { answer: NO_ANSWER, sources: [] }
    }
    const second = polishAnswer(secondText, citeIds, chunks, snapshot, results, extraCorpus)
    if (second.answer) return second
    logEmpty(second.empty ?? 'parse')
    return { answer: NO_ANSWER, sources: [] }
  } catch {
    logEmpty('parse')
    return { answer: NO_ANSWER, sources: [] }
  }
}
