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
    /\bevery\s+\d+(?:\.\d+)?\s+h\b/gi,
    /\bt\s*=\s*\d+(?:\.\d+)?\b/gi,
    /\bnext\s+\d+(?:\.\d+)?\s+hours?\b/gi,
    /\bHours?\s+\d+(?:\.\d+)?\s*:/gi,
    /\bAfter\s+\d+(?:\.\d+)?\s+hours?\b/gi,
    /\bAt\s+hour\s+\d+(?:\.\d+)?\b/gi,
    /\bWithin\s+\d+(?:\.\d+)?\s+hours?\b/gi,
  ]
}

/** Hour labels, ranges, "every N h", "after N hours", "within N hours", "t=N", and "next N hours" are schedule labels. */
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

function decimalPlaces(token: string): number {
  const dot = token.indexOf('.')
  return dot < 0 ? 0 : token.length - dot - 1
}

function shown(value: number, places: number): string {
  const factor = 10 ** places
  return (Math.round(value * factor) / factor).toFixed(places)
}

const NUM = String.raw`[-\u2212]?\d+(?:\.\d+)?`
const OP_SOURCE = String.raw`[+\-\u2212*\u00d7/\u00f7]`
const EQUATION_SOURCE = String.raw`(?<![\d.])(${NUM}(?:\s*${OP_SOURCE}\s*${NUM})+)\s*=\s*(${NUM})`

type Op = '+' | '-' | '*' | '/'
type Chain = { nums: string[]; ops: Op[]; result: string }

function canonNum(token: string): string {
  return token.replaceAll('\u2212', '-')
}

function asOp(op: string | undefined): Op | null {
  switch (op) {
    case '+':
      return '+'
    case '-':
    case '\u2212':
      return '-'
    case '*':
    case '\u00d7':
      return '*'
    case '/':
    case '\u00f7':
      return '/'
    default:
      return null
  }
}

function applyOp(op: Op, left: number, right: number): number | null {
  switch (op) {
    case '+':
      return left + right
    case '-':
      return left - right
    case '*':
      return left * right
    case '/':
      if (right === 0) return null
      return left / right
    default: {
      const unexpected: never = op
      return unexpected
    }
  }
}

function readChain(match: RegExpMatchArray): Chain | null {
  const left = match[1]
  const result = match[2]
  if (!left || !result) return null
  const parts = left.split(new RegExp(String.raw`\s*(${OP_SOURCE})\s*`)).filter((part) => part.length > 0)
  if (parts.length < 3 || parts.length % 2 === 0) return null
  const nums: string[] = []
  const ops: Op[] = []
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i] ?? ''
    if (i % 2 === 0) {
      nums.push(part)
      continue
    }
    const op = asOp(part)
    if (!op) return null
    ops.push(op)
  }
  return { nums, ops, result }
}

function chainValue(chain: Chain): number | null {
  const first = chain.nums[0]
  if (!first) return null
  let value = Number(canonNum(first))
  if (!Number.isFinite(value)) return null
  for (let i = 0; i < chain.ops.length; i += 1) {
    const op = chain.ops[i]
    const raw = chain.nums[i + 1]
    if (!op || !raw) return null
    const right = Number(canonNum(raw))
    if (!Number.isFinite(right)) return null
    const next = applyOp(op, value, right)
    if (next === null) return null
    value = next
  }
  return value
}

function chainPlaces(nums: string[]): number {
  let places = 0
  for (const num of nums) places = Math.max(places, decimalPlaces(num))
  return places
}

function inputsKnown(chain: Chain, known: Set<string>): boolean {
  for (const num of chain.nums) {
    if (!known.has(canonNum(num))) return false
  }
  return true
}

/** The result keeps at least as many decimal places as any input. */
function workIsRight(chain: Chain, known: Set<string>): number | null {
  if (!inputsKnown(chain, known)) return null
  const value = chainValue(chain)
  if (value === null) return null
  const places = decimalPlaces(chain.result)
  if (places < chainPlaces(chain.nums)) return null
  if (canonNum(chain.result) !== shown(value, places)) return null
  return value
}

