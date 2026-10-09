import { LIVE_LABEL } from './copy.ts'

const MARKER = /\[(trainer:[a-z0-9:_-]+)\]/gi
const UNIT_ID = /\bCH-\d+\b/gi
/** A whole number, including 95MW, -7, −7.5, and each side of 118-140. Unit ids are removed first. */
const NUMBER_TOKEN = /(?<![\d.])[-\u2212]?\d+(?:\.\d+)?/g

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
    /\bHours?\s+\d+(?:\.\d+)?\b/gi,
  ]
}

/** Hour labels, ranges, "every N h", "after N hours", "within N hours", "t=N", "Hour N", and "next N hours" are schedule labels. */
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

const NUM_RE = /^[-\u2212]?\d+(?:\.\d+)?/
const MUL_OPS = '*\u00d7/\u00f7'
const ADD_OPS = '+\u2212-'
/** Optional unit after an operand or a result. psi and psig stay distinct. °F and F are the same unit. */
const UNIT_RE = /^(?:\u00b0F|psig|psi|kW|MW|gpm|tons|%|F|A)(?![A-Za-z])/
const UNIT_CANON: Record<string, string> = {
  '\u00b0F': 'F',
  F: 'F',
  psig: 'psig',
  psi: 'psi',
  kW: 'kW',
  MW: 'MW',
  gpm: 'gpm',
  tons: 'tons',
  '%': '%',
  A: 'A',
}
/**
 * An equals sign is an equation only when its left side is
 * number, optional unit, operator, number, optional unit.
 * "set = 55 F", "(target = 55 F)", "t=N", and "rla=34" are not equations.
 */
const LEFT_EQ = /(?:^|[^\d.])[-\u2212]?\d+(?:\.\d+)?(?:\s*(?:\u00b0F|psig|psi|kW|MW|gpm|tons|%|F|A)(?![A-Za-z]))?\s*[+\u2212*\u00d7/\u00f7-]\s*[-\u2212]?\d+(?:\.\d+)?(?:\s*(?:\u00b0F|psig|psi|kW|MW|gpm|tons|%|F|A)(?![A-Za-z]))?\s*=/

type Op = '+' | '-' | '*' | '/'
type Expr = { kind: 'num'; token: string; unit: string } | { kind: 'bin'; op: Op; left: Expr; right: Expr }
type Parsed = { expr: Expr; consumed: number }
type Equation = { expr: Expr; result: string; unit: string }
type EqSpan = { start: number; consumed: number; equation: Equation }

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

function skipSpace(source: string): number {
  return /^\s*/.exec(source)?.[0].length ?? 0
}

function takeUnit(source: string): { unit: string; consumed: number } {
  const gap = skipSpace(source)
  const raw = UNIT_RE.exec(source.slice(gap))?.[0] ?? ''
  return { unit: UNIT_CANON[raw] ?? '', consumed: gap + raw.length }
}

function parseUnary(source: string): Parsed | null {
  const gap = skipSpace(source)
  const body = source.slice(gap)
  if (body.startsWith('(')) {
    const inner = parseAdd(body.slice(1))
    if (!inner) return null
    const closeGap = skipSpace(body.slice(1 + inner.consumed))
    if (!body.slice(1 + inner.consumed + closeGap).startsWith(')')) return null
    return { expr: inner.expr, consumed: gap + 1 + inner.consumed + closeGap + 1 }
  }
  const num = NUM_RE.exec(body)
  if (!num?.[0]) return null
  const unit = takeUnit(body.slice(num[0].length))
  return {
    expr: { kind: 'num', token: num[0], unit: unit.unit },
    consumed: gap + num[0].length + unit.consumed,
  }
}

function takeOp(source: string, ops: string): { op: Op; consumed: number } | null {
  const gap = skipSpace(source)
  const ch = source.slice(gap, gap + 1)
  if (!ch || !ops.includes(ch)) return null
  const op = asOp(ch)
  if (!op) return null
  return { op, consumed: gap + 1 }
}

function foldOps(source: string, ops: string, parseNext: (source: string) => Parsed | null): Parsed | null {
  const first = parseNext(source)
  if (!first) return null
  let left = first
  while (source.length > left.consumed) {
    const found = takeOp(source.slice(left.consumed), ops)
    if (!found) return left
    const right = parseNext(source.slice(left.consumed + found.consumed))
    if (!right) return left
    left = {
      expr: { kind: 'bin', op: found.op, left: left.expr, right: right.expr },
      consumed: left.consumed + found.consumed + right.consumed,
    }
  }
  return left
}

function parseMul(source: string): Parsed | null {
  return foldOps(source, MUL_OPS, parseUnary)
}

function parseAdd(source: string): Parsed | null {
  return foldOps(source, ADD_OPS, parseMul)
}

