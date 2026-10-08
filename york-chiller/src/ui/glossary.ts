import { GLOSSARY, type GlossaryId } from '../data/content'

const SKIP_SELECTOR =
  'button, a, input, textarea, select, .plant-tag, .plant-labels, .jargon, .choice, .choices, .info-close, .info-head, .info-now, .info-foot'

/** Each of these is one "card" for the first-occurrence rule. Inner cards own their own text. */
const CARD_SELECTOR = [
  '.kpi',
  '.card',
  '.pipe-card',
  '.gauge',
  '.step',
  '.quiz-card',
  '.trouble-card',
  '.mission',
  '.mimic-node',
  '.plant-node',
  '.match-tile',
  '.maint-item',
  '.detail-pane',
  '.weather-seg',
  '.info-panel',
  '.view-head',
  '.feedback',
  '.plant-reason',
  '.alarm-banner',
  '#pipe-note',
  '.opti-screen',
  '.optiview-top',
  '.canvas-hud',
  '.nav-note',
  '.brand',
  'label',
].join(',')

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const ALIASES = (Object.entries(GLOSSARY) as [GlossaryId, (typeof GLOSSARY)[GlossaryId]][])
  .flatMap(([id, entry]) => entry.aliases.map((alias) => ({ id, alias })))
  .sort((a, b) => b.alias.length - a.alias.length || a.alias.localeCompare(b.alias))

const ALIAS_TO_ID = new Map<string, GlossaryId>(ALIASES.map(({ id, alias }) => [alias.toLowerCase(), id]))

const GLOSSARY_RE = new RegExp(
  ALIASES.map(({ alias }) => `(?<![A-Za-z0-9])${escapeRegExp(alias)}(?![A-Za-z0-9])`).join('|'),
  'gi',
)

export function isGlossaryId(id: string): id is GlossaryId {
  return Object.prototype.hasOwnProperty.call(GLOSSARY, id)
}

/** First match of each term, in reading order. Whole token, aliases, case-insensitive. */
export function glossaryIdsIn(text: string, skip?: readonly GlossaryId[]): GlossaryId[] {
  const seen = new Set<GlossaryId>(skip)
  const hits: GlossaryId[] = []
  GLOSSARY_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = GLOSSARY_RE.exec(text))) {
    const id = ALIAS_TO_ID.get(match[0].toLowerCase())
    if (!id || seen.has(id)) continue
    seen.add(id)
    hits.push(id)
  }
  return hits
}

function jargonButton(id: GlossaryId, visible: string) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'jargon'
  btn.dataset.glossary = id
  btn.setAttribute('aria-label', `Show the meaning of ${GLOSSARY[id].term}`)
  btn.setAttribute('aria-haspopup', 'dialog')
  btn.setAttribute('aria-expanded', 'false')
  btn.setAttribute('aria-controls', 'info-dialog')
  const abbr = document.createElement('abbr')
  abbr.textContent = visible
  btn.append(abbr)
  return btn
}

function closestCard(node: Element) {
  return node.closest(CARD_SELECTOR)
}

function linkText(node: Text, seen: Set<GlossaryId>) {
  const text = node.data
  if (!text.trim()) return
  GLOSSARY_RE.lastIndex = 0
  let match: RegExpExecArray | null
  let last = 0
  let linked = false
  const frag = document.createDocumentFragment()
  while ((match = GLOSSARY_RE.exec(text))) {
    const id = ALIAS_TO_ID.get(match[0].toLowerCase())
    if (!id || seen.has(id)) continue
    seen.add(id)
    linked = true
    if (match.index > last) frag.append(text.slice(last, match.index))
    frag.append(jargonButton(id, match[0]))
    last = match.index + match[0].length
  }
  if (!linked) return
  if (last < text.length) frag.append(text.slice(last))
  node.replaceWith(frag)
}

function linkCard(card: Element, skip?: GlossaryId) {
  const seen = new Set<GlossaryId>()
  if (skip) seen.add(skip)
  card.querySelectorAll<HTMLButtonElement>('button.jargon').forEach((btn) => {
    if (closestCard(btn) !== card) return
    const id = btn.dataset.glossary
    if (id && isGlossaryId(id)) seen.add(id)
  })
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT
      if (closestCard(parent) !== card) return NodeFilter.FILTER_REJECT
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  for (const node of nodes) linkText(node, seen)
}

/**
 * One pass over trainer text. Wraps the first whole-word match of each glossary
 * term in a button. Skips inputs, buttons, links, quiz choices, and 3D labels.
 */
export function linkGlossary(scope: ParentNode, options?: { skip?: GlossaryId }) {
  const cards: Element[] = []
  if (scope instanceof Element && scope.matches(CARD_SELECTOR)) cards.push(scope)
  cards.push(...scope.querySelectorAll(CARD_SELECTOR))
  for (const card of cards) linkCard(card, options?.skip)
}
