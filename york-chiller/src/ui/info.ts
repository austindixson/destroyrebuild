import { GLOSSARY, INFO, type GlossaryId, type InfoId, type InfoLive } from '../data/content'
import type { PlantSnapshot } from '../sim/plantSim'
import { isGlossaryId, linkGlossary } from './glossary'

export interface LiveContext {
  snap: PlantSnapshot
  running: boolean
  /** True only for the trainer's ATS landing inject, matching the MBC landings gauge. */
  landing: boolean
}

const LIVE_LABEL: Record<InfoLive, string> = {
  hallSupply: 'Hall supply',
  hallReturn: 'Hall return',
  lchltAct: 'LCHLT actual',
  lchltSet: 'LCHLT setpoint',
  itLoad: 'IT load',
  head: 'CH-01 head',
  outdoor: 'Outdoor dry bulb',
  wetBulb: 'Wet-bulb',
  rla: 'CH-01 % FLA',
  mode: 'CH-01 mode',
  chwDp: 'CHW ΔP',
  cwDp: 'CW ΔP',
  glyDp: 'Glycol ΔP',
  chwValve: 'CHW valve',
  cwValve: 'CW valve',
  glyValve: 'Glycol valve',
  chwr: 'CHWR',
  chws: 'CHWS',
  cws: 'CWS',
  cwr: 'CWR',
  glyS: 'GLS',
  glyR: 'GLR',
  towerFan: 'Cooling tower fans',
  dryFan: 'Dry-cooler fans',
  freeCool: 'Free cooling',
  mbc: 'MBC',
  landings: 'Landings',
  vibe: '1× vibration',
  evapPsig: 'Evaporator',
  alarm: 'Alarm',
  optiAct: 'LCHLT actual',
  optiRla: '% FLA',
}

const LIVE_FORMAT: Record<InfoLive, (ctx: LiveContext) => string> = {
  hallSupply: (ctx) => `${ctx.snap.hallSupplyF}°F`,
  hallReturn: (ctx) => `${ctx.snap.hallReturnF}°F`,
  lchltAct: (ctx) => `${ctx.snap.lchltAct.toFixed(1)}°F`,
  lchltSet: (ctx) => `${ctx.snap.lchltSet.toFixed(1)}°F`,
  itLoad: (ctx) => `${ctx.snap.itLoadMw} MW`,
  head: (ctx) => `${ctx.snap.ch01.condPsig} psig`,
  outdoor: (ctx) => `${ctx.snap.oatF}°F`,
  wetBulb: (ctx) => `${ctx.snap.wbF}°F`,
  rla: (ctx) => `${ctx.snap.ch01.rla}%`,
  mode: (ctx) => ctx.snap.ch01.mode,
  chwDp: (ctx) => `${ctx.snap.chwDpPsi.toFixed(1)} psi · target ${ctx.snap.chwTargetPsi}`,
  cwDp: (ctx) => `${ctx.snap.cwDpPsi.toFixed(1)} psi`,
  glyDp: (ctx) => `${ctx.snap.glycolDpPsi.toFixed(1)} psi`,
  chwValve: (ctx) => `${ctx.snap.chwValvePct}%`,
  cwValve: (ctx) => `${ctx.snap.cwValvePct}%`,
  glyValve: (ctx) => `${ctx.snap.glycolValvePct}%`,
  chwr: (ctx) => `${ctx.snap.chwrF}°F`,
  chws: (ctx) => `${ctx.snap.chwsF}°F`,
  cws: (ctx) => `${ctx.snap.cwsF}°F`,
  cwr: (ctx) => `${ctx.snap.cwrF}°F`,
  glyS: (ctx) => `${ctx.snap.glyS}°F`,
  glyR: (ctx) => `${ctx.snap.glyR}°F`,
  towerFan: (ctx) => `${ctx.snap.towerFanPct}%`,
  dryFan: (ctx) => `${ctx.snap.dryFanPct}%`,
  freeCool: (ctx) => `${ctx.snap.freeCoolPct}%`,
  mbc: (ctx) => ctx.snap.ch01.mbc,
  landings: (ctx) => (ctx.landing ? '1' : '0'),
  vibe: (ctx) => (0.12 + Math.sin(ctx.snap.t) * 0.02).toFixed(2),
  evapPsig: (ctx) => (ctx.running ? '36 psig' : '48 psig'),
  alarm: (ctx) => ctx.snap.alarm ?? 'none',
  optiAct: (ctx) => (ctx.running ? `${ctx.snap.lchltAct.toFixed(1)}°F` : '58.2°F'),
  optiRla: (ctx) => (ctx.running ? `${ctx.snap.ch01.rla}%` : '0%'),
}