function parseEquation(source: string): { expr: Expr; result: string; unit: string; consumed: number } | null {
  const left = parseAdd(source)
  if (!left) return null
  const rest = source.slice(left.consumed)
  const gap = skipSpace(rest)
  if (!rest.slice(gap).startsWith('=')) return null
  const after = rest.slice(gap + 1)
  const numGap = skipSpace(after)
  const num = NUM_RE.exec(after.slice(numGap))
  if (!num?.[0]) return null
  const unit = takeUnit(after.slice(numGap + num[0].length))
  return {
    expr: left.expr,
    result: num[0],
    unit: unit.unit,
    consumed: left.consumed + gap + 1 + numGap + num[0].length + unit.consumed,
  }
}

function equationAt(text: string, index: number): boolean {
  const ch = text[index] ?? ''
  return ch === '(' || ch === '-' || ch === '\u2212' || /\d/.test(ch)
}

function equationSpans(text: string): EqSpan[] {
  const found: EqSpan[] = []
  let i = 0
  while (i < text.length) {
    const prev = i > 0 ? text[i - 1] ?? '' : ''
    if ((prev && /[\d.]/.test(prev)) || !equationAt(text, i)) {
      i += 1
      continue
    }
    const parsed = parseEquation(text.slice(i))
    if (!parsed) {
      i += 1
      continue
    }
    found.push({
      start: i,
      consumed: parsed.consumed,
      equation: { expr: parsed.expr, result: parsed.result, unit: parsed.unit },
    })
    i += parsed.consumed
  }
  return found
}

function equationsIn(text: string): Equation[] {
  return equationSpans(text).map((span) => span.equation)
}

function blankEquations(text: string): string {
  let out = text
  const spans = equationSpans(text)
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    const span = spans[i]
    if (!span) continue
    const end = span.start + span.consumed
    out = `${out.slice(0, span.start)}${' '.repeat(span.consumed)}${out.slice(end)}`
  }
  return out
}

function leftoverEquals(text: string): boolean {
  return LEFT_EQ.test(withoutSchedule(blankEquations(text)))
}

function subtractUnit(left: string, right: string): string | null {
  if (left === 'psig' && right === 'psig') return 'psi'
  return left === right ? left : null
}

function divideUnit(left: string, right: string): string | null {
  if (right === '') return left
  if (left === right) return ''
  return null
}

function factorUnit(op: '*' | '/', left: string, right: string): string | null {
  if (op === '/') return divideUnit(left, right)
  if (left === '') return right
  if (right === '') return left
  if (left !== right) return null
  return left
}

function combineUnits(op: Op, left: string, right: string): string | null {
  switch (op) {
    case '+':
      return left === right ? left : null
    case '-':
      return subtractUnit(left, right)
    case '*':
    case '/':
      return factorUnit(op, left, right)
    default: {
      const unexpected: never = op
      return unexpected
    }
  }
}

function exprUnit(expr: Expr): string | null {
  switch (expr.kind) {
    case 'num':
      return expr.unit
    case 'bin': {
      const left = exprUnit(expr.left)
      const right = exprUnit(expr.right)
      if (left === null || right === null) return null
      return combineUnits(expr.op, left, right)
    }
    default: {
      const unexpected: never = expr
      return unexpected
    }
  }
}

/** The result uses the expression unit. A unitless expression may name that unit on the result only. */
function unitsMatch(equation: Equation): boolean {
  const unit = exprUnit(equation.expr)
  if (unit === null) return false
  if (unit === '') return true
  return equation.unit === unit
}

function exprValue(expr: Expr): number | null {
  switch (expr.kind) {
    case 'num': {
      const value = Number(canonNum(expr.token))
      return Number.isFinite(value) ? value : null
    }
    case 'bin': {
      const left = exprValue(expr.left)
      const right = exprValue(expr.right)
      if (left === null || right === null) return null
      return applyOp(expr.op, left, right)
    }
    default: {
      const unexpected: never = expr
      return unexpected
    }
  }
}

function exprTokens(expr: Expr, out: string[]): void {
  if (expr.kind === 'num') {
    out.push(expr.token)
    return
  }
  exprTokens(expr.left, out)
  exprTokens(expr.right, out)
}

function exprPlaces(expr: Expr): number {
  const tokens: string[] = []
  exprTokens(expr, tokens)
  let places = 0
  for (const token of tokens) places = Math.max(places, decimalPlaces(token))
  return places
}

function inputsKnown(expr: Expr, known: Set<string>): boolean {
  const tokens: string[] = []
  exprTokens(expr, tokens)
  for (const token of tokens) {
    if (!known.has(canonNum(token))) return false
  }
  return true
}

