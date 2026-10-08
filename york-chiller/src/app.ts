import {
  COMPONENTS,
  CYCLE_NODES,
  MAINT_ITEMS,
  MATCH_PAIRS,
  PLANT_NODES,
  QUIZ,
  SHUTDOWN_STEPS,
  STARTUP_STEPS,
  TROUBLE_CASES,
  chainInfoId,
  componentInfoId,
  cycleInfoId,
  infoAttr,
  maintInfoId,
  missionInfoId,
  quizInfoId,
  stepInfoId,
  troubleInfoId,
  type ComponentId,
  type InfoId,
  type ViewId,
} from './data/content'
import type { ChillerScene, SceneReadings } from './3d/chillerScene'
import { openTroubleView, shuffleChoices, troubleStep, type TroubleDestination } from './troubleOrder'
import { addXp, loadProgress, masteryPercent, saveProgress, type ProgressState } from './progress'
import { PlantController, type PlantChangeDetail } from './sim/controller'
import { isIncidentKind, rankFor, type IncidentKind, type PlantSnapshot } from './sim/plantSim'
import { createYorkTools } from './sim/tools'
import { isTroubleCaseId, troubleIncident } from './sim/troubleMap'
import { iconSvg } from './ui/icons'
import { linkGlossary } from './ui/glossary'
import { InfoDock } from './ui/info'

type ChaosIncident = IncidentKind

const CHAOS_FAULTS: Record<ChaosIncident, { label: string; tone: 'amber' | 'rose'; info: InfoId }> = {
  'high-head': { label: 'Peak weather, high head', tone: 'amber', info: 'chaos-high-head' },
  'hall-hot': { label: 'Hot hall, low chiller load', tone: 'amber', info: 'chaos-hall-hot' },
  landing: { label: 'ATS landing', tone: 'rose', info: 'chaos-landing' },
  failover: { label: 'Lead trip and failover', tone: 'rose', info: 'chaos-failover' },
  'bms-fight': { label: 'BMS and panel disagree', tone: 'amber', info: 'chaos-bms-fight' },
}

const NAV: { id: ViewId; label: string; icon: string }[] = [
  { id: 'home', label: 'Live plant', icon: 'home' },
  { id: 'plant', label: 'Cooling chain', icon: 'cycle' },
  { id: 'explorer', label: '3D plant room', icon: 'explore' },
  { id: 'cycle', label: 'Refrigerant loop', icon: 'cycle' },
  { id: 'operation', label: 'MOP drill', icon: 'operate' },
  { id: 'optiview', label: 'OptiView', icon: 'panel' },
  { id: 'match', label: 'Icon match', icon: 'match' },
  { id: 'quiz', label: 'Knowledge gate', icon: 'quiz' },
  { id: 'trouble', label: 'Incident clock', icon: 'trouble' },
  { id: 'maintenance', label: 'Shift deck', icon: 'wrench' },
]

function pipeCardInfo(line: 'chw' | 'cw' | 'gly'): InfoId {
  switch (line) {
    case 'chw':
      return 'pipe-chw'
    case 'cw':
      return 'pipe-cw'
    case 'gly':
      return 'pipe-gly'
    default: {
      const unknown: never = line
      return unknown
    }
  }
}

function pipeSliderInfo(line: 'chw' | 'cw' | 'gly'): InfoId {
  switch (line) {
    case 'chw':
      return 'slider-chw'
    case 'cw':
      return 'slider-cw'
    case 'gly':
      return 'slider-gly'
    default: {
      const unknown: never = line
      return unknown
    }
  }
}

function lchltHint(s: PlantSnapshot): string {
  if (s.alarm && s.alarm.includes('LCHLT setpoint fights')) return s.alarm
  return `Trainer target ${s.lchltTargetF.toFixed(0)}°F.`
}

export class App {
  private root: HTMLElement
  private view: ViewId = 'home'
  private progress: ProgressState = loadProgress()
  private scene: ChillerScene | null = null
  private selected: ComponentId | null = null
  private toastEl!: HTMLDivElement
  private controller = new PlantController()
  private snap: PlantSnapshot = this.controller.snapshot
  private raf = 0
  private lastFrame = 0
  private lastUi = 0
  private lastInfo = 0
  private info: InfoDock
  private pendingConfirm: (() => void) | null = null

  private opMode: 'start' | 'stop' = 'start'
  private opIndex = 0
  private cycleIndex = 0
  private plantIndex = 0
  private matchIcons = shuffleChoices(MATCH_PAIRS)
  private matchLabels = shuffleChoices(MATCH_PAIRS)
  private matchSelectedIcon: string | null = null
  private matchLocked = new Set<string>()
  private matchScore = 0
  private quizOrder = shuffleChoices(QUIZ)
  private quizIndex = 0
  private quizScore = 0
  private quizAnswered = false
  private quizPick: number | null = null
  private troubleIndex = 0
  private troublePicked: number | null = null
  private troubleOptions: (typeof TROUBLE_CASES)[number]['options'] = []
  private troublePresentedId: string | null = null
  private troubleDoneView = false
  private troubleSeconds = 45
  private troubleTimer: number | null = null
  private maintChecks = new Set<string>()
  private optiTab: 'home' | 'mbc' | 'alarms' = 'home'

  constructor(root: HTMLElement) {
    this.root = root
    this.info = new InfoDock(document.body, this.root, () => ({
      snap: this.snap,
      running: this.controller.running,
      landing: this.controller.incident === 'landing',
    }))
    this.controller.addEventListener('change', (event) => {
      const detail = (event as CustomEvent<PlantChangeDetail>).detail
      this.snap = detail.snapshot
      this.onPlantChange()
    })
    if (import.meta.env.DEV) {
      window.__york = { controller: this.controller, tools: createYorkTools(this.controller) }
    }
    this.render()
    this.loop()
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    const wallDt = this.lastFrame === 0 ? 0 : Math.min(0.1, (now - this.lastFrame) / 1000)
    this.lastFrame = now
    this.snap = this.controller.tick(wallDt)
    if (this.view === 'home' && now - this.lastUi > 250) {
      this.lastUi = now
      this.patchLiveBoard()
    }
    if (this.view === 'optiview' && now - this.lastUi > 400) {
      this.lastUi = now
      this.patchOptiLive()
    }
    if (this.view === 'explorer' && now - this.lastUi > 250) {
      this.lastUi = now
      this.patchPipeBoard()
    }
    if (now - this.lastInfo > 250) {
      this.lastInfo = now
      this.info.sync()
    }
  }

  private toast(msg: string) {
    this.toastEl.textContent = msg
    this.toastEl.classList.add('show')
    window.setTimeout(() => this.toastEl.classList.remove('show'), 2200)
  }

  private setView(view: ViewId) {
    if (this.scene) {
      this.scene.dispose()
      this.scene = null
    }
    if (this.troubleTimer) {
      clearInterval(this.troubleTimer)
      this.troubleTimer = null
    }
    if (this.view === 'trouble' && view !== 'trouble' && TROUBLE_CASES[this.troubleIndex]?.id === 'bms-fight') {
      const cleared = this.controller.clearIncident('user')
      this.snap = cleared.snapshot
    }
    this.view = view
    if (view === 'trouble') {
      this.alignTroubleToIncident()
      this.openTrouble()
    }
    this.render()
  }

  private persist() {
    saveProgress(this.progress)
    this.updateMasteryUi()
  }

  private updateMasteryUi() {
    const pct = masteryPercent(this.progress)
    const fill = this.root.querySelector<HTMLElement>('[data-mastery-fill]')
    const label = this.root.querySelector<HTMLElement>('[data-mastery-label]')
    const xp = this.root.querySelector<HTMLElement>('[data-xp]')
    const rank = this.root.querySelector<HTMLElement>('[data-rank]')
    if (fill) fill.style.width = `${pct}%`
    if (label) label.textContent = `${pct}% mastery`
    if (xp) xp.textContent = `${this.progress.xp} XP`
    if (rank) rank.textContent = rankFor(pct, this.progress.xp).title
  }

  private markExplored(id: ComponentId) {
    if (!this.progress.explored.includes(id)) {
      this.progress.explored.push(id)
      this.progress = addXp(this.progress, 8)
      this.toast(`You unlocked ${COMPONENTS.find((c) => c.id === id)?.short}. You gain 8 XP.`)
    }
    this.persist()
  }

