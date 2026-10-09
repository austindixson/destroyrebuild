import type { Chunk } from './types.ts'

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9%]+/)
    .filter((word) => word.length >= 3)
}

function scoreChunk(chunk: Chunk, terms: string[]): number {
  const title = chunk.title.toLowerCase()
  const body = chunk.text.toLowerCase()
  let score = 0
  for (const term of terms) {
    if (title.includes(term)) score += 3
    if (body.includes(term)) score += 1
  }
  return score
}

const SPOILER = /^(?:trainer:trouble:|trainer:info:trouble-|trainer:quiz:)/

function visibleChunks(chunks: Chunk[], blocksWrites: boolean): Chunk[] {
  if (!blocksWrites) return chunks
  return chunks.filter((chunk) => !SPOILER.test(chunk.id))
}

export function searchChunks(chunks: Chunk[], query: string, limit = 4, blocksWrites = false): Chunk[] {
  const pool = visibleChunks(chunks, blocksWrites)
  const terms = tokens(query)
  if (terms.length === 0) return pool.slice(0, limit)
  return pool
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, terms) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.chunk)
}
