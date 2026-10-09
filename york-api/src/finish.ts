import { NO_ANSWER } from './copy.ts'
import { dropUntracedNumbers, labelLiveNumbers, stripMarkers, yorkFlaWording } from './guard.ts'
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

export function polishAnswer(
  raw: string,
  citeIds: string[],
  chunks: Chunk[],
  snapshot: unknown,
  results: ToolResultIn[] = [],
): { answer: string; sources: ChatSource[] } {
  const allowed = new Set(chunks.map((chunk) => chunk.id))
  const knownCites = citeIds.map((id) => matchedCite(id, allowed)).filter(Boolean)
  const stripped = stripMarkers(yorkFlaWording(raw), allowed)
  const cites = stripped.cites.length > 0 ? stripped.cites : knownCites
  const traced = dropUntracedNumbers(
    stripped.text,
    corpusFor(snapshot, chunks.filter((chunk) => cites.includes(chunk.id)), toolText(results)),
  )
  const clear = dropSteSentences(labelLiveNumbers(traced))
  if (!clear) return { answer: '', sources: [] }
  return { answer: clear, sources: sourcesFor(cites, chunks) }
}

export async function finishAnswer(
  raw: string,
  citeIds: string[],
  chunks: Chunk[],
  snapshot: unknown,
  rewrite: (req: LlmRequest) => Promise<string>,
  results: ToolResultIn[] = [],
): Promise<{ answer: string; sources: ChatSource[] }> {
  if (!raw.trim()) return { answer: NO_ANSWER, sources: [] }
  const first = polishAnswer(raw, citeIds, chunks, snapshot, results)
  if (first.answer) return first
  try {
    const secondText = await rewrite({
      system: 'Rewrite the answer in short active sentences. Do not use contractions. Keep trainer-model on live numbers. Reply with the answer text only.',
      user: raw,
    })
    const second = polishAnswer(secondText, citeIds, chunks, snapshot, results)
    if (second.answer) return second
    return { answer: NO_ANSWER, sources: [] }
  } catch {
    return { answer: NO_ANSWER, sources: [] }
  }
}
