import { LIVE_LABEL } from './copy.ts'

const MARKER = /\[(trainer:[a-z0-9:_-]+)\]/gi
const NUMBER_TOKEN = /(?<![A-Za-z0-9-])\d+(?:\.\d+)?(?![A-Za-z0-9])/g

export function yorkFlaWording(text: string): string {
  return text.replaceAll('%RLA', '% FLA').replaceAll('%TSLA', '% FLA')
}

const PLANT_PERCENT = /\b(?:valves?|fans?|towers?)\b/i

function misusedFla(sentence: string): boolean {
  return sentence.includes('% FLA') && PLANT_PERCENT.test(sentence)
}

/** % FLA is motor current. A valve, fan, or tower does not use that unit. */
export function dropMisusedFla(text: string): string {
  return sentences(text).filter((sentence) => !misusedFla(sentence)).join(' ')
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

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function numberTokens(text: string): string[] {
  return text.match(NUMBER_TOKEN) ?? []
}

const BARE_STEP = /^\d+\.$/

/** A leading "3." or "3. " is a checklist marker, not a live reading. */
function checkedNumbers(sentence: string): string[] {
  if (BARE_STEP.test(sentence)) return []
  return numberTokens(sentence.replace(/^\d+\.\s/, ''))
}

/** A bare "5." belongs to the next sentence. They stay or go together. */
function joinedSteps(parts: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]
    if (!part) continue
    const next = parts[i + 1]
    if (BARE_STEP.test(part) && next && !BARE_STEP.test(next)) {
      out.push(`${part} ${next}`)
      i += 1
      continue
    }
    out.push(part)
  }
  return out
}

function withoutUntraced(steps: string[], known: Set<string>): string[] {
  const kept: string[] = []
  for (let i = 0; i < steps.length; i += 1) {
    const sentence = steps[i]
    if (!sentence) continue
    if (checkedNumbers(sentence).every((num) => known.has(num))) {
      kept.push(sentence)
      continue
    }
    const next = steps[i + 1]
    if (/^\d+\./.test(sentence) && next?.startsWith('Reason:')) i += 1
  }
  return kept
}

function renumberSteps(kept: string[]): string[] {
  let n = 0
  return kept.map((sentence) => {
    if (!/^\d+\./.test(sentence)) return sentence
    n += 1
    return sentence.replace(/^\d+\./, `${n}.`)
  })
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
  return sentences(text).filter((sentence) => !oddQuotes(sentence)).join(' ')
}

export function dropUntracedNumbers(text: string, corpus: string): string {
  const known = new Set(numberTokens(corpus))
  const kept = withoutUntraced(joinedSteps(sentences(text)), known)
  return renumberSteps(kept).join(' ')
}

export function labelLiveNumbers(text: string): string {
  if (numberTokens(text).length === 0) return text
  if (text.includes('trainer-model')) return text
  return `${text} ${LIVE_LABEL}`
}