function formatLive(key: InfoLive, ctx: LiveContext): string {
  return LIVE_FORMAT[key](ctx)
}

function liveText(id: InfoId, ctx: LiveContext): string {
  const keys = INFO[id].live
  if (!keys?.length) return ''
  return keys.map((key) => `${LIVE_LABEL[key]}: ${formatLive(key, ctx)}`).join('\n')
}

type PanelMode = 'info' | 'glossary'

/** One info button and one panel. Glossary terms reuse this same popover and sheet. */
export class InfoDock {
  private layer: HTMLElement
  private panel: HTMLElement
  private titleEl: HTMLElement
  private nowEl: HTMLElement
  private bodyEl: HTMLElement
  private closeBtn: HTMLButtonElement
  private mode: PanelMode | null = null
  private infoId: InfoId | null = null
  private glossaryId: GlossaryId | null = null
  private trigger: HTMLButtonElement | null = null
  /** Focus returns here when the clicked term lived inside the panel and was replaced. */
  private anchor: HTMLButtonElement | null = null
  /** Stable parent of a glossary button. A live rewrite replaces the button and keeps this node. */
  private glossaryHost: HTMLElement | null = null
  private onKey: (event: KeyboardEvent) => void
  private onResize: () => void

  constructor(
    parent: HTMLElement,
    private appRoot: HTMLElement,
    private getLive: () => LiveContext,
  ) {
    this.layer = document.createElement('div')
    this.layer.className = 'info-layer'
    this.layer.hidden = true
    this.layer.innerHTML = `
      <div class="info-backdrop"></div>
      <div class="info-panel" id="info-dialog" role="dialog" aria-modal="true" aria-labelledby="info-title">
        <header class="info-head">
          <h3 id="info-title"></h3>
          <button type="button" class="info-close" aria-label="Close">Close</button>
        </header>
        <p class="info-now"></p>
        <ul class="info-points"></ul>
        <p class="info-foot">This text is not a site procedure or a replacement for approved service.</p>
      </div>`
    parent.append(this.layer)
    this.panel = this.layer.querySelector('.info-panel')!
    this.titleEl = this.layer.querySelector('#info-title')!
    this.nowEl = this.layer.querySelector('.info-now')!
    this.bodyEl = this.layer.querySelector('.info-points')!
    this.closeBtn = this.layer.querySelector('.info-close')!
    this.layer.querySelector('.info-backdrop')!.addEventListener('click', () => this.close(true))
    this.closeBtn.addEventListener('click', () => this.close(true))
    this.appRoot.addEventListener('click', (event) => this.onGlossaryClick(event), true)
    this.panel.addEventListener('click', (event) => this.onGlossaryClick(event), true)
    this.onKey = (event) => this.onKeyDown(event)
    this.onResize = () => {
      if (!this.mode) return
      const sheet = this.sheet()
      this.panel.classList.toggle('sheet', sheet)
      if (sheet) {
        this.panel.style.left = ''
        this.panel.style.top = ''
        this.panel.style.width = ''
      } else {
        this.place()
      }
    }
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('resize', this.onResize)
  }