function coversToken(token: string, result: string, value: number): boolean {
  const shownToken = canonNum(token)
  if (shownToken === canonNum(result)) return true
  const places = decimalPlaces(token)
  if (places < decimalPlaces(result)) return false
  return shownToken === shown(value, places)
}

function equationMatches(text: string): RegExpMatchArray[] {
  return [...text.matchAll(new RegExp(EQUATION_SOURCE, 'g'))]
}

/** A computed number stays only when this sentence shows that equation. */
function equationAllows(text: string, token: string, known: Set<string>): boolean {
  for (const match of equationMatches(text)) {
    const chain = readChain(match)
    if (!chain) continue
    const value = workIsRight(chain, known)
    if (value === null) continue
    if (coversToken(token, chain.result, value)) return true
  }
  return false
}

function badEquation(text: string, known: Set<string>): boolean {
  for (const match of equationMatches(text)) {
    const chain = readChain(match)
    if (chain && workIsRight(chain, known) === null) return true
  }
  return false
}

function numbersKnown(text: string, known: Set<string>): boolean {
  if (badEquation(text, known)) return false
  return checkedNumbers(text).every((num) => known.has(num) || equationAllows(text, num, known))
}

function isListMarker(text: string): boolean {
  return STEP_MARKER.test(text) || BULLET.test(text)
}

const HEADING_LIMIT = 6
const CLAUSE = /\b(?:is|are|was|were|been)\b/i

