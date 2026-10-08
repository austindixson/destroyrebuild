import { LIVE_LABEL } from './copy.ts'

const MARKER = /\[(trainer:[a-z0-9:_-]+)\]/gi
const NUMBER = /\d+(?:\.\d+)?/g

export function yorkFlaWording(text: string): string {
  return text.replaceAll('%RLA', '% FLA').replaceAll('%TSLA', '% FLA')
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

export function dropUntracedNumbers(text: string, corpus: string): string {
  const kept = sentences(text).filter((sentence) => {
    const nums = sentence.match(NUMBER) ?? []
    return nums.every((num) => corpus.includes(num))
  })
  return kept.join(' ')
}

export function labelLiveNumbers(text: string): string {
  if (!/\d/.test(text)) return text
  if (text.includes('trainer-model')) return text
  return `${text} ${LIVE_LABEL}`
}