  render() {
    this.info.dismiss()
    const pct = masteryPercent(this.progress)
    const rank = rankFor(pct, this.progress.xp)
    this.root.innerHTML = `
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark"><span>YMC²</span></div>
          <div>
            <h1>Plant trainer</h1>
            <p>CHW for a data center</p>
          </div>
        </div>
        <div class="dc-badge">Live simulation · data center</div>
        <div class="rank-card">
          <div class="tier">Rank T${rank.tier}</div>
          <strong data-rank>${rank.title}</strong>
        </div>
        <div class="mastery">
          <div class="mastery-top">
            <span data-mastery-label>${pct}% mastery</span>
            <span data-xp>${this.progress.xp} XP</span>
          </div>
          <div class="bar"><i data-mastery-fill style="width:${pct}%"></i></div>
        </div>
        <nav class="nav">
          ${NAV.map(
            (n) => `
            <button type="button" data-nav="${n.id}" class="${this.view === n.id ? 'active' : ''}">
              ${iconSvg(n.icon, 22)}
              <span>${n.label}</span>
            </button>`,
          ).join('')}
        </nav>
        <p class="nav-note">Operate as if the hall is live. The topics are the YORK YMC² O&amp;M, N+1, the MOP, and the NOC.</p>
      </aside>
      <main class="main" id="view"></main>
      <div class="toast" id="toast"></div>
      <div class="confirm-card" id="confirm-card" hidden role="dialog" aria-modal="true" aria-labelledby="confirm-copy">
        <div class="confirm-panel">
          <p id="confirm-copy"></p>
          <div class="confirm-actions">
            <button class="btn" type="button" id="confirm-yes">Do the stop</button>
            <button class="btn ghost" type="button" id="confirm-no">Cancel</button>
          </div>
        </div>
      </div>
    `
    this.toastEl = this.root.querySelector('#toast')!
    this.pendingConfirm = null
    this.bindConfirm()
    this.root.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => this.setView(btn.dataset.nav as ViewId))
    })
    this.renderView()
  }

  private renderView() {
    const el = this.root.querySelector('#view')!
    const map: Record<ViewId, () => void> = {
      home: () => {
        el.innerHTML = this.homeHtml()
        this.bindHome(el)
      },
      plant: () => {
        el.innerHTML = this.plantHtml()
        this.bindPlant(el)
      },
      explorer: () => {
        el.innerHTML = this.explorerHtml()
        void this.bindExplorer(el)
      },
      cycle: () => {
        el.innerHTML = this.cycleHtml()
        this.bindCycle(el)
      },
      operation: () => {
        el.innerHTML = this.operationHtml()
        this.bindOperation(el)
      },
      optiview: () => {
        el.innerHTML = this.optiviewHtml()
        this.bindOptiview(el)
      },
      match: () => {
        el.innerHTML = this.matchHtml()
        this.bindMatch(el)
      },
      quiz: () => {
        el.innerHTML = this.quizHtml()
        this.bindQuiz(el)
      },
      trouble: () => {
        el.innerHTML = this.troubleHtml()
        this.bindTrouble(el)
      },
      maintenance: () => {
        el.innerHTML = this.maintenanceHtml()
        this.bindMaintenance(el)
      },
    }
    map[this.view]()
    this.info.mount(el)
    const sidebar = this.root.querySelector('.sidebar')
    if (sidebar) linkGlossary(sidebar)
  }

  /** Replace live prose and link the first glossary hit in that block. */
  private relinkText(el: Element, text: string) {
    if (el.textContent !== text) {
      const active = document.activeElement
      const glossary =
        active instanceof HTMLButtonElement && el.contains(active) ? active.dataset.glossary : undefined
      el.textContent = text
      linkGlossary(el)
      if (glossary) {
        el.querySelector<HTMLButtonElement>(`button.jargon[data-glossary="${CSS.escape(glossary)}"]`)?.focus()
      }
      return
    }
    linkGlossary(el)
  }

  private homeHtml() {
    const s = this.snap
    const missions = [
      { id: 'plant', title: 'Cooling chain', desc: 'IT load, then CHW, then the YMC², then the cooling tower and the dry cooler', done: this.progress.plantComplete },
      { id: 'explorer', title: '3D walkdown', desc: 'Select every assembly in the plant room', done: this.progress.explored.length >= 8 },
      { id: 'cycle', title: 'Refrigerant loop', desc: 'Follow the vapor-compression path', done: this.progress.cycleComplete },
      { id: 'operation', title: 'MOP drill', desc: 'Make sure of redundancy before you touch the plant', done: this.progress.operationComplete },
      { id: 'optiview', title: 'OptiView', desc: 'Operate CH-01 from the panel', done: this.progress.optiviewComplete },
      { id: 'match', title: 'Icon match', desc: 'Match each icon to a system', done: this.progress.matchBest >= 8 },
      { id: 'quiz', title: 'Knowledge gate', desc: 'Ten questions on the plant and the O&M', done: this.progress.quizBest >= 8 },
      { id: 'trouble', title: 'Incident clock', desc: 'Select an action before the NOC timer ends', done: this.progress.troubleSolved.length >= TROUBLE_CASES.length },
      { id: 'maintenance', title: 'Shift deck', desc: 'Review the tasks for a plant that runs all day', done: this.progress.maintenanceComplete },
    ]
    return `
      <div class="view-head">
        <div>
          <h2>Central plant, live board</h2>
          <p>This trainer is not a card deck. Watch the IT heat move through the plant. Change the weather. Start an incident. Repeat the steps until they are familiar.</p>
        </div>
        <div class="weather-seg" ${infoAttr('weather-preset')}>
          <button type="button" data-oat="40" class="${s.oatF <= 50 ? 'on' : ''}">40°F cold</button>
          <button type="button" data-oat="75" class="${s.oatF > 50 && s.oatF < 90 ? 'on' : ''}">75°F mild</button>
          <button type="button" data-oat="100" class="${s.oatF >= 90 ? 'on' : ''}">100°F hot</button>
        </div>
      </div>
      <div class="alarm-banner ${s.alarm ? 'show' : ''}" id="alarm-banner">${s.alarm ?? ''}</div>
      <div class="kpi-strip" id="kpi-strip">${this.kpiHtml(s)}</div>
      ${this.plantControlsHtml()}
      <div class="mimic">
        <div class="mimic-flow"><i></i></div>
        <div class="mimic-grid">
          ${this.mimicNode('it', '01', 'IT load', `${s.itLoadMw} MW of IT heat`, 'quiz', 'mimic-it')}
          ${this.mimicNode('crah', '02', 'CRAH / CDU', `Supply ${s.hallSupplyF}°F · Return ${s.hallReturnF}°F`, 'plant', 'mimic-crah')}
          ${this.mimicNode('chw', '03', 'CHW loop', `ΔP ${s.chwDpPsi} psi`, 'plant', 'mimic-chw')}
          ${this.mimicNode('ch1', '04', 'CH-01 YMC²', `${s.ch01.mode.toUpperCase()} · ${s.ch01.rla}% FLA`, 'explorer', 'mimic-chiller', s.ch01.mode === 'alarm')}
          ${this.mimicNode('tower', '05', 'Cooling tower and dry cooler', `Wet-bulb ${s.wbF}°F · Dry-bulb ${s.oatF}°F · free cooling ${s.freeCoolPct}%`, 'cycle', 'mimic-tower')}
          ${this.mimicNode('noc', '06', 'NOC / BMS', s.alarm ? 'Escalated' : 'The watch desk is normal', 'trouble', 'mimic-noc', Boolean(s.alarm))}
        </div>
      </div>
      <p class="plant-reason" id="plant-reason">${s.reason}</p>
      <div class="home-split">
        <div class="card" ${infoAttr('drill-queue')}>
          <h3>Drill queue</h3>
          <div class="mission-list">
            ${missions
              .map(
                (m) => `
              <button type="button" class="mission ${m.done ? 'done' : ''}" data-go="${m.id}" ${infoAttr(missionInfoId(m.id))}>
                <div class="card-icon">${iconSvg(NAV.find((n) => n.id === m.id)?.icon ?? 'explore', 22)}</div>
                <div>
                  <h3>${m.title}</h3>
                  <p>${m.desc}</p>
                </div>
                <span class="status">${m.done ? 'Done' : 'Open'}</span>
              </button>`,
              )
              .join('')}
          </div>
        </div>
        <div class="card" ${infoAttr('chaos-board')}>
          <h3>Inject chaos</h3>
          <p class="chaos-status${this.controller.incident ? ' is-fault' : ''}" id="chaos-status" role="status">${this.chaosStatusText()}</p>
          <p class="empty-state" style="margin-bottom:12px">Apply a fault on the live board. Then open the incident clock for the same fault. Clear the incident restores the plant to the state before the fault.</p>
          <div class="chaos-actions">
            ${(Object.keys(CHAOS_FAULTS) as ChaosIncident[]).map((id) => this.chaosButton(id)).join('')}
            ${this.chaosButton('clear')}
            <button class="btn" type="button" data-go="trouble">Open the incident clock</button>
          </div>
        </div>
      </div>
    `
  }

  private mimicNode(
    id: string,
    n: string,
    title: string,
    body: string,
    go: ViewId,
    infoId: InfoId,
    alarm = false,
  ) {
    return `
      <button type="button" class="mimic-node ${alarm ? 'alarm' : ''}" data-mimic="${id}" data-go="${go}" ${infoAttr(infoId)}>
        <span class="pulse"></span>
        <div class="n">${n}</div>
        <h3>${title}</h3>
        <p data-mimic-body="${id}">${body}</p>
      </button>`
  }

  private kpiHtml(s: PlantSnapshot) {
    const hallBad = s.hallSupplyF > 78
    const headBad = s.ch01.condPsig > 115
    return `
      <div class="kpi ${hallBad ? 'bad' : 'ok'}" ${infoAttr('kpi-hall')}><div class="label">Hall supply</div><div class="val" data-k="hall">${s.hallSupplyF}°F</div></div>
      <div class="kpi" ${infoAttr('kpi-lchlt')}><div class="label">LCHLT</div><div class="val" data-k="lchlt">${s.lchltAct}°F</div></div>
      <div class="kpi" ${infoAttr('kpi-it')}><div class="label">IT load</div><div class="val" data-k="it">${s.itLoadMw} MW</div></div>
      <div class="kpi ${headBad ? 'warn' : ''}" ${infoAttr('kpi-head')}><div class="label">CH-01 head</div><div class="val" data-k="head">${s.ch01.condPsig} psig</div></div>
      <div class="kpi" ${infoAttr('kpi-outdoor')}><div class="label">Outdoor</div><div class="val" data-k="cwet">${s.oatF}°F</div></div>
      <div class="kpi ${s.ch01.mode === 'alarm' ? 'bad' : 'ok'}" ${infoAttr('kpi-ch01')}><div class="label">CH-01</div><div class="val" data-k="ch1">${s.ch01.rla}%</div></div>
    `
  }

  private patchLiveBoard() {
    const s = this.snap
    this.patchAlarmBanner(s.alarm)
    this.patchKpiStrip(s)
    this.patchMimicBodies(s)
    const reason = this.root.querySelector('#plant-reason')
    if (reason) this.relinkText(reason, s.reason)
    this.markMimicAlarms(s)
    this.patchChaosButtons()
    this.patchPlantControls()
  }

  private chaosStatusText(): string {
    const id = this.controller.incident
    if (!id) return 'No fault is active.'
    return `Active fault: ${CHAOS_FAULTS[id].label}.`
  }

  private chaosButton(id: ChaosIncident | 'clear'): string {
    const on = id === 'clear' ? this.controller.incident === null : this.controller.incident === id
    const fault = id === 'clear' ? null : CHAOS_FAULTS[id]
    const tone = fault?.tone ?? 'ghost'
    const info = fault?.info ?? 'chaos-clear'
    const label = fault?.label ?? 'Clear the incident'
    const pressed = on ? 'true' : 'false'
    const flag = on ? 'On' : ''
    return `<button class="btn ${tone}${on ? ' on' : ''}" type="button" data-incident="${id}" aria-pressed="${pressed}" ${infoAttr(info)}><span class="chaos-flag" aria-hidden="true">${flag}</span>${label}</button>`
  }

  private patchChaosButtons() {
    const incident = this.controller.incident
    const status = this.root.querySelector('#chaos-status')
    if (status) {
      const text = this.chaosStatusText()
      if (status.textContent !== text) status.textContent = text
      status.classList.toggle('is-fault', incident !== null)
    }
    this.root.querySelectorAll<HTMLButtonElement>('[data-incident]').forEach((button) => {
      const id = button.dataset.incident
      const on = id === 'clear' ? incident === null : id === incident
      button.classList.toggle('on', on)
      button.setAttribute('aria-pressed', on ? 'true' : 'false')
      const flag = button.querySelector('.chaos-flag')
      if (flag) flag.textContent = on ? 'On' : ''
    })
  }

  private patchAlarmBanner(alarm: string | null) {
    const banner = this.root.querySelector('#alarm-banner')
    if (!banner) return
    banner.classList.toggle('show', Boolean(alarm))
    this.relinkText(banner, alarm ?? '')
  }

  private patchKpiStrip(s: PlantSnapshot) {
    const strip = this.root.querySelector('#kpi-strip')
    if (!strip) return
    const focus = this.captureStripFocus(strip)
    strip.innerHTML = this.kpiHtml(s)
    this.info.mount(strip)
    this.restoreStripFocus(strip, focus)
  }

  private captureStripFocus(strip: Element) {
    const active = document.activeElement
    if (!(active instanceof HTMLButtonElement) || !strip.contains(active)) return null
    if (active.classList.contains('info-btn')) return { info: active.dataset.infoBtn }
    if (!active.classList.contains('jargon')) return null
    return {
      glossary: active.dataset.glossary,
      host: active.closest<HTMLElement>('.kpi')?.dataset.info,
    }
  }

  private restoreStripFocus(
    strip: Element,
    focus: { info?: string; glossary?: string; host?: string } | null,
  ) {
    if (!focus) return
    if (focus.info) {
      strip.querySelector<HTMLButtonElement>(`.info-btn[data-info-btn="${CSS.escape(focus.info)}"]`)?.focus()
      return
    }
    if (!focus.glossary || !focus.host) return
    strip
      .querySelector<HTMLButtonElement>(
        `.kpi[data-info="${CSS.escape(focus.host)}"] button.jargon[data-glossary="${CSS.escape(focus.glossary)}"]`,
      )
      ?.focus()
  }

  private patchMimicBodies(s: PlantSnapshot) {
    const bodies: Record<string, string> = {
      it: `${s.itLoadMw} MW of IT heat`,
      crah: `Supply ${s.hallSupplyF}°F · Return ${s.hallReturnF}°F`,
      chw: `ΔP ${s.chwDpPsi} psi`,
      ch1: `${s.ch01.mode.toUpperCase()} · ${s.ch01.rla}% FLA`,
      tower: `Wet-bulb ${s.wbF}°F · Dry-bulb ${s.oatF}°F · free cooling ${s.freeCoolPct}%`,
      noc: s.alarm ? 'Escalated' : 'The watch desk is normal',
    }
    for (const [id, text] of Object.entries(bodies)) {
      const el = this.root.querySelector(`[data-mimic-body="${id}"]`)
      if (el) el.textContent = text
    }
  }

  private markMimicAlarms(s: PlantSnapshot) {
    this.root.querySelectorAll('.mimic-node').forEach((n) => {
      const id = (n as HTMLElement).dataset.mimic
      const alarm = id === 'ch1' ? s.ch01.mode === 'alarm' : id === 'noc' && Boolean(s.alarm)
      n.classList.toggle('alarm', alarm)
    })
  }

  private bindHome(el: Element) {
    el.querySelectorAll<HTMLElement>('[data-go]').forEach((n) => {
      n.addEventListener('click', () => this.setView(n.dataset.go as ViewId))
    })
    el.querySelectorAll<HTMLButtonElement>('[data-oat]').forEach((b) => {
      b.addEventListener('click', () => {
        this.controller.setOutdoorDryBulb(Number(b.dataset.oat), 'user')
        this.snap = this.controller.snapshot
        this.renderView()
      })
    })
    el.querySelectorAll<HTMLButtonElement>('[data-incident]').forEach((b) => {
      b.addEventListener('click', () => {
        const v = b.dataset.incident ?? ''
        const active = this.isChaosIncident(v) && this.controller.incident === v
        if (v === 'clear' || active) {
          const result = this.controller.clearIncident('user')
          this.snap = result.snapshot
          this.toast(result.ok ? 'The plant is stable.' : result.message)
          this.patchLiveBoard()
          return
        }
        if (!isIncidentKind(v)) return
        if (this.controller.incident) this.controller.clearIncident('user')
        const result = this.controller.injectIncident(v, 'user')
        this.snap = result.snapshot
        this.toast(result.ok ? 'The incident is active. The board is live.' : result.message)
        this.patchLiveBoard()
      })
    })
    this.bindPlantControls(el)
  }

  private isChaosIncident(value: string): value is ChaosIncident {
    return Object.prototype.hasOwnProperty.call(CHAOS_FAULTS, value)
  }

  private plantHtml() {
    const node = PLANT_NODES[this.plantIndex]
    return `
      <div class="view-head">
        <div>
          <h2>Cooling chain</h2>
          <p>See where the YMC² sits in the plant. Know the upstream equipment and the downstream equipment before you change a setpoint.</p>
        </div>
        <span class="chip">Link ${this.plantIndex + 1}/${PLANT_NODES.length}</span>
      </div>
      <div class="plant-flow">
        ${PLANT_NODES.map(
          (n, i) => `
          <button type="button" class="plant-node ${i === this.plantIndex ? 'active' : ''}" data-plant="${i}" ${infoAttr(chainInfoId(n.id))}>
            <span class="n">0${i + 1}</span><strong>${n.label}</strong>
          </button>
          ${i < PLANT_NODES.length - 1 ? '<div class="plant-arrow">→</div>' : ''}`,
        ).join('')}
      </div>
      <div class="card" style="margin-top:16px" ${infoAttr(chainInfoId(node.id))}>
        <h3>${node.label}</h3>
        <p class="empty-state">${node.detail}</p>
        <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
          <button class="btn ghost" type="button" data-plant-prev>Previous</button>
          <button class="btn" type="button" data-plant-next>${this.plantIndex === PLANT_NODES.length - 1 ? 'Finish the path' : 'Next unit'}</button>
        </div>
      </div>
    `
  }

  private bindPlant(el: Element) {
    el.querySelectorAll<HTMLButtonElement>('[data-plant]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.plantIndex = Number(btn.dataset.plant)
        this.renderView()
      })
    })
    el.querySelector('[data-plant-prev]')?.addEventListener('click', () => {
      this.plantIndex = (this.plantIndex - 1 + PLANT_NODES.length) % PLANT_NODES.length
      this.renderView()
    })
    el.querySelector('[data-plant-next]')?.addEventListener('click', () => {
      if (this.plantIndex === PLANT_NODES.length - 1) {
        if (!this.progress.plantComplete) {
          this.progress.plantComplete = true
          this.progress = addXp(this.progress, 25)
          this.toast('You completed the cooling chain. You gain 25 XP.')
          this.persist()
        }
        return
      }
      this.plantIndex += 1
      this.renderView()
    })
  }

  private detailHtml() {
    const info = COMPONENTS.find((c) => c.id === this.selected)
    if (!info) {
      return `<span class="tag">Ready</span><h3>Select a system</h3><p class="empty-state">Use the buttons on the rail, or select the model. The rail is the best control on a phone. Magnetic bearings glow rose. The OptiView area glows green.</p><div class="tip">Complete all eight assemblies for walkdown credit.</div>`
    }
    return `<span class="tag">${info.short}</span><h3>${info.name}</h3><p class="empty-state">${info.summary}</p><ul>${info.details.map((d) => `<li>${d}</li>`).join('')}</ul><div class="tip"><strong>Operator action:</strong> ${info.operatorTip}</div>`
  }

  private hotspotRailHtml() {
    return COMPONENTS.map(
      (c) => `
      <button type="button" data-focus="${c.id}" class="${this.selected === c.id ? 'active' : ''}">
        <span class="swatch" style="background:${c.color}"></span>
        ${iconSvg(c.icon, 18)} ${c.short}
        ${this.progress.explored.includes(c.id) ? '✓' : ''}
      </button>`,
    ).join('')
  }

  private patchExplorerUi() {
    const detail = this.root.querySelector('#detail')
    const rail = this.root.querySelector('#hotspot-rail')
    const chip = this.root.querySelector('#explore-chip')
    if (detail instanceof HTMLElement) {
      detail.dataset.info = this.selected ? componentInfoId(this.selected) : 'detail-ready'
      detail.innerHTML = this.detailHtml()
      this.info.mount(detail)
    }
    if (rail) {
      rail.innerHTML = this.hotspotRailHtml()
      this.bindExplorerRail(rail)
    }
    if (chip) chip.textContent = `${this.progress.explored.length} of 8 complete`
  }

  private onExplorerSelect(id: ComponentId) {
    this.selected = id
    this.markExplored(id)
    this.scene?.focus(id)
    this.patchExplorerUi()
  }

  private highlightPipe(id: string) {
    const line = id.startsWith('chw') ? 'chw' : id.startsWith('cw') ? 'cw' : 'gly'
    this.root.querySelectorAll('.pipe-card').forEach((card) => {
      card.classList.toggle('lit', card.getAttribute('data-line') === line)
    })
    this.root.querySelector(`#${line}-valve`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  private bindExplorerRail(rail: Element) {
    rail.querySelectorAll<HTMLButtonElement>('[data-focus]').forEach((btn) => {
      btn.addEventListener('click', () => this.onExplorerSelect(btn.dataset.focus as ComponentId))
    })
  }

  private explorerHtml() {
    return `
      <div class="view-head">
        <div>
          <h2>3D plant room</h2>
          <p>Teal pipes are CHW to the hall. Gold pipes are CW to the cooling tower. Violet pipes are glycol to the dry cooler.</p>
        </div>
        <span class="chip" id="explore-chip">${this.progress.explored.length} of 8 complete</span>
      </div>
      <div class="hero-panel">
        <div class="canvas-wrap">
          <div class="canvas-hud">
            <span class="pill">CH-01 · N+1</span>
            <span class="pill" id="canvas-status">The 3D view starts.</span>
          </div>
          <div class="canvas-boot" id="canvas-boot">The plant model starts.</div>
          <canvas id="chiller-canvas"></canvas>
        </div>
        <aside class="detail-pane" id="detail" ${infoAttr(this.selected ? componentInfoId(this.selected) : 'detail-ready')}>${this.detailHtml()}</aside>
      </div>
      <div class="hotspot-rail" id="hotspot-rail">${this.hotspotRailHtml()}</div>
      ${this.pipeBoardHtml()}
    `
  }

  private pipeBoardHtml() {
    const s = this.snap
    const card = (
      line: 'chw' | 'cw' | 'gly',
      title: string,
      enterTag: string,
      leaveTag: string,
      valve: number,
    ) => `
      <article class="pipe-card" data-line="${line}" ${infoAttr(pipeCardInfo(line))}>
        <h3>${title}</h3>
        <div class="pt-row"><span>${enterTag}</span><b id="pt-${line}-enter-t">—</b><b id="pt-${line}-enter-p">—</b></div>
        <div class="pt-row"><span>${leaveTag}</span><b id="pt-${line}-leave-t">—</b><b id="pt-${line}-leave-p">—</b></div>
        <label ${infoAttr(pipeSliderInfo(line))}>Balance valve <output id="${line}-valve-out">${valve}%</output>
          <input id="${line}-valve" type="range" min="15" max="100" step="1" value="${valve}" />
        </label>
        <p class="dp-read" id="${line}-dp-read">ΔP —</p>
        <p class="gain-read" id="${line}-gain">—</p>
      </article>`
    return `
      <section class="pipe-board" id="pipe-board">
        <div class="pipe-head">
          <h3>Field instruments</h3>
          <label class="oat-row" ${infoAttr('slider-oat')}>Outdoor dry-bulb <output id="oat-out">${s.oatF}°F</output>
            <input id="oat" type="range" min="20" max="110" step="1" value="${s.oatF}" />
          </label>
          <p id="pipe-note">${s.reason}</p>
        </div>
        <div class="pipe-grid">
          ${card('chw', 'CHW to the hall', 'CHWR', 'CHWS', s.chwValvePct)}
          ${card('cw', 'CW to the cooling tower', 'CWS', 'CWR', s.cwValvePct)}
          ${card('gly', 'Glycol to the dry cooler', 'GLS', 'GLR', s.glycolValvePct)}
        </div>
      </section>`
  }

  private bindPipeBoard(root: ParentNode) {
    const wire = (loop: 'chw' | 'cw' | 'gly') => {
      const input = root.querySelector<HTMLInputElement>(`#${loop}-valve`)
      const out = root.querySelector(`#${loop}-valve-out`)
      input?.addEventListener('input', () => {
        const pct = Number(input.value)
        if (out) out.textContent = `${pct}%`
        this.controller.setValve(loop, pct, 'user')
        this.snap = this.controller.snapshot
        const applied = loop === 'chw' ? this.snap.chwValvePct : loop === 'cw' ? this.snap.cwValvePct : this.snap.glycolValvePct
        this.scene?.setValve(loop, applied)
        this.patchPipeBoard()
      })
    }
    wire('chw')
    wire('cw')
    wire('gly')
    const oat = root.querySelector<HTMLInputElement>('#oat')
    const oatOut = root.querySelector('#oat-out')
    oat?.addEventListener('input', () => {
      const f = Number(oat.value)
      if (oatOut) oatOut.textContent = `${f}°F`
      this.controller.setOutdoorDryBulb(f, 'user')
      this.snap = this.controller.snapshot
      this.patchPipeBoard()
    })
  }

  private patchPipeBoard() {
    const s = this.snap
    const set = (id: string, text: string) => {
      const el = this.root.querySelector(`#${id}`)
      if (el) el.textContent = text
    }
    set('pt-chw-enter-t', `${s.chwrF}°F`)
    set('pt-chw-enter-p', `${s.chwrPsi.toFixed(1)} psi`)
    set('pt-chw-leave-t', `${s.chwsF}°F`)
    set('pt-chw-leave-p', `${s.chwsPsi.toFixed(1)} psi`)
    set('pt-cw-enter-t', `${s.cwsF}°F`)
    set('pt-cw-enter-p', `${s.cwsPsi.toFixed(1)} psi`)
    set('pt-cw-leave-t', `${s.cwrF}°F`)
    set('pt-cw-leave-p', `${s.cwrPsi.toFixed(1)} psi`)
    set('pt-gly-enter-t', `${s.glyS}°F`)
    set('pt-gly-enter-p', `${s.glySPsi.toFixed(1)} psi`)
    set('pt-gly-leave-t', `${s.glyR}°F`)
    set('pt-gly-leave-p', `${s.glyRPsi.toFixed(1)} psi`)
    const chw = this.root.querySelector('#chw-dp-read')
    const cw = this.root.querySelector('#cw-dp-read')
    const gly = this.root.querySelector('#gly-dp-read')
    if (chw) {
      chw.textContent = `ΔP ${s.chwDpPsi.toFixed(1)} psi · target ${s.chwTargetPsi}`
      chw.classList.toggle('bad', s.chwDpPsi < 12 || s.chwDpPsi > 24)
    }
    if (cw) {
      cw.textContent = `ΔP ${s.cwDpPsi.toFixed(1)} psi · fans ${s.towerFanPct}%`
      cw.classList.toggle('bad', s.cwDpPsi < 8 || s.cwDpPsi > 18)
    }
    if (gly) {
      gly.textContent = `ΔP ${s.glycolDpPsi.toFixed(1)} psi · free cooling ${s.freeCoolPct}%`
      gly.classList.toggle('bad', s.oatF <= 48 && s.glycolDpPsi < 8)
    }
    set('chw-gain', `${s.chwGain.toFixed(1)} psi per 10% of stem`)
    const cwGain = this.root.querySelector('#cw-gain')
    if (cwGain) this.relinkText(cwGain, `${s.cwHeadGain.toFixed(1)} psi of head per 10%. Wet-bulb ${s.wbF}°F`)
    set('gly-gain', `${s.glycolGain.toFixed(1)} psi per 10%. Dry cooler fans ${s.dryFanPct}%`)
    const note = this.root.querySelector('#pipe-note')
    if (note) {
      const warn =
        s.chwDpPsi < 12
          ? 'The CHW ΔP is low. Open the CHW valve before the hall gets hot. '
          : s.chwDpPsi > 24
            ? 'The CHW ΔP is high. Decrease the opening of the CHW valve. '
            : ''
      this.relinkText(note, warn + s.reason)
    }
    this.scene?.setFans(s.dryFanPct, s.towerFanPct)
    this.scene?.setReadings(this.sceneReadings())
    this.syncFollowedValve('chw', s.chwValvePct)
    this.syncFollowedValve('cw', s.cwValvePct)
    this.syncFollowedValve('gly', s.glycolValvePct)
  }

  private syncFollowedValve(loop: 'chw' | 'cw' | 'gly', pct: number) {
    const slider = this.root.querySelector<HTMLInputElement>(`#${loop}-valve`)
    const out = this.root.querySelector(`#${loop}-valve-out`)
    if (slider && document.activeElement !== slider) {
      slider.value = String(pct)
      if (out) out.textContent = `${pct}%`
    }
  }

  private sceneReadings(): SceneReadings {
    const s = this.snap
    return {
      chwsF: s.chwsF,
      chwrF: s.chwrF,
      cwsF: s.cwsF,
      cwrF: s.cwrF,
      glyS: s.glyS,
      glyR: s.glyR,
      chwValvePct: s.chwValvePct,
      cwValvePct: s.cwValvePct,
      glycolValvePct: s.glycolValvePct,
      towerFanPct: s.towerFanPct,
      dryFanPct: s.dryFanPct,
    }
  }

  private async bindExplorer(el: Element) {
    this.bindExplorerRail(el.querySelector('#hotspot-rail')!)
    const canvas = el.querySelector<HTMLCanvasElement>('#chiller-canvas')!
    const status = el.querySelector('#canvas-status')
    const boot = el.querySelector('#canvas-boot')
    try {
      const mod = await import('./3d/chillerScene')
      if (this.view !== 'explorer') return
      if (!mod.webglAvailable()) {
        if (status) status.textContent = 'The 3D view is not available.'
        if (boot) boot.textContent = 'WebGL is not available. Use the buttons.'
        canvas.style.display = 'none'
        return
      }
      this.scene = new mod.ChillerScene(canvas, (id) => id && this.onExplorerSelect(id), mod.isLowPowerClient())
      this.scene.onInstrument = (id) => this.highlightPipe(id)
      this.bindPipeBoard(el)
      await this.scene.ready
      if (this.view !== 'explorer') return
      this.scene.setValve('chw', this.controller.chwValvePct)
      this.scene.setValve('cw', this.controller.cwValvePct)
      this.scene.setValve('gly', this.controller.glycolValvePct)
      this.scene.setFans(this.snap.dryFanPct, this.snap.towerFanPct)
      this.scene.setReadings(this.sceneReadings())
      if (this.selected) this.scene.select(this.selected)
      if (status) status.textContent = mod.isLowPowerClient() ? 'Low-detail 3D' : 'Turn the model. Select a part.'
      boot?.remove()
    } catch (e) {
      console.error(e)
      if (status) status.textContent = 'The 3D view failed.'
      if (boot) boot.textContent = 'The 3D view failed. Use the buttons.'
      canvas.style.display = 'none'
    }
  }

  private cycleHtml() {
    const node = CYCLE_NODES[this.cycleIndex]
    const pts = [
      [120, 80],
      [420, 80],
      [420, 240],
      [120, 240],
    ]
    return `
      <div class="view-head">
        <div>
          <h2>Refrigerant loop</h2>
          <p>Heat from the hall enters as warm CHWR. Follow compression and heat rejection.</p>
        </div>
        <span class="chip">Stage ${this.cycleIndex + 1}/${CYCLE_NODES.length}</span>
      </div>
      <div class="cycle-stage">
        <svg class="cycle-svg" viewBox="0 0 540 320" role="img">
          <defs>
            <linearGradient id="flowGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#2ee6d6"/>
              <stop offset="100%" stop-color="#ffb020"/>
            </linearGradient>
          </defs>
          <rect x="40" y="40" width="460" height="240" rx="28" fill="#0b1520" stroke="rgba(46,230,214,.15)"/>
          <path class="loop" d="M120,80 H420 V240 H120 Z"/>
          <path class="flow" d="M120,80 H420 V240 H120 Z"/>
          ${CYCLE_NODES.map((n, i) => {
            const [x, y] = pts[i]
            return `<g class="node ${i === this.cycleIndex ? 'active' : ''}" data-cycle="${i}">
              <circle cx="${x}" cy="${y}" r="34"/>
              <text x="${x}" y="${y - 4}" text-anchor="middle">${n.label}</text>
              <text class="sub" x="${x}" y="${y + 14}" text-anchor="middle">0${i + 1}</text>
            </g>`
          }).join('')}
        </svg>
      </div>
      <div class="card" style="margin-top:14px" ${infoAttr(cycleInfoId(node.id))}>
        <h3>${node.label}</h3>
        <p class="empty-state"><strong>${node.phase}</strong> — ${node.detail}</p>
        <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
          <button class="btn ghost" type="button" data-cycle-prev>Previous</button>
          <button class="btn" type="button" data-cycle-next>${this.cycleIndex === CYCLE_NODES.length - 1 ? 'Finish the loop' : 'Next stage'}</button>
        </div>
      </div>
    `
  }

  private bindCycle(el: Element) {
    el.querySelectorAll<SVGElement>('[data-cycle]').forEach((n) => {
      n.addEventListener('click', () => {
        this.cycleIndex = Number(n.getAttribute('data-cycle'))
        this.renderView()
      })
    })
    el.querySelector('[data-cycle-prev]')?.addEventListener('click', () => {
      this.cycleIndex = (this.cycleIndex - 1 + CYCLE_NODES.length) % CYCLE_NODES.length
      this.renderView()
    })
    el.querySelector('[data-cycle-next]')?.addEventListener('click', () => {
      if (this.cycleIndex === CYCLE_NODES.length - 1) {
        if (!this.progress.cycleComplete) {
          this.progress.cycleComplete = true
          this.progress = addXp(this.progress, 25)
          this.toast('You completed the refrigerant loop. You gain 25 XP.')
          this.persist()
        }
        return
      }
      this.cycleIndex += 1
      this.renderView()
    })
  }

  private operationHtml() {
    const steps = this.opMode === 'start' ? STARTUP_STEPS : SHUTDOWN_STEPS
    return `
      <div class="view-head">
        <div>
          <h2>MOP drill</h2>
          <p>The order is the ticket, then redundancy, then power, then water, and then the start. Use a soft stop only after the standby unit has the load.</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn ${this.opMode === 'start' ? '' : 'ghost'}" type="button" data-mode="start">Start steps</button>
          <button class="btn ${this.opMode === 'stop' ? 'amber' : 'ghost'}" type="button" data-mode="stop">Stop steps</button>
        </div>
      </div>
      <div class="steps">
        ${steps
          .map((s, i) => {
            const cls = i < this.opIndex ? 'done' : i === this.opIndex ? 'active' : ''
            return `<div class="step ${cls}" ${infoAttr(stepInfoId(this.opMode, s.id))}>
              <div class="step-num">${i < this.opIndex ? '✓' : i + 1}</div>
              <div><h4>${s.title}</h4><p>${s.body}</p></div>
              <button class="btn ghost" type="button" data-step="${i}" ${i !== this.opIndex ? 'disabled' : ''}>${i < this.opIndex ? 'Done' : 'Complete'}</button>
            </div>`
          })
          .join('')}
      </div>
    `
  }

  private bindOperation(el: Element) {
    el.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.opMode = btn.dataset.mode as 'start' | 'stop'
        this.opIndex = 0
        this.renderView()
      })
    })
    el.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const steps = this.opMode === 'start' ? STARTUP_STEPS : SHUTDOWN_STEPS
        if (Number(btn.dataset.step) !== this.opIndex) return
        this.opIndex += 1
        if (this.opIndex >= steps.length) {
          if (!this.progress.operationComplete) {
            this.progress.operationComplete = true
            this.progress = addXp(this.progress, 30)
            this.toast('You completed the MOP drill. You gain 30 XP.')
            this.persist()
          }
          this.opIndex = 0
        }
        this.renderView()
      })
    })
  }

  private optiviewHtml() {
    const s = this.snap
    return `
      <div class="view-head">
        <div>
          <h2>OptiView, CH-01</h2>
          <p>The panel uses the live plant simulation. Use the soft stop, the safety stop, the setpoint, and the MBC status.</p>
        </div>
        <span class="chip" id="opti-run-chip">${this.controller.running ? 'In operation' : 'Stopped'} · ${s.ch01.mbc}</span>
      </div>
      <div class="optiview">
        <div class="optiview-top">
          <span>YORK OptiView™ · CH-01 · DC Central Plant</span>
          <span id="opti-clock">${new Date().toLocaleTimeString()}</span>
        </div>
        <div class="optiview-tabs">
          <button type="button" data-otab="home" class="${this.optiTab === 'home' ? 'on' : ''}">Home</button>
          <button type="button" data-otab="mbc" class="${this.optiTab === 'mbc' ? 'on' : ''}">MBC</button>
          <button type="button" data-otab="alarms" class="${this.optiTab === 'alarms' ? 'on' : ''}">Messages</button>
        </div>
        <div class="optiview-body">
          <div class="opti-screen" id="opti-screen">${this.optiScreenHtml()}</div>
          <div class="opti-actions">
            <label style="font-size:.85rem;color:#86efac" ${infoAttr('slider-lchlt')}>LCHLT setpoint
              <input id="lchlt" type="range" min="42" max="65" step="0.5" value="${this.controller.lchltSet}" style="width:100%;margin-top:6px"/>
            </label>
            <button class="btn" type="button" data-opti="start" ${infoAttr('opti-start')} ${this.ch01StartHeld() ? 'disabled' : ''}>Start</button>
            <button class="btn amber" type="button" data-opti="soft" ${infoAttr('opti-soft')} ${!this.controller.running ? 'disabled' : ''}>Soft stop</button>
            <button class="btn rose" type="button" data-opti="safety" ${infoAttr('opti-safety')}>Safety stop</button>
            <button class="btn" type="button" data-opti="start-ch02" ${infoAttr('opti-ch02')} ${this.controller.unitRunning('CH-02') ? 'disabled' : ''}>Start CH-02</button>
            <button class="btn amber" type="button" data-opti="soft-ch02" ${infoAttr('opti-ch02')} ${!this.controller.unitRunning('CH-02') ? 'disabled' : ''}>Soft stop CH-02</button>
            <button class="btn rose" type="button" data-opti="safety-ch02" ${infoAttr('opti-ch02')}>Safety stop CH-02</button>
            <button class="btn ghost" type="button" data-opti="warn" ${infoAttr('opti-warn')}>Hall warning</button>
            <button class="btn ghost" type="button" data-opti="noc" ${infoAttr('opti-noc')}>Page the NOC</button>
            <button class="btn ghost" type="button" data-opti="done" ${infoAttr('opti-done')}>Mark the drill complete</button>
          </div>
        </div>
      </div>
    `
  }

  private optiScreenHtml() {
    const s = this.snap
    if (this.optiTab === 'mbc') {
      return `
        <div class="gauge-row">
          <div class="gauge" ${infoAttr('gauge-mbc')}><div class="label">MBC</div><div class="value" style="font-size:1.1rem;margin-top:8px">${s.ch01.mbc}</div></div>
          <div class="gauge" ${infoAttr('gauge-landings')}><div class="label">LANDINGS</div><div class="value">${this.controller.incident === 'landing' ? 1 : 0}</div></div>
          <div class="gauge" ${infoAttr('gauge-vibe')}><div class="label">1× VIBE</div><div class="value">${(0.12 + Math.sin(s.t) * 0.02).toFixed(2)}</div></div>
        </div>
        <div class="schematic">AXIAL  ·····●·····  gap normal
RADIAL X ····●····  centered
RADIAL Y ····●····  centered
TOUCHDOWN bearings: ${s.ch01.mbc === 'LANDED' ? 'ENGAGED' : 'CLEAR'}</div>
        <div class="message-log"><div class="${s.ch01.mbc === 'LANDED' ? 'alarm' : ''}">MBC status: ${s.ch01.mbc}</div></div>`
    }
    if (this.optiTab === 'alarms') {
      return `<div class="message-log">${this.controller.optiLogLines
        .slice()
        .reverse()
        .map((m) => `<div class="${m.kind ?? ''}">${m.text}</div>`)
        .join('')}${s.alarm ? `<div class="alarm">${s.alarm}</div>` : ''}</div>`
    }
    return `
      <div class="gauge-row">
        <div class="gauge" ${infoAttr('gauge-set')}><div class="label">LCHLT SET</div><div class="value" data-ov="set">${s.lchltSet.toFixed(1)}°F</div></div>
        <div class="gauge" ${infoAttr('gauge-act')}><div class="label">LCHLT ACT</div><div class="value" data-ov="act">${this.controller.running ? s.lchltAct.toFixed(1) : '58.2'}°F</div></div>
        <div class="gauge" ${infoAttr('gauge-rla')}><div class="label">% FLA</div><div class="value" data-ov="rla">${this.controller.running ? s.ch01.rla : 0}%</div></div>
      </div>
      <div class="gauge-row">
        <div class="gauge" ${infoAttr('gauge-evap')}><div class="label">EVAP</div><div class="value">${this.controller.running ? 36 : 48}<span style="font-size:.75rem"> psig</span></div></div>
        <div class="gauge" ${infoAttr('gauge-cond')}><div class="label">COND</div><div class="value" data-ov="cond">${s.ch01.condPsig}<span style="font-size:.75rem"> psig</span></div></div>
        <div class="gauge" ${infoAttr('gauge-hall')}><div class="label">HALL SA</div><div class="value" data-ov="hall">${s.hallSupplyF}°F</div></div>
      </div>
      <p data-ov="lchlt-target">${lchltHint(s)}</p>
      <div class="schematic">EVAP ══╗
       ║  COMP ▶ VSD ▶ MBC ${s.ch01.mbc}
COND ══╝     CHW → CRAH → HALL</div>
      <div class="message-log">${this.controller.optiLogLines
        .slice(-4)
        .reverse()
        .map((m) => `<div class="${m.kind ?? ''}">${m.text}</div>`)
        .join('')}</div>`
  }

  private patchOptiLive() {
    const screen = this.root.querySelector('#opti-screen')
    const clock = this.root.querySelector('#opti-clock')
    if (clock) clock.textContent = new Date().toLocaleTimeString()
    if (screen && this.optiTab === 'home') {
      const s = this.snap
      const set = (k: string, v: string) => {
        const n = screen.querySelector(`[data-ov="${k}"]`)
        if (n) n.textContent = v
      }
      set('set', `${s.lchltSet.toFixed(1)}°F`)
      set('act', `${this.controller.running ? s.lchltAct.toFixed(1) : '58.2'}°F`)
      set('rla', `${this.controller.running ? s.ch01.rla : 0}%`)
      set('cond', `${s.ch01.condPsig}`)
      set('hall', `${s.hallSupplyF}°F`)
      set('lchlt-target', lchltHint(s))
    }
    const chip = this.root.querySelector('#opti-run-chip')
    if (chip) chip.textContent = `${this.controller.running ? 'In operation' : 'Stopped'} · ${this.snap.ch01.mbc}`
    const start = this.root.querySelector<HTMLButtonElement>('[data-opti="start"]')
    const soft = this.root.querySelector<HTMLButtonElement>('[data-opti="soft"]')
    const start2 = this.root.querySelector<HTMLButtonElement>('[data-opti="start-ch02"]')
    const soft2 = this.root.querySelector<HTMLButtonElement>('[data-opti="soft-ch02"]')
    if (start) start.disabled = this.ch01StartHeld()
    if (soft) soft.disabled = !this.controller.running
    if (start2) start2.disabled = this.controller.unitRunning('CH-02')
    if (soft2) soft2.disabled = !this.controller.unitRunning('CH-02')
  }

  private bindOptiview(el: Element) {
    el.querySelectorAll<HTMLButtonElement>('[data-otab]').forEach((b) => {
      b.addEventListener('click', () => {
        this.optiTab = b.dataset.otab as typeof this.optiTab
        this.renderView()
      })
    })
    el.querySelector<HTMLInputElement>('#lchlt')?.addEventListener('input', (e) => {
      this.controller.setLchltSetpoint(Number((e.target as HTMLInputElement).value), 'user')
      this.snap = this.controller.snapshot
      this.patchOptiLive()
    })
    el.querySelectorAll<HTMLButtonElement>('[data-opti]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.opti
        if (a === 'start') this.commandStart('CH-01')
        else if (a === 'soft') this.confirmStop('CH-01', 'soft')
        else if (a === 'safety') this.confirmStop('CH-01', 'safety')
        else if (a === 'start-ch02') this.commandStart('CH-02')
        else if (a === 'soft-ch02') this.confirmStop('CH-02', 'soft')
        else if (a === 'safety-ch02') this.confirmStop('CH-02', 'safety')
        else if (a === 'warn') {
          this.controller.optiviewMessage('hall-warning', 'user')
          this.snap = this.controller.snapshot
          this.renderView()
        } else if (a === 'noc') {
          this.controller.optiviewMessage('page-noc', 'user')
          this.snap = this.controller.snapshot
          this.toast('The trainer sent a message to the NOC.')
          this.renderView()
        } else if (a === 'done') {
          if (!this.progress.optiviewComplete) {
            this.progress.optiviewComplete = true
            this.progress = addXp(this.progress, 25)
            this.toast('You completed the OptiView drill. You gain 25 XP.')
            this.persist()
          }
          this.renderView()
        }
      })
    })
  }

  private matchHtml() {
    return `
      <div class="view-head">
        <div><h2>Icon match</h2><p>Match each icon to a system. A complete board builds recognition.</p></div>
        <div class="scoreline">
          <span class="chip">${this.matchScore}/8</span>
          <span class="chip">Best ${this.progress.matchBest}/8</span>
          <button class="btn ghost" type="button" data-match-reset>Shuffle</button>
        </div>
      </div>
      <div class="match-board">
        <div class="match-col"><h3>Icons</h3><div class="match-tiles">
          ${this.matchIcons
            .map((p) => {
              const locked = this.matchLocked.has(p.id)
              return `<button type="button" class="match-tile ${locked ? 'locked correct' : ''} ${this.matchSelectedIcon === p.id ? 'selected' : ''}" data-icon="${p.id}" ${infoAttr('mission-match')} ${locked ? 'disabled' : ''}>
                <span class="card-icon" style="color:${COMPONENTS.find((c) => c.id === p.id)?.color}">${iconSvg(p.icon, 28)}</span>
                <span style="color:var(--muted);font-family:var(--mono);font-size:.78rem">${locked ? 'Matched' : 'Select'}</span>
              </button>`
            })
            .join('')}
        </div></div>
        <div class="match-col"><h3>Systems</h3><div class="match-tiles">
          ${this.matchLabels
            .map((p) => {
              const locked = this.matchLocked.has(p.id)
              return `<button type="button" class="match-tile ${locked ? 'locked correct' : ''}" data-label="${p.id}" ${infoAttr('mission-match')} ${locked ? 'disabled' : ''}><strong>${p.label}</strong></button>`
            })
            .join('')}
        </div></div>
      </div>`
  }

  private bindMatch(el: Element) {
    el.querySelector('[data-match-reset]')?.addEventListener('click', () => {
      this.matchIcons = shuffleChoices(MATCH_PAIRS)
      this.matchLabels = shuffleChoices(MATCH_PAIRS)
      this.matchSelectedIcon = null
      this.matchLocked = new Set()
      this.matchScore = 0
      this.renderView()
    })
    el.querySelectorAll<HTMLButtonElement>('[data-icon]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.matchSelectedIcon = btn.dataset.icon!
        this.renderView()
      })
    })
    el.querySelectorAll<HTMLButtonElement>('[data-label]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.matchSelectedIcon) {
          this.toast('Select an icon first.')
          return
        }
        const labelId = btn.dataset.label!
        if (labelId === this.matchSelectedIcon) {
          this.matchLocked.add(labelId)
          this.matchScore = this.matchLocked.size
          this.matchSelectedIcon = null
          if (this.matchScore > this.progress.matchBest) {
            this.progress.matchBest = this.matchScore
            this.persist()
          }
          if (this.matchScore === 8) {
            this.progress = addXp(this.progress, 40)
            this.toast('The board is complete. You gain 40 XP.')
            this.persist()
          }
          this.renderView()
        } else {
          btn.classList.add('wrong')
          this.toast('That match is not correct.')
          window.setTimeout(() => btn.classList.remove('wrong'), 400)
        }
      })
    })
  }

  private quizHtml() {
    if (this.quizIndex >= this.quizOrder.length) {
      return `<div class="view-head"><div><h2>Gate complete</h2><p>Your score is ${this.quizScore} of ${this.quizOrder.length}. The best score is ${Math.max(this.progress.quizBest, this.quizScore)}.</p></div></div>
        <div class="quiz-card" ${infoAttr('quiz-done')}><button class="btn" type="button" data-quiz-restart>Retry the questions</button></div>`
    }
    const q = this.quizOrder[this.quizIndex]
    const answered = this.quizAnswered && this.quizPick !== null
    const pick = this.quizPick
    const choices = q.choices
      .map((choice, i) => {
        const mark = !answered ? '' : i === q.answer ? 'correct' : i === pick ? 'wrong' : ''
        return `<button type="button" class="choice ${mark}" data-choice="${i}">${choice}</button>`
      })
      .join('')
    const feedback = answered
      ? `<div class="feedback">${pick === q.answer ? 'That answer is correct. ' : 'That answer is not correct. '}${q.explain}</div>`
      : ''
    return `
      <div class="view-head">
        <div><h2>Knowledge gate</h2><p>${q.topic} · ${this.quizIndex + 1}/${this.quizOrder.length}</p></div>
        <span class="chip">Score ${this.quizScore}</span>
      </div>
      <div class="quiz-card" ${answered ? infoAttr(quizInfoId(q.id)) : ''}>
        <h3 style="margin-top:0">${q.prompt}</h3>
        <div class="choices">${choices}</div>
        <div id="quiz-feedback">${feedback}</div>
        <div style="margin-top:14px"><button class="btn" type="button" data-quiz-next style="display:${answered ? 'inline-flex' : 'none'}">Next</button></div>
      </div>`
  }

  private bindQuiz(el: Element) {
    el.querySelector('[data-quiz-restart]')?.addEventListener('click', () => {
      this.quizOrder = shuffleChoices(QUIZ)
      this.quizIndex = 0
      this.quizScore = 0
      this.quizAnswered = false
      this.quizPick = null
      this.renderView()
    })
    if (this.quizIndex >= this.quizOrder.length) {
      if (this.quizScore > this.progress.quizBest) this.progress.quizBest = this.quizScore
      return
    }
    const q = this.quizOrder[this.quizIndex]
    const next = el.querySelector<HTMLButtonElement>('[data-quiz-next]')!
    el.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.quizAnswered) return
        const i = Number(btn.dataset.choice)
        this.quizAnswered = true
        this.quizPick = i
        if (i === q.answer) this.quizScore += 1
        this.renderView()
      })
    })
    next.addEventListener('click', () => {
      this.quizIndex += 1
      this.quizAnswered = false
      this.quizPick = null
      if (this.quizIndex >= this.quizOrder.length) {
        if (this.quizScore > this.progress.quizBest) this.progress.quizBest = this.quizScore
        this.progress = addXp(this.progress, this.quizScore * 5)
        this.persist()
        this.toast(`Knowledge gate score: ${this.quizScore} of ${QUIZ.length}.`)
      }
      this.renderView()
    })
  }

  private troubleAllSolved(): boolean {
    return this.progress.troubleSolved.length >= TROUBLE_CASES.length
  }

  private openTrouble() {
    if (this.troubleDoneView) {
      this.applyTroubleDestination({ kind: 'complete' })
      return
    }
    const item = TROUBLE_CASES[this.troubleIndex]
    if (item && this.troublePresentedId === item.id && this.troubleOptions.length > 0) {
      this.applyTroubleIncident()
      this.startTroubleClock()
      return
    }
    this.applyTroubleDestination(openTroubleView(this.troubleAllSolved(), this.troubleIndex))
  }

  private applyTroubleDestination(destination: TroubleDestination) {
    switch (destination.kind) {
      case 'complete':
        this.troubleDoneView = true
        this.troublePicked = null
        if (this.troubleTimer) {
          clearInterval(this.troubleTimer)
          this.troubleTimer = null
        }
        return
      case 'case':
        this.presentTroubleCase(destination.index)
        return
      default: {
        const unknown: never = destination
        return unknown
      }
    }
  }

  private presentTroubleCase(index: number) {
    const item = TROUBLE_CASES[index]
    this.troubleDoneView = false
    this.troubleIndex = index
    this.troublePicked = null
    this.troublePresentedId = item?.id ?? null
    this.troubleOptions = item ? shuffleChoices(item.options) : []
    this.startTroubleClock()
    this.applyTroubleIncident()
  }

  private moveTrouble(direction: 'next' | 'prev') {
    const destination = troubleStep(
      this.troubleIndex,
      TROUBLE_CASES.length,
      direction,
      this.troubleAllSolved(),
    )
    if (destination.kind === 'case' && destination.index === this.troubleIndex) return
    this.applyTroubleDestination(destination)
    this.renderView()
  }

  private startTroubleClock() {
    this.troubleSeconds = 45
    if (this.troubleTimer) clearInterval(this.troubleTimer)
    this.troubleTimer = window.setInterval(() => {
      if (this.view !== 'trouble' || this.troubleDoneView || this.troublePicked !== null) return
      this.troubleSeconds -= 1
      const el = this.root.querySelector('#incident-timer')
      if (el) {
        el.textContent = `${Math.max(0, this.troubleSeconds)}s`
        el.classList.toggle('critical', this.troubleSeconds <= 12)
      }
      if (this.troubleSeconds <= 0) {
        this.toast('The NOC timer expired. Select an answer.')
        if (this.troubleTimer) clearInterval(this.troubleTimer)
      }
    }, 1000)
  }

  private alignTroubleToIncident() {
    const incident = this.controller.incident
    if (!incident) return
    const index = TROUBLE_CASES.findIndex((item) => isTroubleCaseId(item.id) && troubleIncident(item.id).kind === incident)
    if (index >= 0 && index !== this.troubleIndex) {
      this.troubleIndex = index
      this.troublePicked = null
    }
  }

  private troubleCompleteHtml() {
    const total = TROUBLE_CASES.length
    return `
      <div class="view-head">
        <div>
          <h2>Gate complete</h2>
          <p>You cleared all ${total} incidents. The Incident clock drill stays Done.</p>
        </div>
        <span class="chip">${this.progress.troubleSolved.length} of ${total}</span>
      </div>
      <div class="trouble-card">
        <h3 style="margin-top:0">All incidents cleared</h3>
        <p>This set is complete. Select Practice again for a new order. Practice does not add XP.</p>
        <div style="margin-top:14px"><button class="btn" type="button" data-tr-practice>Practice again</button></div>
      </div>`
  }

  private troubleHtml() {
    if (this.troubleDoneView) return this.troubleCompleteHtml()
    const t = TROUBLE_CASES[this.troubleIndex]
    const options = this.troubleOptions
    const picked = this.troublePicked
    const pickedOption = picked !== null ? options[picked] : undefined
    return `
      <div class="view-head">
        <div>
          <h2>Incident clock</h2>
          <p>This is scenario ${this.troubleIndex + 1} of ${TROUBLE_CASES.length}. The live board follows this scenario. Select the first safe action before the timer ends.</p>
        </div>
        <div class="scoreline">
          <span class="timer ${this.troubleSeconds <= 12 ? 'critical' : ''}" id="incident-timer">${this.troubleSeconds}s</span>
          <span class="chip">${this.progress.troubleSolved.length} of ${TROUBLE_CASES.length}</span>
          <button class="btn ghost" type="button" data-tr-prev>Previous</button>
          <button class="btn ghost" type="button" data-tr-next>Next</button>
        </div>
      </div>
      <div class="alarm-banner show">${this.snap.alarm ?? t.title}</div>
      <div class="kpi-strip">${this.kpiHtml(this.snap)}</div>
      <div class="trouble-card" ${picked !== null ? infoAttr(troubleInfoId(t.id)) : ''}>
        <h3 style="margin-top:0">${t.title}</h3>
        <ul>${t.symptoms.map((s) => `<li>${s}</li>`).join('')}</ul>
        <div class="choices">
          ${options
            .map(
              (o, i) =>
                `<button type="button" class="choice ${picked === i ? (o.correct ? 'correct' : 'wrong') : ''}" data-tr="${i}">${o.text}</button>`,
            )
            .join('')}
        </div>
        ${
          pickedOption
            ? `<div class="feedback">${pickedOption.feedback}<br/><br/><strong>Key point:</strong> ${t.teach}</div>`
            : ''
        }
      </div>`
  }

  private bindTrouble(el: Element) {
    el.querySelector('[data-tr-practice]')?.addEventListener('click', () => {
      this.presentTroubleCase(0)
      this.renderView()
    })
    if (this.troubleDoneView) return
    el.querySelector('[data-tr-prev]')?.addEventListener('click', () => {
      this.moveTrouble('prev')
    })
    el.querySelector('[data-tr-next]')?.addEventListener('click', () => {
      this.moveTrouble('next')
    })
    const t = TROUBLE_CASES[this.troubleIndex]
    el.querySelectorAll<HTMLButtonElement>('[data-tr]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.tr)
        const option = this.troubleOptions[i]
        if (!option) return
        this.troublePicked = i
        if (option.correct && !this.progress.troubleSolved.includes(t.id)) {
          const bonus = this.troubleSeconds > 20 ? 30 : 20
          this.progress.troubleSolved.push(t.id)
          this.progress = addXp(this.progress, bonus)
          this.toast(`You cleared the incident. You gain ${bonus} XP.`)
          this.persist()
        }
        this.renderView()
      })
    })
  }

  private maintenanceHtml() {
    const items = MAINT_ITEMS
    const done = items.every((i) => this.maintChecks.has(i.id))
    return `
      <div class="view-head">
        <div><h2>Shift deck</h2><p>Select each item to record that you saw it.</p></div>
        <span class="chip">${this.maintChecks.size}/${items.length}</span>
      </div>
      <div class="maint-grid">
        ${items
          .map(
            (i) => `
          <button type="button" class="maint-item ${this.maintChecks.has(i.id) ? 'on' : ''}" data-maint="${i.id}" ${infoAttr(maintInfoId(i.id))}>
            <div class="when">${i.when}</div>
            <div style="margin-top:6px;font-weight:600">${i.text}</div>
          </button>`,
          )
          .join('')}
      </div>
      ${done ? `<div class="feedback" style="margin-top:16px">The deck is complete. Live work still follows the site MOP.</div>` : ''}`
  }

  private bindMaintenance(el: Element) {
    el.querySelectorAll<HTMLButtonElement>('[data-maint]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.maint!
        if (this.maintChecks.has(id)) this.maintChecks.delete(id)
        else this.maintChecks.add(id)
        if (this.maintChecks.size === MAINT_ITEMS.length && !this.progress.maintenanceComplete) {
          this.progress.maintenanceComplete = true
          this.progress = addXp(this.progress, 25)
          this.toast('You completed the shift deck. You gain 25 XP.')
          this.persist()
        }
        this.renderView()
      })
    })
  }

  private plantControlsHtml() {
    const center = this.controller.itLoadCenterMw
    const runningMw = this.snap.runningCapacityMw
    return `
      <section class="card plant-controls" id="plant-controls" ${infoAttr('plant-controls')}>
        <h3>Plant controls</h3>
        <p class="empty-state">This board operates CH-01 and CH-02. Capacity is the sum of the running units. Each unit capacity is a trainer value of 5 MW.</p>
        <label ${infoAttr('slider-it-load')}>IT load target <output id="it-load-out">${center.toFixed(1)} MW</output>
          <input id="it-load" type="range" min="2" max="8" step="0.1" value="${center}" />
        </label>
        <p class="empty-state" id="it-load-note">Trainer value. The live load moves a small amount around this target.</p>
        <p id="capacity-read">Running capacity ${runningMw.toFixed(1)} MW.</p>
        <p id="weather-target">Trainer LCHLT target is ${this.snap.lchltTargetF.toFixed(0)}°F for this dry-bulb.</p>
        ${this.unitRowHtml('CH-01')}
        ${this.unitRowHtml('CH-02')}
        <div class="clock-row">
          <button class="btn ghost" type="button" data-clock="toggle" id="clock-toggle">${this.controller.paused ? 'Resume' : 'Pause'}</button>
          <button class="btn ghost ${this.controller.timeScale === 1 && !this.controller.paused ? 'on' : ''}" type="button" data-scale="1">1×</button>
          <button class="btn ghost ${this.controller.timeScale === 2 && !this.controller.paused ? 'on' : ''}" type="button" data-scale="2">2×</button>
          <button class="btn ghost ${this.controller.timeScale === 5 && !this.controller.paused ? 'on' : ''}" type="button" data-scale="5">5×</button>
          <button class="btn ghost" type="button" data-undo ${this.controller.canUndo ? '' : 'disabled'}>Undo the last change</button>
          <span id="sim-time">Sim time ${Math.round(this.snap.t)} s</span>
        </div>
      </section>`
  }

  private unitRowHtml(id: 'CH-01' | 'CH-02') {
    const running = this.controller.unitRunning(id)
    return `
      <div class="unit-row" data-unit="${id}">
        <strong>${id}</strong>
        <span data-unit-state>${running ? 'In operation' : 'Standby'}</span>
        <button class="btn" type="button" data-ch-start="${id}" ${running || this.ch01StartHeld(id) ? 'disabled' : ''}>Start</button>
        <button class="btn amber" type="button" data-ch-soft="${id}" ${running ? '' : 'disabled'}>Soft stop</button>
        <button class="btn rose" type="button" data-ch-safety="${id}">Safety stop</button>
      </div>`
  }

  private bindPlantControls(el: Element) {
    const input = el.querySelector<HTMLInputElement>('#it-load')
    const out = el.querySelector('#it-load-out')
    input?.addEventListener('input', () => {
      const targetMw = Number(input.value)
      if (out) out.textContent = `${targetMw.toFixed(1)} MW`
      this.controller.setItLoad({ targetMw }, 'user')
      this.snap = this.controller.snapshot
      this.patchLiveBoard()
    })
    el.querySelectorAll<HTMLButtonElement>('[data-ch-start]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.chStart
        if (id) this.commandStart(id)
      })
    })
    el.querySelectorAll<HTMLButtonElement>('[data-ch-soft]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.chSoft
        if (id) this.confirmStop(id, 'soft')
      })
    })
    el.querySelectorAll<HTMLButtonElement>('[data-ch-safety]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.chSafety
        if (id) this.confirmStop(id, 'safety')
      })
    })
    el.querySelector('#clock-toggle')?.addEventListener('click', () => {
      this.controller.setClock({ paused: !this.controller.paused }, 'user')
      this.snap = this.controller.snapshot
      this.patchPlantControls()
    })
    el.querySelectorAll<HTMLButtonElement>('[data-scale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const scale = Number(btn.dataset.scale)
        if (scale === 1 || scale === 2 || scale === 5) {
          this.controller.setClock({ paused: false, scale }, 'user')
          this.snap = this.controller.snapshot
          this.patchPlantControls()
        }
      })
    })
    el.querySelector('[data-undo]')?.addEventListener('click', () => {
      const result = this.controller.undo('user')
      this.snap = result.snapshot
      if (!result.ok) this.toast(result.message)
      this.patchLiveBoard()
    })
  }

  private patchPlantControls() {
    const root = this.root.querySelector('#plant-controls')
    if (!root) return
    this.patchItSlider(root)
    this.patchUnitRows(root)
    this.patchClockRow(root)
  }

  private patchItSlider(root: Element) {
    const center = this.controller.itLoadCenterMw
    this.setControlText(root, 'it-load-out', `${center.toFixed(1)} MW`)
    this.setControlText(root, 'capacity-read', `Running capacity ${this.snap.runningCapacityMw.toFixed(1)} MW.`)
    this.setControlText(root, 'weather-target', `Trainer LCHLT target is ${this.snap.lchltTargetF.toFixed(0)}°F for this dry-bulb.`)
    const slider = root.querySelector<HTMLInputElement>('#it-load')
    if (slider && document.activeElement !== slider) slider.value = String(center)
  }

  private patchUnitRows(root: Element) {
    for (const id of ['CH-01', 'CH-02']) this.patchUnitRow(root, id)
  }

  private patchUnitRow(root: Element, id: string) {
    const row = root.querySelector(`[data-unit="${id}"]`)
    if (!row) return
    const running = this.controller.unitRunning(id)
    const state = row.querySelector('[data-unit-state]')
    if (state) state.textContent = running ? 'In operation' : 'Standby'
    const start = row.querySelector<HTMLButtonElement>('[data-ch-start]')
    const soft = row.querySelector<HTMLButtonElement>('[data-ch-soft]')
    if (start) start.disabled = running || this.ch01StartHeld(id)
    if (soft) soft.disabled = !running
  }

  private patchClockRow(root: Element) {
    this.setControlText(root, 'sim-time', `Sim time ${Math.round(this.snap.t)} s`)
    const clock = root.querySelector('#clock-toggle')
    if (clock) clock.textContent = this.controller.paused ? 'Resume' : 'Pause'
    this.markTimeScale(root, 1)
    this.markTimeScale(root, 2)
    this.markTimeScale(root, 5)
    const undo = root.querySelector<HTMLButtonElement>('[data-undo]')
    if (undo) undo.disabled = !this.controller.canUndo
  }

  private markTimeScale(root: Element, scale: 1 | 2 | 5) {
    const on = this.controller.timeScale === scale && !this.controller.paused
    root.querySelector(`[data-scale="${scale}"]`)?.classList.toggle('on', on)
  }

  private setControlText(root: Element, id: string, text: string) {
    const el = root.querySelector(`#${id}`)
    if (el) el.textContent = text
  }

  /** Landing and failover keep CH-01 stopped. The Start button stays disabled. */
  private ch01StartHeld(unitId = 'CH-01'): boolean {
    if (unitId !== 'CH-01') return this.controller.unitRunning(unitId)
    const incident = this.controller.incident
    return this.controller.running || incident === 'landing' || incident === 'failover'
  }

  private commandStart(unitId: string) {
    const result = this.controller.startChiller(unitId, 'user')
    this.snap = result.snapshot
    if (!result.ok) this.toast(result.message)
    this.refreshAfterCommand()
  }

  private confirmStop(unitId: string, mode: 'soft' | 'safety') {
    if (!this.controller.unitRunning(unitId)) {
      this.toast(`${unitId} is already in standby.`)
      return
    }
    const copy =
      mode === 'soft'
        ? `Do a soft stop on ${unitId}? The hall can get hot if no other chiller is in operation.`
        : `Do a safety stop on ${unitId}? This stop takes the unit offline now.`
    this.askConfirm(copy, 'Do the stop', () => {
      const result = this.controller.stopChiller(unitId, mode, 'user')
      this.snap = result.snapshot
      if (!result.ok) this.toast(result.message)
      this.refreshAfterCommand()
    })
  }

  private refreshAfterCommand() {
    if (this.view === 'home') this.patchLiveBoard()
    else if (this.view === 'optiview') this.renderView()
    else if (this.view === 'explorer') this.patchPipeBoard()
  }

  private onPlantChange() {
    if (this.view === 'home') this.patchLiveBoard()
    else if (this.view === 'optiview') this.patchOptiLive()
    else if (this.view === 'explorer') this.patchPipeBoard()
  }

  private applyTroubleIncident() {
    const id = TROUBLE_CASES[this.troubleIndex]?.id
    if (!id || !isTroubleCaseId(id)) return
    const mapped = troubleIncident(id)
    this.controller.injectIncident(mapped.kind, 'user', { forceUnitOff: mapped.forceUnitOff })
    this.snap = this.controller.snapshot
  }

  private bindConfirm() {
    this.root.querySelector('#confirm-yes')?.addEventListener('click', () => {
      const action = this.pendingConfirm
      this.closeConfirm()
      action?.()
    })
    this.root.querySelector('#confirm-no')?.addEventListener('click', () => this.closeConfirm())
    this.root.querySelector('#confirm-card')?.addEventListener('keydown', (event) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') this.closeConfirm()
    })
  }

  private askConfirm(copy: string, yesLabel: string, onYes: () => void) {
    const card = this.root.querySelector<HTMLElement>('#confirm-card')
    const text = this.root.querySelector('#confirm-copy')
    const yes = this.root.querySelector('#confirm-yes')
    if (!card || !text || !yes) return
    text.textContent = copy
    yes.textContent = yesLabel
    this.pendingConfirm = onYes
    card.hidden = false
    this.root.querySelector<HTMLButtonElement>('#confirm-no')?.focus()
  }

  private closeConfirm() {
    const card = this.root.querySelector<HTMLElement>('#confirm-card')
    if (card) card.hidden = true
    this.pendingConfirm = null
  }
}