/** A heading is short, has no digits, and has no colon followed by a value. */
function isHeading(text: string): boolean {
  if (isListMarker(text) || text.startsWith('Reason:') || /[.!?]$/.test(text)) return false
  if (/\d/.test(text) || /:\s*\S/.test(text)) return false
  if (wordCount(text) > HEADING_LIMIT || CLAUSE.test(text) || followsStep(text)) return false
  return true
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length
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

/** A heading has a body when the next section does, including a sub-heading that has one. */
function sectionHasBody(parts: Piece[], index: number): boolean {
  for (let j = index + 1; j < parts.length; j += 1) {
    const piece = parts[j]
    if (!piece) continue
    if (isHeading(piece.text)) return sectionHasBody(parts, j)
    return true
  }
  return false
}

function lineLabel(text: string): string {
  if (text.startsWith('Reason:')) return ''
  const match = /^([^:\n]{1,80}?):\s+\S/.exec(text)
  const label = match?.[1]?.trim() ?? ''
  return label ? `${label}:` : ''
}

function atLineStart(steps: Piece[], index: number): boolean {
  const prev = steps[index - 1]
  return !prev || prev.sep.includes('\n')
}

function nextKeptOnLine(steps: Piece[], index: number, keep: (text: string) => boolean): Piece | undefined {
  for (let j = index + 1; j < steps.length; j += 1) {
    const prev = steps[j - 1]
    const piece = steps[j]
    if (!prev || !piece || prev.sep.includes('\n')) return undefined
    if (keep(piece.text)) return piece
  }
  return undefined
}

/** A dropped first sentence on a plain line keeps its label on the next kept sentence. */
function graftLineLabel(steps: Piece[], index: number, keep: (text: string) => boolean): void {
  if (!atLineStart(steps, index)) return
  const origin = steps[index]
  const label = origin ? lineLabel(origin.text) : ''
  if (!label) return
  const target = nextKeptOnLine(steps, index, keep)
  if (!target || target.text.startsWith(`${label} `)) return
  target.text = `${label} ${target.text}`
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

type DropStyle = 'span' | 'bullet-sentence'

function resumeAt(steps: Piece[], index: number, style: DropStyle): number {
  const origin = steps[index]
  if (style === 'bullet-sentence' && origin && BULLET.test(origin.text)) return index + 1
  return skipDroppedStep(steps, index)
}

function bulletLabel(text: string): string {
  return lineLabel(text.replace(/^-\s+/, ''))
}

function withBullet(text: string, label: string): string {
  const body = text.replace(/^-\s+/, '')
  const labeled = label && !body.startsWith(`${label} `) ? `${label} ${body}` : body
  return `- ${labeled}`
}

/** The next kept sentence in a bullet keeps the marker and the bullet's label. */
function graftBullet(steps: Piece[], index: number, keep: (text: string) => boolean): number {
  const origin = steps[index]
  if (!origin || !BULLET.test(origin.text)) return -1
  const label = bulletLabel(origin.text)
  const end = skipDroppedStep(steps, index)
  for (let j = index + 1; j < end; j += 1) {
    const piece = steps[j]
    if (!piece || isListMarker(piece.text) || !keep(piece.text)) continue
    piece.text = withBullet(piece.text, label)
    return j
  }
  return -1
}

function carryBreak(kept: Piece[], steps: Piece[], resume: number): void {
  const last = kept[kept.length - 1]
  const bridge = steps[resume - 1]
  if (!last || !bridge || resume >= steps.length) return
  if (!bridge.sep.includes('\n')) return
  last.sep = bridge.sep
}

function selectPieces(steps: Piece[], keep: (text: string) => boolean, style: DropStyle): Piece[] {
  const kept: Piece[] = []
  const held = new Set<number>()
  let i = 0
  while (i < steps.length) {
    const sentence = steps[i]
    if (!sentence) {
      i += 1
      continue
    }
    if (held.has(i) || keep(sentence.text)) {
      kept.push(sentence)
      i += 1
      continue
    }
    if (!isListMarker(sentence.text)) graftLineLabel(steps, i, keep)
    if (style === 'bullet-sentence') {
      const labeled = graftBullet(steps, i, keep)
      if (labeled >= 0) held.add(labeled)
    }
    const resume = resumeAt(steps, i, style)
    carryBreak(kept, steps, resume)
    i = resume
  }
  return kept
}

/** Keep the separators, including a newline after a period. A dropped step takes its marker. */
export function dropKeptPieces(text: string, keep: (sentence: string) => boolean, style: DropStyle = 'span'): string {
  const kept = dropEmptyHeadings(selectPieces(joinedSteps(splitPieces(text)), keep, style))
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

function quoteCount(text: string): number {
  let count = 0
  for (const ch of text) if (ch === '"') count += 1
  return count
}

function quoteGroupEnd(steps: Piece[], index: number): number {
  const origin = steps[index]
  if (origin && BULLET.test(origin.text)) return skipDroppedStep(steps, index)
  let next = index + 1
  while (next < steps.length) {
    const prev = steps[next - 1]
    if (!prev || prev.sep.includes('\n')) break
    next += 1
  }
  return next
}

/** A balanced line or bullet keeps a quote that opens in one sentence and closes in the next. */
function excusedQuotes(steps: Piece[]): Set<string> {
  const excused = new Set<string>()
  let i = 0
  while (i < steps.length) {
    const end = quoteGroupEnd(steps, i)
    let count = 0
    for (let j = i; j < end; j += 1) count += quoteCount(steps[j]?.text ?? '')
    if (count % 2 === 0) {
      for (let j = i; j < end; j += 1) {
        const text = steps[j]?.text ?? ''
        if (quoteCount(text) % 2 === 1) excused.add(text)
      }
    }
    i = Math.max(end, i + 1)
  }
  return excused
}

/** A stray quote mark is an unmatched fragment, not a sentence to keep. */
export function dropUnmatchedQuotes(text: string): string {
  const excused = excusedQuotes(joinedSteps(splitPieces(text)))
  return dropKeptPieces(text, (sentence) => excused.has(sentence) || !oddQuotes(sentence))
}

export function sentencePieces(text: string): Piece[] {
  return splitPieces(text)
}

export function joinSentencePieces(parts: Piece[]): string {
  return joinPieces(parts)
}

export function dropUntracedNumbers(text: string, corpus: string): string {
  const known = new Set(numberTokens(corpus))
  return dropKeptPieces(text, (sentence) => numbersKnown(sentence, known), 'bullet-sentence')
}

export function labelLiveNumbers(text: string): string {
  if (numberTokens(text).length === 0) return text
  if (text.includes('trainer-model')) return text
  return `${text} ${LIVE_LABEL}`
}