/** The result keeps at least as many decimal places as any input. Units must agree. */
function workIsRight(equation: Equation, known: Set<string>): number | null {
  if (!unitsMatch(equation)) return null
  if (!inputsKnown(equation.expr, known)) return null
  const value = exprValue(equation.expr)
  if (value === null) return null
  const places = decimalPlaces(equation.result)
  if (places < exprPlaces(equation.expr)) return null
  if (canonNum(equation.result) !== shown(value, places)) return null
  return value
}

function coversToken(token: string, result: string, value: number): boolean {
  const shownToken = canonNum(token)
  if (shownToken === canonNum(result)) return true
  const places = decimalPlaces(token)
  if (places < decimalPlaces(result)) return false
  return shownToken === shown(value, places)
}

type Solved = { result: string; value: number }

function canonSet(known: Set<string>): Set<string> {
  const out = new Set<string>()
  for (const token of known) out.add(canonNum(token))
  return out
}

/** Later steps may use a result proven by an earlier equation in the same sentence. */
function solveEquations(text: string, known: Set<string>): Solved[] | null {
  const running = canonSet(known)
  const solved: Solved[] = []
  for (const equation of equationsIn(text)) {
    const value = workIsRight(equation, running)
    if (value === null) return null
    running.add(canonNum(equation.result))
    solved.push({ result: equation.result, value })
  }
  if (leftoverEquals(text)) return null
  return solved
}

function numberProven(token: string, known: Set<string>, solved: Solved[]): boolean {
  if (known.has(token) || known.has(canonNum(token))) return true
  for (const row of solved) {
    if (coversToken(token, row.result, row.value)) return true
  }
  return false
}

