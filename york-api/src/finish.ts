import { NO_ANSWER } from './copy.ts'
import { dropUntracedNumbers, labelLiveNumbers, stripMarkers, yorkFlaWording } from './guard.ts'
import { steHits } from './steRuntime.ts'
import type { ChatSource, Chunk, LlmRequest } from './types.ts'

function corpusFor(snapshot: unknown, chunks: Chunk[]): string {
  return `${JSON.stringify(snapshot)}\n${chunks.map((chunk) => chunk.text).join('\n')}`
}

function sourcesFor(ids: string[], chunks: Chunk[]): ChatSource[] {
  const wanted = new Set(ids)
  return chunks
    .filter((chunk) => wanted.has(chunk.id))
    .map((chunk) => ({ id: chunk.id, title: chunk.title, href: chunk.href }))
}

export function polishAnswer(raw: string, citeIds: string[], chunks: Chunk[], snapshot: unknown): { answer: string; sources: ChatSource[] } {
  const allowed = new Set(chunks.map((chunk) => chunk.id))
  const knownCites = citeIds.filter((id) => allowed.has(id))
  const stripped = stripMarkers(yorkFlaWording(raw), allowed)
  const cites = stripped.cites.length > 0 ? stripped.cites : knownCites
  const traced = dropUntracedNumbers(stripped.text, corpusFor(snapshot, chunks.filter((chunk) => cites.includes(chunk.id))))
  const labeled = labelLiveNumbers(traced)
  if (!labeled || steHits(labeled).length > 0) return { answer: '', sources: [] }
  return { answer: labeled, sources: sourcesFor(cites, chunks) }
}

export async function finishAnswer(
  raw: string,
  citeIds: string[],
  chunks: Chunk[],
  snapshot: unknown,
  rewrite: (req: LlmRequest) => Promise<string>,
): Promise<{ answer: string; sources: ChatSource[] }> {
  if (!raw.trim()) return { answer: NO_ANSWER, sources: [] }
  const first = polishAnswer(raw, citeIds, chunks, snapshot)
  if (first.answer) return first
  try {
    const secondText = await rewrite({
      system: 'Rewrite the answer in short active sentences. Do not use contractions. Keep trainer-model on live numbers. Reply with the answer text only.',
      user: raw,
    })
    const second = polishAnswer(secondText, citeIds, chunks, snapshot)
    if (second.answer) return second
    return { answer: NO_ANSWER, sources: [] }
  } catch {
    return { answer: NO_ANSWER, sources: [] }
  }
}