  mount(scope: ParentNode) {
    const marked: HTMLElement[] = []
    if (scope instanceof HTMLElement && scope.dataset.info && !scope.classList.contains('info-btn')) {
      marked.push(scope)
    }
    marked.push(...scope.querySelectorAll<HTMLElement>('[data-info]'))
    for (const node of marked) {
      if (node.classList.contains('info-btn')) continue
      const id = node.dataset.info
      if (!id || !(id in INFO)) continue
      const infoId = id as InfoId
      let host = node
      if (node.matches('button, a')) {
        const parent = node.parentElement
        if (parent?.classList.contains('info-host') && parent.dataset.info === id) {
          host = parent
        } else {
          const wrap = document.createElement('div')
          wrap.className = 'info-host'
          wrap.dataset.info = id
          node.removeAttribute('data-info')
          node.parentNode?.insertBefore(wrap, node)
          wrap.append(node)
          host = wrap
        }
      } else {
        node.classList.add('info-host')
      }
      const existing = host.querySelector<HTMLButtonElement>(':scope > .info-btn')
      if (existing) {
        if (existing.dataset.infoBtn !== infoId) existing.replaceWith(this.button(infoId))
        continue
      }
      host.append(this.button(infoId))
    }
    linkGlossary(scope)
    this.retarget()
  }

  sync() {
    if (this.mode === 'info' && this.infoId) this.paintNow(this.infoId)
    this.retarget()
  }

