#!/usr/bin/env node
/**
 * Dev-only Simplified Technical English check for the York chiller trainer.
 * The app does not import this file, so the production build does not ship it.
 *
 * Flags:
 * - procedural sentences over 20 words (imperative, including "Do not" and "Make sure")
 * - other sentences over 25 words
 * - contractions
 * - passive "is/are/was/were/been" plus a past participle, with or without "by"
 * - a fixed list of common phrasal verbs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const files = [
  'src/data/content.ts',
  'src/app.ts',
  'src/ui/info.ts',
  'src/ui/glossary.ts',
  'src/sim/plantSim.ts',
  'src/sim/controller.ts',
  'src/sim/tools.ts',
  'src/sim/troubleMap.ts',
  'src/3d/chillerScene.ts',
  'index.html',
]

const IMPERATIVES = new Set([
  'Apply',
  'Ask',
  'Change',
  'Clear',
  'Close',
  'Command',
  'Compare',
  'Complete',
  'Coordinate',
  'Decrease',
  'Do',
  'Examine',
  'Find',
  'Follow',
  'Give',
  'Hold',
  'Include',
  'Increase',
  'Keep',
  'Know',
  'Let',
  'Make',
  'Match',
  'Move',
  'Name',
  'Open',
  'Practice',
  'Prove',
  'Put',
  'Read',
  'Record',
  'Remove',
  'Retry',
  'Select',
  'Set',
  'Start',
  'Stop',
  'Tell',
  'Tighten',
  'Update',
  'Use',
  'Wait',
  'Watch',
  'Write',
])

const PHRASALS = [
  'pick up',
  'picks up',
  'picked up',
  'picking up',
  'shut down',
  'shuts down',
  'shutting down',
  'turn on',
  'turns on',
  'turned on',
  'turning on',
  'turn off',
  'turns off',
  'turned off',
  'turning off',
  'carry out',
  'carries out',
  'carried out',
  'carrying out',
  'set up',
  'sets up',
  'setting up',
  'go through',
  'goes through',
  'went through',
  'going through',
  'find out',
  'finds out',
  'found out',
  'finding out',
  'look at',
  'looks at',
  'looked at',
  'looking at',
  'come back',
  'comes back',
  'came back',
  'coming back',
  'go back',
  'goes back',
  'went back',
  'going back',
  'show up',
  'shows up',
  'showed up',
  'showing up',
  'start up',
  'starts up',
  'started up',
  'starting up',
  'ramp up',
  'ramps up',
  'ramped up',
  'ramping up',
  'slow down',
  'slows down',
  'slowed down',
  'slowing down',
  'follow up',
  'follows up',
  'followed up',
  'following up',
  'push through',
  'pushes through',
  'pushed through',
  'pushing through',
  'top off',
  'tops off',
  'topping off',
  'topping-off',
  'walk by',
  'walks by',
  'walked by',
  'hand back',
  'hands back',
  'handed back',
  'ease back',
  'eases back',
  'figure out',
  'figures out',
  'work out',
  'works out',
  'point out',
  'points out',
  'call out',
  'calls out',
  'run out',
  'runs out',
  'ran out',
  'running out',
  'move apart',
  'moves apart',
  'moved apart',
  'turn into',
  'turns into',
  'turned into',
]

const PASSIVE =
  /\b(?:is|are|was|were|been)(?:\s+being)?\s+(?:[a-z]+ed|held|made|seen|done|given|taken|known|shown|found|left|sent|lost|written|driven|begun|kept|met|built|fed|led|read|run|set|cut|put|paid|said|bound|caught|brought|bought|thought|taught|sought|felt|heard|meant|sold|told|stood|understood|become)\b/i

const CONTRACTION =
  /\b(?:i'm|i've|i'd|i'll|you're|you've|you'd|you'll|we're|we've|we'd|we'll|they're|they've|they'd|they'll|he's|she's|it's|that's|there's|what's|who's|here's|where's|how's|let's|can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|couldn't|shouldn't|wouldn't|mustn't|needn't|[a-z]+n't)\b/i

function normalize(text) {
  return text.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
}

function wordsOf(sentence) {
  return sentence
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function isProcedural(sentence) {
  const s = sentence.replace(/^[^A-Za-z]+/, '')
  if (/^Do not\b/i.test(s) || /^Make sure\b/i.test(s)) return true
  const first = (s.split(/\s+/)[0] ?? '').replace(/[^A-Za-z]/g, '')
  return IMPERATIVES.has(first.charAt(0).toUpperCase() + first.slice(1).toLowerCase())
}

function sentencesOf(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function looksLikeProse(sentence) {
  const words = wordsOf(sentence)
  if (words.length < 2) return false
  const lexical = words.filter((word) => {
    const letters = word.replace(/[^A-Za-z]/g, '')
    return letters.length >= 4 && /[aeiouy]/i.test(letters)
  })
  return lexical.length >= 1
}

function stripHtml(text) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<\/(h[1-6]|p|li|button|div|label|article|section|header|footer|dt|dd|tr|td|th)>/gi, '. ')
    .replace(/<br\s*\/?>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
}

function lineAt(src, index) {
  let line = 1
  for (let i = 0; i < index && i < src.length; i += 1) {
    if (src.charCodeAt(i) === 10) line += 1
  }
  return line
}

function readQuoted(src, i, limit) {
  const quote = src[i]
  let j = i + 1
  let value = ''
  while (j < limit) {
    if (src[j] === '\\') {
      value += src[j + 1] ?? ''
      j += 2
      continue
    }
    if (src[j] === quote) return { value, end: j + 1 }
    value += src[j]
    j += 1
  }
  return { value, end: limit }
}

function readTemplate(src, i, limit) {
  let j = i + 1
  let value = ''
  const exprs = []
  while (j < limit) {
    if (src[j] === '\\') {
      value += src[j + 1] ?? ''
      j += 2
      continue
    }
    if (src[j] === '`') return { value, exprs, end: j + 1 }
    if (src[j] === '$' && src[j + 1] === '{') {
      const exprStart = j + 2
      let k = exprStart
      let depth = 1
      while (k < limit && depth > 0) {
        const c = src[k]
        if (c === "'" || c === '"') {
          k = readQuoted(src, k, limit).end
          continue
        }
        if (c === '`') {
          k = readTemplate(src, k, limit).end
          continue
        }
        if (c === '/' && src[k + 1] === '/') {
          const nl = src.indexOf('\n', k)
          k = nl < 0 ? limit : nl + 1
          continue
        }
        if (c === '{') depth += 1
        else if (c === '}') {
          depth -= 1
          if (depth === 0) break
        }
        k += 1
      }
      exprs.push({ start: exprStart, end: k })
      value += 'X'
      j = k + 1
      continue
    }
    value += src[j]
    j += 1
  }
  return { value, exprs, end: limit }
}

function scanJs(src) {
  const found = []
  function walk(start, end) {
    let i = start
    while (i < end) {
      const c = src[i]
      const next = src[i + 1]
      if (c === '/' && next === '/') {
        const nl = src.indexOf('\n', i)
        i = nl < 0 ? end : nl + 1
        continue
      }
      if (c === '/' && next === '*') {
        const close = src.indexOf('*/', i + 2)
        i = close < 0 ? end : close + 2
        continue
      }
      if (c === "'" || c === '"') {
        const quoted = readQuoted(src, i, end)
        found.push({ text: quoted.value, index: i })
        i = quoted.end
        continue
      }
      if (c === '`') {
        const template = readTemplate(src, i, end)
        found.push({ text: template.value, index: i })
        for (const expr of template.exprs) walk(expr.start, expr.end)
        i = template.end
        continue
      }
      i += 1
    }
  }
  walk(0, src.length)
  return found
}

