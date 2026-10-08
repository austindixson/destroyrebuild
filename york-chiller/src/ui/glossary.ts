import { GLOSSARY, type GlossaryId } from '../data/content'

const SKIP_SELECTOR =
  'button, a, input, textarea, select, .plant-tag, .plant-labels, .jargon, .choice, .choices, .info-close, .info-head, .info-now, .info-foot'

/** Clickable cards keep their own action. Glossary for their text sits beside the card. */
const BESIDE_SELECTOR = '.chaos-cmd, .maint-item, .mimic-node, .mission, .plant-node'

/** Each of these is one "card" for the first-occurrence rule. Inner cards own their own text. */
const CARD_SELECTOR = [
  '.kpi',
  '.card',
  '.pipe-card',
  '.gain-read',
  '.gauge',
  '.step',
  '.quiz-card',
  '.trouble-card',
  '.trouble-card li',
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
  '.chaos-status',
  '.valve-alert',
  '#pipe-note',
  '.opti-screen',
  '.optiview-top',
  '.canvas-hud',
  '.nav-note',
  '.brand',
  '.chat-bubble',
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

function jargonControl(id: GlossaryId, visible: string): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'jargon'
  el.dataset.glossary = id
  el.setAttribute('aria-label', `Show the meaning of ${GLOSSARY[id].term}`)
  el.setAttribute('aria-haspopup', 'dialog')
  el.setAttribute('aria-expanded', 'false')
  el.setAttribute('aria-controls', 'info-dialog')
  const abbr = document.createElement('abbr')
  abbr.textContent = visible
  el.append(abbr)
  return el
}

function closestCard(node: Element) {
  return node.closest(CARD_SELECTOR)
}

function acceptGlossaryText(node: Node, card: Element): number {
  const parent = node.parentElement
  if (!parent) return NodeFilter.FILTER_REJECT
  if (parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT
  if (closestCard(parent) !== card) return NodeFilter.FILTER_REJECT
  if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT
  return NodeFilter.FILTER_ACCEPT
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
    frag.append(jargonControl(id, match[0]))
    last = match.index + match[0].length
  }
  if (!linked) return
  if (last < text.length) frag.append(text.slice(last))
  node.replaceWith(frag)
}

function linkCard(card: Element, skip?: GlossaryId) {
  if (card.matches('.match-tile')) return
  const seen = new Set<GlossaryId>()
  if (skip) seen.add(skip)
  card.querySelectorAll<HTMLElement>('.jargon').forEach((btn) => {
    if (closestCard(btn) !== card) return
    const id = btn.dataset.glossary
    if (id && isGlossaryId(id)) seen.add(id)
  })
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return acceptGlossaryText(node, card)
    },
  })
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  for (const node of nodes) linkText(node, seen)
}

function placeBeside(card: Element) {
  const next = card.nextElementSibling
  if (next?.classList.contains('jargon-beside')) next.remove()
  const ids = glossaryIdsIn(card.textContent ?? '')
  if (ids.length === 0) return
  const row = document.createElement('div')
  row.className = 'jargon-beside'
  for (const id of ids) row.append(jargonControl(id, GLOSSARY[id].term))
  card.after(row)
}

/** Terms inside a clickable card stay plain text. One glossary button sits beside that card. */
function placeGlossaryBeside(scope: ParentNode) {
  const cards: Element[] = []
  if (scope instanceof Element && scope.matches(BESIDE_SELECTOR)) cards.push(scope)
  cards.push(...scope.querySelectorAll(BESIDE_SELECTOR))
  for (const card of cards) placeBeside(card)
}

/**
 * One pass over trainer text. Wraps the first whole-word match of each glossary
 * term. Skips inputs, quiz choices, buttons, links, and 3D labels.
 * A clickable card keeps that term beside the card, not inside it.
 */
export function linkGlossary(scope: ParentNode, options?: { skip?: GlossaryId }) {
  const cards: Element[] = []
  if (scope instanceof Element && scope.matches(CARD_SELECTOR)) cards.push(scope)
  cards.push(...scope.querySelectorAll(CARD_SELECTOR))
  for (const card of cards) linkCard(card, options?.skip)
  placeGlossaryBeside(scope)
}