  private button(id: InfoId) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'info-btn'
    btn.dataset.infoBtn = id
    btn.setAttribute('aria-label', `Information about ${INFO[id].title}`)
    btn.setAttribute('aria-haspopup', 'dialog')
    btn.setAttribute('aria-expanded', this.mode === 'info' && this.infoId === id ? 'true' : 'false')
    btn.setAttribute('aria-controls', 'info-dialog')
    const mark = document.createElement('span')
    mark.setAttribute('aria-hidden', 'true')
    mark.textContent = 'ⓘ'
    btn.append(mark)
    btn.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.toggleInfo(id, btn)
    })
    return btn
  }

  private onGlossaryClick(event: Event) {
    const target = event.target
    if (!(target instanceof Element)) return
    const btn = target.closest('button.jargon')
    if (!(btn instanceof HTMLButtonElement)) return
    const id = btn.dataset.glossary
    if (!id || !isGlossaryId(id)) return
    event.preventDefault()
    event.stopPropagation()
    this.toggleGlossary(id, btn)
  }

  private toggleInfo(id: InfoId, btn: HTMLButtonElement) {
    if (this.mode === 'info' && this.infoId === id && this.trigger === btn) {
      this.close(true)
      return
    }
    this.openInfo(id, btn)
  }

  private toggleGlossary(id: GlossaryId, btn: HTMLButtonElement) {
    if (this.mode === 'glossary' && this.glossaryId === id && this.trigger === btn) {
      this.close(true)
      return
    }
    this.openGlossary(id, btn)
  }

  private openInfo(id: InfoId, btn: HTMLButtonElement) {
    const entry = INFO[id]
    this.mode = 'info'
    this.infoId = id
    this.glossaryId = null
    this.rememberTrigger(btn)
    this.titleEl.textContent = entry.title
    this.fillPoints(entry.points)
    this.paintNow(id)
    linkGlossary(this.panel)
    this.present()
  }

  private openGlossary(id: GlossaryId, btn: HTMLButtonElement) {
    const entry = GLOSSARY[id]
    this.mode = 'glossary'
    this.glossaryId = id
    this.infoId = null
    this.rememberTrigger(btn)
    this.titleEl.textContent = entry.term
    const lines: string[] = [entry.definition]
    if (entry.why) lines.push(`Why this is important: ${entry.why}`)
    this.fillPoints(lines)
    this.nowEl.hidden = true
    this.nowEl.textContent = ''
    linkGlossary(this.panel, { skip: id })
    this.present()
  }

  private fillPoints(lines: readonly string[]) {
    this.bodyEl.replaceChildren(
      ...lines.map((line) => {
        const li = document.createElement('li')
        li.textContent = line
        return li
      }),
    )
  }

  private rememberTrigger(btn: HTMLButtonElement) {
    this.trigger = btn
    if (!this.panel.contains(btn)) this.anchor = btn
    this.glossaryHost = btn.parentElement
  }

  /** The live rewrite keeps the host and inserts a new button for the same term. */
  private replacementGlossaryTrigger(): HTMLButtonElement | null {
    if (!this.glossaryId) return null
    const host = this.glossaryHost
    if (!(host instanceof Element) || !host.isConnected) return null
    return host.querySelector<HTMLButtonElement>(`button.jargon[data-glossary="${CSS.escape(this.glossaryId)}"]`)
  }

  private present() {
    this.layer.hidden = false
    const sheet = this.sheet()
    this.panel.classList.toggle('sheet', sheet)
    this.appRoot.inert = true
    this.markExpanded()
    if (sheet) {
      this.panel.style.left = ''
      this.panel.style.top = ''
      this.panel.style.width = ''
    } else {
      this.place()
    }
    this.closeBtn.focus()
  }

  private paintNow(id: InfoId) {
    const text = liveText(id, this.getLive())
    this.nowEl.hidden = text.length === 0
    this.nowEl.textContent = text
  }

  private close(restore: boolean) {
    if (!this.mode && this.layer.hidden) return
    const focusTarget = this.trigger?.isConnected
      ? this.trigger
      : this.anchor?.isConnected
        ? this.anchor
        : this.replacementGlossaryTrigger()
    this.mode = null
    this.infoId = null
    this.glossaryId = null
    this.trigger = null
    this.anchor = null
    this.glossaryHost = null
    this.layer.hidden = true
    this.appRoot.inert = false
    this.markExpanded()
    if (restore && focusTarget) focusTarget.focus()
  }

  private retarget() {
    if (!this.mode) return
    if (this.trigger?.isConnected) {
      this.markExpanded()
      return
    }
    const mode = this.mode
    switch (mode) {
      case 'info': {
        if (!this.infoId) {
          this.close(false)
          return
        }
        const next = this.appRoot.querySelector<HTMLButtonElement>(
          `.info-btn[data-info-btn="${CSS.escape(this.infoId)}"]`,
        )
        if (!next) {
          this.close(false)
          return
        }
        this.trigger = next
        this.anchor = next
        this.markExpanded()
        if (!this.sheet()) this.place()
        return
      }
      case 'glossary': {
        const next = this.replacementGlossaryTrigger()
        if (!next) {
          this.trigger = null
          this.markExpanded()
          return
        }
        this.trigger = next
        this.anchor = next
        this.markExpanded()
        if (!this.sheet()) this.place()
        return
      }
      default: {
        const unknown: never = mode
        return unknown
      }
    }
  }

  private markExpanded() {
    const buttons = [
      ...this.appRoot.querySelectorAll<HTMLButtonElement>('.info-btn, button.jargon'),
      ...this.panel.querySelectorAll<HTMLButtonElement>('button.jargon'),
    ]
    for (const btn of buttons) {
      btn.setAttribute('aria-expanded', btn === this.trigger && this.mode ? 'true' : 'false')
    }
  }

  private sheet() {
    return window.matchMedia('(max-width: 900px)').matches
  }

  private place() {
    const trigger = this.trigger
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const width = Math.min(340, window.innerWidth - 16)
    this.panel.style.width = `${width}px`
    const height = this.panel.offsetHeight
    let left = rect.left
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8
    if (left < 8) left = 8
    let top = rect.bottom + 8
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 8)
    this.panel.style.left = `${left}px`
    this.panel.style.top = `${top}px`
  }

  private onKeyDown(event: KeyboardEvent) {
    if (!this.mode) return
    if (event.key === 'Escape') {
      event.preventDefault()
      this.close(true)
      return
    }
    if (event.key !== 'Tab') return
    const items = [...this.panel.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.hasAttribute('disabled'),
    )
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || !this.panel.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || !this.panel.contains(active))) {
      event.preventDefault()
      first.focus()
    }
  }

  dismiss() {
    this.close(false)
  }
}
