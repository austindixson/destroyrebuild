const IMPERATIVES = new Set([
  'Apply', 'Ask', 'Change', 'Clear', 'Close', 'Command', 'Compare', 'Complete', 'Coordinate',
  'Decrease', 'Do', 'Examine', 'Find', 'Follow', 'Give', 'Hold', 'Include', 'Increase', 'Keep',
  'Know', 'Let', 'Make', 'Match', 'Move', 'Name', 'Open', 'Practice', 'Prove', 'Put', 'Read',
  'Record', 'Remove', 'Retry', 'Select', 'Set', 'Start', 'Stop', 'Tell', 'Tighten', 'Update',
  'Use', 'Wait', 'Watch', 'Write',
])

const PHRASALS = [
  'pick up', 'shut down', 'turn on', 'turn off', 'carry out', 'set up', 'go through', 'find out',
  'look at', 'come back', 'go back', 'show up', 'start up', 'ramp up', 'slow down', 'follow up',
  'figure out', 'work out', 'point out', 'call out', 'run out',
]

const PASSIVE =
  /\b(?:is|are|was|were|been)(?:\s+being)?\s+(?:[a-z]+ed|held|made|seen|done|given|taken|known|shown|found|left|sent|lost|written|driven|begun|kept|met|built|fed|led|read|run|set|cut|put|paid|said|bound|caught|brought|bought|thought|taught|sought|felt|heard|meant|sold|told|stood|understood|become)\b/i

const CONTRACTION =
  /\b(?:i'm|i've|i'd|i'll|you're|you've|you'd|you'll|we're|we've|we'd|we'll|they're|they've|they'd|they'll|he's|she's|it's|that's|there's|what's|who's|here's|where's|how's|let's|can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|couldn't|shouldn't|wouldn't|mustn't|needn't|[a-z]+n't)\b/i

function wordsOf(sentence: string): string[] {
  return sentence.trim().split(/\s+/).filter(Boolean)
}

function procedural(sentence: string): boolean {
  const s = sentence.replace(/^[^A-Za-z]+/, '')
  if (/^Do not\b/i.test(s) || /^Make sure\b/i.test(s)) return true
  const first = (s.split(/\s+/)[0] ?? '').replace(/[^A-Za-z]/g, '')
  const titled = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
  return IMPERATIVES.has(titled)
}

function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function sentenceHits(sentence: string): string[] {
  const hits: string[] = []
  const count = wordsOf(sentence).length
  const limit = procedural(sentence) ? 20 : 25
  if (count > limit) hits.push('length')
  if (CONTRACTION.test(sentence)) hits.push('contraction')
  if (PASSIVE.test(sentence)) hits.push('passive')
  const lower = sentence.toLowerCase()
  for (const phrase of PHRASALS) {
    if (lower.includes(phrase)) hits.push('phrasal')
  }
  return hits
}

export function steHits(text: string): string[] {
  const hits: string[] = []
  for (const sentence of sentencesOf(text)) hits.push(...sentenceHits(sentence))
  return hits
}
