import { LIVE_LABEL } from './copy.ts'

const MARKER = /\[(trainer:[a-z0-9:_-]+)\]/gi
const UNIT_ID = /\bCH-\d+\b/gi
/** A whole number, including 95MW, -7, and each side of 118-140. Unit ids are removed first. */
const NUMBER_TOKEN = /(?<![\d.])-?\d+(?:\.\d+)?/g

export function yorkFlaWording(text: string): string {
  return text.replaceAll('%RLA', '% FLA').replaceAll('%TSLA', '% FLA')
}

const PLANT_PERCENT = /\b(?:valves?|fans?|towers?)\b/i

function misusedFla(sentence: string): boolean {
  return sentence.includes('% FLA') && PLANT_PERCENT.test(sentence)
}

function keepPieces(text: string, keep: (sentence: string) => boolean): string {
  return joinPieces(splitPieces(text).filter((part) => keep(part.text)))
}

/** % FLA is motor current. A valve, fan, or tower does not use that unit. */
export function dropMisusedFla(text: string): string {
  return keepPieces(text, (sentence) => !misusedFla(sentence))
}

export function stripMarkers(text: string, allowed: Set<string>): { text: string; cites: string[] } {
  const cites: string[] = []
  const cleaned = text.replace(MARKER, (_match, id: string) => {
    if (!allowed.has(id)) return ''
    if (!cites.includes(id)) cites.push(id)
    return ''
  })
  return { text: cleaned.replace(/\s{2,}/g, ' ').trim(), cites }
}

/** A sentence end, or a newline that sits in front of a step marker. */
const SENTENCE_GAP = /((?<=[.!?])\s+|\n+(?=\d+\.\s))/

/** "5." or "5. " is a checklist marker. "4.2" and "9.5" are readings. */
const STEP_MARKER = /^\d+\.(?=\s|$)/

export function isStepMarker(sentence: string): boolean {
  return STEP_MARKER.test(sentence)
}

const BARE_STEP = /^\d+\.$/

type Piece = { text: string; sep: string }

function sentences(text: string): string[] {
  return splitPieces(text).map((part) => part.text)
}

function splitPieces(text: string): Piece[] {
  const parts = text.split(SENTENCE_GAP)
  const out: Piece[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i]?.trim() ?? ''
    if (!sentence) continue
    out.push({ text: sentence, sep: parts[i + 1] ?? '' })
  }
  return out
}

function numberTokens(text: string): string[] {
  return text.replace(UNIT_ID, ' ').match(NUMBER_TOKEN) ?? []
}

/** A leading "3." or "3. " is a checklist marker, not a live reading. */
function checkedNumbers(sentence: string): string[] {
  if (BARE_STEP.test(sentence)) return []
  const marker = STEP_MARKER.exec(sentence)
  const body = marker ? sentence.slice(marker[0].length) : sentence
  return numberTokens(body)
}

/** A bare "5." belongs to the next sentence. They stay or go together. */
function joinedSteps(parts: Piece[]): Piece[] {
  const out: Piece[] = []
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]
    if (!part) continue
    const next = parts[i + 1]
    if (BARE_STEP.test(part.text) && next && !BARE_STEP.test(next.text)) {
      out.push({ text: `${part.text}${part.sep}${next.text}`, sep: next.sep })
      i += 1
      continue
    }
    out.push(part)
  }
  return out
}

function numbersKnown(text: string, known: Set<string>): boolean {
  return checkedNumbers(text).every((num) => known.has(num))
}

function isStepPiece(steps: Piece[], index: number): boolean {
  const sentence = steps[index]
  return !!sentence && STEP_MARKER.test(sentence.text)
}

/** A dropped step takes every sentence up to the next step marker. */
function skipDroppedStep(steps: Piece[], index: number): number {
  let next = index + 1
  if (!isStepPiece(steps, index)) return next
  while (next < steps.length && !isStepPiece(steps, next)) next += 1
  return next
}

function withoutUntraced(steps: Piece[], known: Set<string>): Piece[] {
  const kept: Piece[] = []
  let i = 0
  while (i < steps.length) {
    const sentence = steps[i]
    if (!sentence) {
      i += 1
      continue
    }
    if (numbersKnown(sentence.text, known)) {
      kept.push(sentence)
      i += 1
      continue
    }
    i = skipDroppedStep(steps, i)
  }
  return kept
}

function joinPieces(parts: Piece[]): string {
  let out = ''
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]
    if (!part) continue
    out += part.text
    if (i < parts.length - 1) out += part.sep
  }
  return out
}

function oddQuotes(sentence: string): boolean {
  let count = 0
  for (const ch of sentence) {
    if (ch === '"') count += 1
  }
  return count % 2 === 1
}

/** A stray quote mark is an unmatched fragment, not a sentence to keep. */
export function dropUnmatchedQuotes(text: string): string {
  return keepPieces(text, (sentence) => !oddQuotes(sentence))
}

export function dropUntracedNumbers(text: string, corpus: string): string {
  const known = new Set(numberTokens(corpus))
  const kept = withoutUntraced(joinedSteps(splitPieces(text)), known)
  return joinPieces(kept)
}

export function labelLiveNumbers(text: string): string {
  if (numberTokens(text).length === 0) return text
  if (text.includes('trainer-model')) return text
  return `${text} ${LIVE_LABEL}`
}