function proseFrom(text) {
  const cleaned = stripHtml(normalize(text))
  if (!/[A-Za-z]/.test(cleaned)) return []
  if (/^(?:\.\/|\/|https?:)/.test(cleaned.trim())) return []
  const chunks = sentencesOf(cleaned)
  if (chunks.length === 0 && looksLikeProse(cleaned)) return [cleaned.trim()]
  return chunks.filter((sentence) => looksLikeProse(sentence) || CONTRACTION.test(normalize(sentence)))
}

function checkText(file, line, raw) {
  const hits = []
  for (const sentence of proseFrom(raw)) {
    const text = normalize(sentence)
    const count = wordsOf(text).length
    const limit = isProcedural(text) ? 20 : 25
    if (count > limit) {
      hits.push(`${file}:${line}: ${count} words (limit ${limit}): ${text}`)
    }
    if (CONTRACTION.test(text)) {
      hits.push(`${file}:${line}: contraction: ${text}`)
    }
    if (PASSIVE.test(text)) {
      hits.push(`${file}:${line}: passive: ${text}`)
    }
    const lower = text.toLowerCase()
    for (const phrase of PHRASALS) {
      const pattern = new RegExp(`\\b${phrase.replace('-', '\\-')}\\b`, 'i')
      if (pattern.test(lower)) hits.push(`${file}:${line}: phrasal verb "${phrase}": ${text}`)
    }
  }
  return hits
}

const hits = []
let sentences = 0
for (const file of files) {
  const full = path.join(root, file)
  const src = fs.readFileSync(full, 'utf8')
  if (file.endsWith('.html')) {
    const text = stripHtml(src)
    sentences += proseFrom(text).length
    hits.push(...checkText(file, 1, text))
    continue
  }
  for (const item of scanJs(src)) {
    const prose = proseFrom(item.text)
    sentences += prose.length
    hits.push(...checkText(file, lineAt(src, item.index), item.text))
  }
}

if (hits.length === 0) {
  console.log(`STE check: 0 hits`)
  console.log(`Checked ${sentences} sentences in ${files.length} files.`)
  process.exit(0)
}

console.log(`STE check: ${hits.length} hits`)
for (const hit of hits) console.log(hit)
console.log(`Checked ${sentences} sentences in ${files.length} files.`)
process.exit(1)
