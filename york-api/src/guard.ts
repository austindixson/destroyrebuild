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

/** % FLA is motor current. A valve, fan, or tower does not use that unit. */
export function dropMisusedFla(text: string): string {
  return dropKeptPieces(text, (sentence) => !misusedFla(sentence))
}

export function stripMarkers(text: string, allowed: Set<string>): { text: string; cites: string[] } {
  const cites: string[] = []
  const cleaned = text.replace(MARKER, (_match, id: string) => {
    if (!allowed.has(id)) return ''
    if (!cites.includes(id)) cites.push(id)
    return ''
  })
  return { text: cleaned.replace(/[^\S\n]{2,}/g, ' ').trim(), cites }
}

/** A sentence end on the same line, or any newline. */
const SENTENCE_GAP = /((?<=[.!?])[^\S\n]+|\n+)/

/** "5." or "5. " is a checklist marker. "4.2" and "9.5" are readings. */
const STEP_MARKER = /^\d+\.(?=\s|$)/

/** A "- " line is a bullet. Its later sentences belong to that bullet. */
const BULLET = /^-\s+/

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

function scheduleSpans(): RegExp[] {
  return [
    /\bHours?\s+\d+(?:\.\d+)?\s+to\s+\d+(?:\.\d+)?/gi,
    /\bHours?\s+\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?/gi,
    /\b\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\s*h\b/gi,
    /\bevery\s+\d+(?:\.\d+)?\s+hours?\b/gi,
    /\bt\s*=\s*\d+(?:\.\d+)?\b/gi,
    /\bnext\s+\d+(?:\.\d+)?\s+hours?\b/gi,
  ]
}

/** Hour ranges, "every N hours", "t=N", and "next N hours" are schedule labels. */
function withoutSchedule(text: string): string {
  let out = text
  for (const pattern of scheduleSpans()) out = out.replace(pattern, ' ')
  return out
}

/** A leading "3." or "3. " is a checklist marker, not a live reading. */
function checkedNumbers(sentence: string): string[] {
  if (BARE_STEP.test(sentence)) return []
  const marker = STEP_MARKER.exec(sentence)
  const body = marker ? sentence.slice(marker[0].length) : sentence
  return numberTokens(withoutSchedule(body))
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

function isListMarker(text: string): boolean {
  return STEP_MARKER.test(text) || BULLET.test(text)
}

function isHeading(text: string): boolean {
  if (isListMarker(text)) return false
  if (text.startsWith('Reason:')) return false
  return !/[.!?]$/.test(text)
}

const FOLLOW_ON = new Set([
  'Also', 'Check', 'Close', 'Do', 'Hold', 'Keep', 'Open', 'Read', 'Set', 'Start', 'Stop', 'Then', 'Wait', 'Watch',
])

/** A next-line command or Reason still belongs to the dropped step. A new fact does not. */
function followsStep(text: string): boolean {
  if (text.startsWith('Reason:')) return true
  const word = text.replace(/^[^A-Za-z]+/, '').split(/\s+/)[0] ?? ''
  const titled = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  return FOLLOW_ON.has(titled)
}

/** A blank line, a new list item, or a standalone next line ends the span. */
function endsSpan(prev: Piece, next: Piece, bullet: boolean): boolean {
  if (isListMarker(next.text)) return true
  if (isHeading(next.text)) return true
  if (/\n\s*\n/.test(prev.sep)) return true
  if (!prev.sep.includes('\n')) return false
  if (bullet) return false
  return !followsStep(next.text)
}

/** A dropped step or bullet takes its marker and the sentences that belong to it. */
function skipDroppedStep(steps: Piece[], index: number): number {
  let next = index + 1
  const origin = steps[index]
  if (!origin || !isListMarker(origin.text)) return next
  const bullet = BULLET.test(origin.text)
  while (next < steps.length) {
    const prev = steps[next - 1]
    const piece = steps[next]
    if (!prev || !piece || endsSpan(prev, piece, bullet)) break
    next += 1
  }
  return next
}

function sectionHasBody(parts: Piece[], index: number): boolean {
  const head = parts[index]
  if (!head || /\n\s*\n/.test(head.sep)) return false
  for (let j = index + 1; j < parts.length; j += 1) {
    const prev = parts[j - 1]
    const piece = parts[j]
    if (!prev || !piece) return false
    if (/\n\s*\n/.test(prev.sep)) return false
    if (isHeading(piece.text)) return false
    return true
  }
  return false
}

/** A heading with no step or bullet left under it is an empty label. */
function dropEmptyHeadings(parts: Piece[]): Piece[] {
  const out: Piece[] = []
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]
    if (!part) continue
    if (isHeading(part.text) && !sectionHasBody(parts, i)) continue
    out.push(part)
  }
  return out
}

function carryBreak(kept: Piece[], steps: Piece[], resume: number): void {
  const last = kept[kept.length - 1]
  const bridge = steps[resume - 1]
  if (!last || !bridge || resume >= steps.length) return
  if (!bridge.sep.includes('\n')) return
  last.sep = bridge.sep
}

function selectPieces(steps: Piece[], keep: (text: string) => boolean): Piece[] {
  const kept: Piece[] = []
  let i = 0
  while (i < steps.length) {
    const sentence = steps[i]
    if (!sentence) {
      i += 1
      continue
    }
    if (keep(sentence.text)) {
      kept.push(sentence)
      i += 1
      continue
    }
    const resume = skipDroppedStep(steps, i)
    carryBreak(kept, steps, resume)
    i = resume
  }
  return kept
}

/** Keep the separators, including a newline after a period. A dropped step takes its marker. */
export function dropKeptPieces(text: string, keep: (sentence: string) => boolean): string {
  const kept = dropEmptyHeadings(selectPieces(joinedSteps(splitPieces(text)), keep))
  return joinPieces(kept)
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
  return dropKeptPieces(text, (sentence) => !oddQuotes(sentence))
}

export function sentencePieces(text: string): Piece[] {
  return splitPieces(text)
}

export function joinSentencePieces(parts: Piece[]): string {
  return joinPieces(parts)
}

export function dropUntracedNumbers(text: string, corpus: string): string {
  const known = new Set(numberTokens(corpus))
  return dropKeptPieces(text, (sentence) => numbersKnown(sentence, known))
}

export function labelLiveNumbers(text: string): string {
  if (numberTokens(text).length === 0) return text
  if (text.includes('trainer-model')) return text
  return `${text} ${LIVE_LABEL}`
}