function numbersKnown(text: string, known: Set<string>): boolean {
  const solved = solveEquations(text, known)
  if (!solved) return false
  return checkedNumbers(text).every((num) => numberProven(num, known, solved))
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
  if (isHeading(next.text) || isHourLabel(next.text)) return true
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

function hashLevel(text: string): number | null {
  const marks = /^(#{1,6})(?:\s|$)/.exec(text.trim())
  if (!marks?.[1]) return null
  return marks[1].length
}

/** An hour line such as "Hour 0 to 1" can be a sub-heading. */
function isHourLabel(text: string): boolean {
  if (/[.!?]$/.test(text) || /:\s*\S/.test(text)) return false
  if (wordCount(text) > HEADING_LIMIT) return false
  return /^(?:hours?\b|after\b|every\b|at hour\b|within\b)/i.test(text) && /\d/.test(text)
}

/** Content follows an hour label when the next line is a step or a sentence. */
function followedByContent(raw: Piece[], index: number): boolean {
  for (let j = index + 1; j < raw.length; j += 1) {
    const part = raw[j]
    if (!part) continue
    if (isHourLabel(part.text) && atLineStart(raw, j)) continue
    return !isHeading(part.text)
  }
  return false
}

function pieceIsHeading(raw: Piece[], index: number): boolean {
  const part = raw[index]
  if (!part) return false
  if (isHeading(part.text)) return true
  if (!isHourLabel(part.text) || !atLineStart(raw, index)) return false
  return followedByContent(raw, index)
}

/** A plain heading sits under every markdown level. */
const PLAIN_LEVEL = 8

function headingLevels(raw: Piece[]): number[] {
  const levels = new Array<number>(raw.length).fill(0)
  for (let i = raw.length - 1; i >= 0; i -= 1) {
    const part = raw[i]
    if (!part || !pieceIsHeading(raw, i)) continue
    const hash = hashLevel(part.text)
    if (hash !== null) {
      levels[i] = hash
      continue
    }
    const nextLevel = pieceIsHeading(raw, i + 1) ? levels[i + 1] ?? PLAIN_LEVEL : null
    levels[i] = nextLevel === null ? PLAIN_LEVEL : nextLevel - 1
  }
  return levels
}

function capsHeading(text: string): boolean {
  const words = text.replace(/[^A-Za-z\s]/g, ' ').trim()
  return words.length > 0 && words === words.toUpperCase() && /[A-Z]/.test(words)
}

function blankBefore(raw: Piece[], index: number): boolean {
  const prev = raw[index - 1]
  return !!prev && /\n\s*\n/.test(prev.sep)
}

/** A plain, bold, or CAPS scope ends at a blank-line heading or a CAPS heading after content. */
function plainBoundary(raw: Piece[], index: number, seenContent: boolean): boolean {
  const part = raw[index]
  if (!part || !seenContent) return false
  if (blankBefore(raw, index)) return true
  return capsHeading(part.text)
}

/**
 * A # heading runs until the next heading at that level or higher.
 * A plain heading keeps later subsections in its group until a blank line or a CAPS heading.
 */
function scopeEnd(raw: Piece[], levels: number[], index: number): number {
  const own = levels[index] ?? 0
  const hashed = hashLevel(raw[index]?.text ?? '') !== null
  let seenContent = false
  for (let j = index + 1; j < raw.length; j += 1) {
    const part = raw[j]
    if (!part) continue
    if (!pieceIsHeading(raw, j)) {
      seenContent = true
      continue
    }
    const deeper = (levels[j] ?? 0) > own
    if (hashed) {
      if (!deeper) return j
      continue
    }
    if (!deeper || plainBoundary(raw, j, seenContent)) return j
  }
  return raw.length
}

type ScopeFacts = { raw: boolean; kept: boolean; child: boolean }

function scopeFacts(raw: Piece[], kept: Set<Piece>, start: number, end: number): ScopeFacts {
  const facts: ScopeFacts = { raw: false, kept: false, child: false }
  for (let k = start; k < end; k += 1) {
    const piece = raw[k]
    if (!piece) continue
    if (pieceIsHeading(raw, k)) {
      facts.child = true
      continue
    }
    facts.raw = true
    if (kept.has(piece)) facts.kept = true
  }
  return facts
}

/** Kept text stays, including text under a sub-heading. An empty leaf drops. */
function headingStays(facts: ScopeFacts): boolean {
  if (facts.kept) return true
  return !facts.raw && facts.child
}

function headingStaySet(raw: Piece[], keptPieces: Piece[]): Set<Piece> {
  const levels = headingLevels(raw)
  const kept = new Set(keptPieces)
  const stay = new Set<Piece>()
  for (let i = 0; i < raw.length; i += 1) {
    const part = raw[i]
    if (!part || !pieceIsHeading(raw, i)) continue
    if (headingStays(scopeFacts(raw, kept, i + 1, scopeEnd(raw, levels, i)))) stay.add(part)
  }
  return stay
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
  if (!target || !continuesTopic(target.text) || target.text.startsWith(`${label} `)) return
  target.text = `${label} ${target.text}`
}

/** A new "The … is" sentence is its own topic. The label stays off it. */
function continuesTopic(sentence: string): boolean {
  const text = sentence.replace(/^-\s+/, '').trim()
  if (/^The\b/i.test(text) && /\b(?:is|are|was|were)\b/i.test(text)) return false
  return true
}

function carriedLabel(steps: Piece[], index: number, label: string): string {
  const bridge = steps[index - 1]
  const piece = steps[index]
  if (!bridge || !piece || bridge.sep.includes('\n') || !continuesTopic(piece.text)) return ''
  return label
}

/** Drop a heading when the guard removed the raw text in its section. */
function dropEmptyHeadings(raw: Piece[], kept: Piece[]): Piece[] {
  const stay = headingStaySet(raw, kept)
  const out: Piece[] = []
  for (const part of kept) {
    if (!part) continue
    if (pieceIsHeading(raw, raw.indexOf(part)) && !stay.has(part)) continue
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
    piece.text = withBullet(piece.text, carriedLabel(steps, j, label))
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
  const raw = joinedSteps(splitPieces(text))
  return joinPieces(selectPieces(raw, keep, style))
}

function peeled(text: string): string {
  return text.replace(/^(?:-\s+)?(?:[^:\n]{1,80}:\s+)?/, '')
}

function textsAlign(rawText: string, nextText: string): boolean {
  return nextText === rawText || peeled(nextText) === rawText
}

function alignedKept(raw: Piece[], next: Piece[]): Piece[] {
  const kept: Piece[] = []
  let cursor = 0
  for (let i = 0; i < raw.length; i += 1) {
    const part = raw[i]
    const match = next[cursor]
    if (!part || !match || !textsAlign(part.text, match.text)) continue
    kept.push(part)
    cursor += 1
  }
  return kept
}

/**
 * Drop headings whose section is empty in the filtered reply.
 * The scope is the original reply, so a later filter can empty a section.
 */
export function applyEmptyHeadings(rawText: string, filtered: string): string {
  const raw = joinedSteps(splitPieces(rawText))
  const next = joinedSteps(splitPieces(filtered))
  const stayed = new Set(dropEmptyHeadings(raw, alignedKept(raw, next)))
  const out: Piece[] = []
  let cursor = 0
  for (let i = 0; i < raw.length; i += 1) {
    const part = raw[i]
    const match = next[cursor]
    if (!part || !match || !textsAlign(part.text, match.text)) continue
    cursor += 1
    if (pieceIsHeading(raw, i) && !stayed.has(part)) continue
    out.push(match)
  }
  while (cursor < next.length) {
    const extra = next[cursor]
    if (extra) out.push(extra)
    cursor += 1
  }
  return joinPieces(out)
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
