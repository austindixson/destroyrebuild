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
import { addXp, loadProgress, masteryPercent, saveProgress, type ProgressState } from './progress'
import { PlantSim, rankFor, type PlantSnapshot } from './sim/plantSim'
import { iconSvg } from './ui/icons'
import { linkGlossary } from './ui/glossary'
import { InfoDock } from './ui/info'

const NAV: { id: ViewId; label: string; icon: string }[] = [
  { id: 'home', label: 'Live Plant', icon: 'home' },
  { id: 'plant', label: 'Cooling Chain', icon: 'cycle' },
  { id: 'explorer', label: '3D Plant Room', icon: 'explore' },
  { id: 'cycle', label: 'Refrigerant Loop', icon: 'cycle' },
  { id: 'operation', label: 'MOP Drill', icon: 'operate' },
  { id: 'optiview', label: 'OptiView', icon: 'panel' },
  { id: 'match', label: 'Icon Match', icon: 'match' },
  { id: 'quiz', label: 'Knowledge Gate', icon: 'quiz' },
  { id: 'trouble', label: 'Incident Clock', icon: 'trouble' },
  { id: 'maintenance', label: 'Shift Deck', icon: 'wrench' },
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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export class App {
  private root: HTMLElement
  private view: ViewId = 'home'
  private progress: ProgressState = loadProgress()
  private scene: ChillerScene | null = null
  private selected: ComponentId | null = null
  private toastEl!: HTMLDivElement
  private sim = new PlantSim()
  private snap: PlantSnapshot = this.sim.tick()
  private raf = 0
  private lastUi = 0
  private lastInfo = 0
  private info: InfoDock

  private opMode: 'start' | 'stop' = 'start'
  private opIndex = 0
  private cycleIndex = 0
  private plantIndex = 0
  private matchIcons = shuffle(MATCH_PAIRS)
  private matchLabels = shuffle(MATCH_PAIRS)
  private matchSelectedIcon: string | null = null
  private matchLocked = new Set<string>()
  private matchScore = 0
  private quizOrder = shuffle(QUIZ)
  private quizIndex = 0
  private quizScore = 0
  private quizAnswered = false
  private troubleIndex = 0
  private troublePicked: number | null = null
  private troubleSeconds = 45
  private troubleTimer: number | null = null
  private maintChecks = new Set<string>()
  private optiTab: 'home' | 'mbc' | 'alarms' = 'home'
  private running = true
  private optiLog: { text: string; kind?: string }[] = [
    { text: 'CH-01 online · BMS link simulated' },
    { text: 'NOC watch desk — trainer mode', kind: 'warn' },
  ]

  constructor(root: HTMLElement) {
    this.root = root
    this.sim.ch01Running = true
    this.info = new InfoDock(document.body, this.root, () => ({
      snap: this.snap,
      running: this.running,
      landing: this.sim.incident === 'landing',
    }))
    this.render()
    this.loop()
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop)
    this.snap = this.sim.tick()
    const now = performance.now()
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
    this.view = view
    if (view === 'trouble') this.startTroubleClock()
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
      this.toast(`System unlocked · ${COMPONENTS.find((c) => c.id === id)?.short} (+8 XP)`)
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
            <h1>Plant Trainer</h1>
            <p>Mission-critical CHW · DC</p>
          </div>
        </div>
        <div class="dc-badge">LIVE SIM · DATA CENTER</div>
        <div class="rank-card">
          <div class="tier">RANK T${rank.tier}</div>
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
        <p class="nav-note">Train like the hall is live. Themes from YORK YMC² O&amp;M + N+1 / MOP / NOC discipline.</p>
      </aside>
      <main class="main" id="view"></main>
      <div class="toast" id="toast"></div>
    `
    this.toastEl = this.root.querySelector('#toast')!
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
      { id: 'plant', title: 'Cooling chain', desc: 'IT → CHW water → YMC² → tower water + glycol dry cooler', done: this.progress.plantComplete },
      { id: 'explorer', title: '3D walkdown', desc: 'Click every assembly in the plant room', done: this.progress.explored.length >= 8 },
      { id: 'cycle', title: 'Refrigerant loop', desc: 'Animated vapor-compression tour', done: this.progress.cycleComplete },
      { id: 'operation', title: 'MOP start/stop', desc: 'Redundancy before you touch production', done: this.progress.operationComplete },
      { id: 'optiview', title: 'OptiView board', desc: 'Drive CH-01 like a live panel', done: this.progress.optiviewComplete },
      { id: 'match', title: 'Icon match', desc: 'Instant system recognition', done: this.progress.matchBest >= 8 },
      { id: 'quiz', title: 'Knowledge gate', desc: 'Ten DC + O&M questions', done: this.progress.quizBest >= 8 },
      { id: 'trouble', title: 'Incident clock', desc: 'Decide under a ticking NOC timer', done: this.progress.troubleSolved.length >= 5 },
      { id: 'maintenance', title: 'Shift deck', desc: '24/7 check awareness', done: this.progress.maintenanceComplete },
    ]
    return `
      <div class="view-head">
        <div>
          <h2>Central plant · live board</h2>
          <p>This isn’t flashcards. Watch IT heat move through the plant, stress the weather, throw incidents, then train the muscle memory.</p>
        </div>
        <div class="weather-seg" ${infoAttr('weather-preset')}>
          <button type="button" data-oat="40" class="${s.oatF <= 50 ? 'on' : ''}">40°F economizer</button>
          <button type="button" data-oat="75" class="${s.oatF > 50 && s.oatF < 90 ? 'on' : ''}">75°F mild</button>
          <button type="button" data-oat="100" class="${s.oatF >= 90 ? 'on' : ''}">100°F hot</button>
        </div>
      </div>
      <div class="alarm-banner ${s.alarm ? 'show' : ''}" id="alarm-banner">${s.alarm ?? ''}</div>
      <div class="kpi-strip" id="kpi-strip">${this.kpiHtml(s)}</div>
      <div class="mimic">
        <div class="mimic-flow"><i></i></div>
        <div class="mimic-grid">
          ${this.mimicNode('it', '01', 'IT Load', `${s.itLoadMw} MW compute heat`, 'quiz', 'mimic-it')}
          ${this.mimicNode('crah', '02', 'CRAH / CDU', `SA ${s.hallSupplyF}°F · RA ${s.hallReturnF}°F`, 'plant', 'mimic-crah')}
          ${this.mimicNode('chw', '03', 'CHW Loop', `DP ${s.chwDpPsi} psi`, 'plant', 'mimic-chw')}
          ${this.mimicNode('ch1', '04', 'CH-01 YMC²', `${s.ch01.mode.toUpperCase()} · ${s.ch01.rla}% RLA`, 'explorer', 'mimic-chiller', s.ch01.mode === 'alarm')}
          ${this.mimicNode('tower', '05', 'Tower + dry cooler', `WB ${s.wbF}°F · OAT ${s.oatF}°F · glycol ${s.freeCoolPct}%`, 'cycle', 'mimic-tower')}
          ${this.mimicNode('noc', '06', 'NOC / BMS', s.alarm ? 'ESCALATED' : 'Watch desk green', 'trouble', 'mimic-noc', Boolean(s.alarm))}
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
                <span class="status">${m.done ? 'DONE' : 'OPEN'}</span>
              </button>`,
              )
              .join('')}
          </div>
        </div>
        <div class="card" ${infoAttr('chaos-board')}>
          <h3>Inject chaos</h3>
          <p class="empty-state" style="margin-bottom:12px">Stress the live board, then jump into Incident Clock with the same failure mode.</p>
          <div style="display:grid;gap:8px">
            <button class="btn amber" type="button" data-incident="high-head" ${infoAttr('chaos-high-head')}>Peak weather · high head</button>
            <button class="btn amber" type="button" data-incident="hall-hot" ${infoAttr('chaos-hall-hot')}>Hall hot · chiller idle</button>
            <button class="btn rose" type="button" data-incident="landing" ${infoAttr('chaos-landing')}>ATS landing event</button>
            <button class="btn rose" type="button" data-incident="failover" ${infoAttr('chaos-failover')}>Lead trip · failover</button>
            <button class="btn ghost" type="button" data-incident="clear" ${infoAttr('chaos-clear')}>Clear incident</button>
            <button class="btn" type="button" data-go="trouble">Open Incident Clock →</button>
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
      <div class="kpi ${hallBad ? 'bad' : 'ok'}" ${infoAttr('kpi-hall')}><div class="label">HALL SUPPLY</div><div class="val" data-k="hall">${s.hallSupplyF}°F</div></div>
      <div class="kpi" ${infoAttr('kpi-lchlt')}><div class="label">LCHLT</div><div class="val" data-k="lchlt">${s.lchltAct}°F</div></div>
      <div class="kpi" ${infoAttr('kpi-it')}><div class="label">IT LOAD</div><div class="val" data-k="it">${s.itLoadMw} MW</div></div>
      <div class="kpi ${headBad ? 'warn' : ''}" ${infoAttr('kpi-head')}><div class="label">CH-01 HEAD</div><div class="val" data-k="head">${s.ch01.condPsig} psig</div></div>
      <div class="kpi" ${infoAttr('kpi-outdoor')}><div class="label">OUTDOOR</div><div class="val" data-k="cwet">${s.oatF}°F</div></div>
      <div class="kpi ${s.ch01.mode === 'alarm' ? 'bad' : 'ok'}" ${infoAttr('kpi-ch01')}><div class="label">CH-01</div><div class="val" data-k="ch1">${s.ch01.rla}%</div></div>
    `
  }

  private patchLiveBoard() {
    const s = this.snap
    const banner = this.root.querySelector('#alarm-banner')
    if (banner) {
      banner.classList.toggle('show', Boolean(s.alarm))
      this.relinkText(banner, s.alarm ?? '')
    }
    const strip = this.root.querySelector('#kpi-strip')
    if (strip) {
      const active = document.activeElement
      const focusedInfo =
        active instanceof HTMLButtonElement && active.classList.contains('info-btn') && strip.contains(active)
          ? active.dataset.infoBtn
          : undefined
      const focusedGlossary =
        active instanceof HTMLButtonElement && active.classList.contains('jargon') && strip.contains(active)
          ? active.dataset.glossary
          : undefined
      const focusedHost =
        active instanceof HTMLButtonElement && strip.contains(active)
          ? active.closest<HTMLElement>('.kpi')?.dataset.info
          : undefined
      strip.innerHTML = this.kpiHtml(s)
      this.info.mount(strip)
      if (focusedInfo) {
        strip.querySelector<HTMLButtonElement>(`.info-btn[data-info-btn="${CSS.escape(focusedInfo)}"]`)?.focus()
      } else if (focusedGlossary && focusedHost) {
        strip
          .querySelector<HTMLButtonElement>(
            `.kpi[data-info="${CSS.escape(focusedHost)}"] button.jargon[data-glossary="${CSS.escape(focusedGlossary)}"]`,
          )
          ?.focus()
      }
    }
    const bodies: Record<string, string> = {
      it: `${s.itLoadMw} MW compute heat`,
      crah: `SA ${s.hallSupplyF}°F · RA ${s.hallReturnF}°F`,
      chw: `DP ${s.chwDpPsi} psi`,
      ch1: `${s.ch01.mode.toUpperCase()} · ${s.ch01.rla}% RLA`,
      tower: `WB ${s.wbF}°F · OAT ${s.oatF}°F · glycol ${s.freeCoolPct}%`,
      noc: s.alarm ? 'ESCALATED' : 'Watch desk green',
    }
    for (const [id, text] of Object.entries(bodies)) {
      const el = this.root.querySelector(`[data-mimic-body="${id}"]`)
      if (el) el.textContent = text
    }
    const reason = this.root.querySelector('#plant-reason')
    if (reason) this.relinkText(reason, s.reason)
    this.root.querySelectorAll('.mimic-node').forEach((n) => {
      const id = (n as HTMLElement).dataset.mimic
      n.classList.toggle('alarm', (id === 'ch1' && s.ch01.mode === 'alarm') || (id === 'noc' && Boolean(s.alarm)))
    })
  }

  private bindHome(el: Element) {
    el.querySelectorAll<HTMLElement>('[data-go]').forEach((n) => {
      n.addEventListener('click', () => this.setView(n.dataset.go as ViewId))
    })
    el.querySelectorAll<HTMLButtonElement>('[data-oat]').forEach((b) => {
      b.addEventListener('click', () => {
        this.sim.setOutdoor(Number(b.dataset.oat))
        this.snap = this.sim.tick()
        this.renderView()
      })
    })
    el.querySelectorAll<HTMLButtonElement>('[data-incident]').forEach((b) => {
      b.addEventListener('click', () => {
        const v = b.dataset.incident!
        if (v === 'clear') {
          this.sim.incident = null
          this.sim.ch01Running = true
          this.sim.ch02Running = false
          this.toast('Plant stabilized')
        } else {
          this.sim.incident = v as typeof this.sim.incident
          if (v === 'failover') this.sim.ch02Running = false
          this.toast('Incident injected — board is live')
        }
        this.snap = this.sim.tick()
        this.patchLiveBoard()
      })
    })
  }

  private plantHtml() {
    const node = PLANT_NODES[this.plantIndex]
    return `
      <div class="view-head">
        <div>
          <h2>Cooling chain</h2>
          <p>Where the YMC² sits in a mission-critical plant. Know upstream and downstream before you touch setpoints.</p>
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
          <button class="btn" type="button" data-plant-next>${this.plantIndex === PLANT_NODES.length - 1 ? 'Clear chain' : 'Next link'}</button>
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
          this.toast('Cooling chain cleared (+25 XP)')
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
      return `<span class="tag">READY</span><h3>Pick a system</h3><p class="empty-state">Use the rail (best on phones) or tap the model. Mag bearings glow rose; OptiView is mint.</p><div class="tip">Clear all eight for walkdown credit.</div>`
    }
    return `<span class="tag">${info.short}</span><h3>${info.name}</h3><p class="empty-state">${info.summary}</p><ul>${info.details.map((d) => `<li>${d}</li>`).join('')}</ul><div class="tip"><strong>Operator tip:</strong> ${info.operatorTip}</div>`
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
    if (chip) chip.textContent = `${this.progress.explored.length}/8 explored`
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
          <p>Teal pipes are chilled water to the hall. Gold pipes are condenser water to the tower. Violet pipes are glycol to the dry cooler.</p>
        </div>
        <span class="chip" id="explore-chip">${this.progress.explored.length}/8 explored</span>
      </div>
      <div class="hero-panel">
        <div class="canvas-wrap">
          <div class="canvas-hud">
            <span class="pill">CH-01 · N+1</span>
            <span class="pill" id="canvas-status">Loading 3D…</span>
          </div>
          <div class="canvas-boot" id="canvas-boot">Spinning up plant model…</div>
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
        <label ${infoAttr(pipeSliderInfo(line))}>Balancing valve <output id="${line}-valve-out">${valve}%</output>
          <input id="${line}-valve" type="range" min="15" max="100" step="1" value="${valve}" />
        </label>
        <p class="dp-read" id="${line}-dp-read">ΔP —</p>
        <p class="gain-read" id="${line}-gain">—</p>
      </article>`
    return `
      <section class="pipe-board" id="pipe-board">
        <div class="pipe-head">
          <h3>Field instruments</h3>
          <label class="oat-row" ${infoAttr('slider-oat')}>Outdoor dry bulb <output id="oat-out">${s.oatF}°F</output>
            <input id="oat" type="range" min="20" max="110" step="1" value="${s.oatF}" />
          </label>
          <p id="pipe-note">${s.reason}</p>
        </div>
        <div class="pipe-grid">
          ${card('chw', 'Chilled water · hall', 'CHWR', 'CHWS', s.chwValvePct)}
          ${card('cw', 'Condenser water · tower', 'CWS', 'CWR', s.cwValvePct)}
          ${card('gly', 'Glycol · dry cooler', 'GLS', 'GLR', s.glycolValvePct)}
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
        this.sim.setHeaderValve(loop, pct)
        this.scene?.setValve(loop, pct)
        this.snap = this.sim.tick()
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
      this.sim.setOutdoor(f)
      this.snap = this.sim.tick()
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
      gly.textContent = `ΔP ${s.glycolDpPsi.toFixed(1)} psi · free cool ${s.freeCoolPct}%`
      gly.classList.toggle('bad', s.oatF <= 48 && s.glycolDpPsi < 8)
    }
    set('chw-gain', `${s.chwGain.toFixed(1)} psi per 10% stem`)
    set('cw-gain', `${s.cwHeadGain.toFixed(1)} psi of head per 10% · WB ${s.wbF}°F`)
    set('gly-gain', `${s.glycolGain.toFixed(1)} psi per 10% · dry fans ${s.dryFanPct}%`)
    const note = this.root.querySelector('#pipe-note')
    if (note) {
      const warn =
        s.chwDpPsi < 12
          ? 'CHW ΔP is low. Open the chilled-water valve before the hall warms. '
          : s.chwDpPsi > 24
            ? 'CHW ΔP is high. Ease that valve back. '
            : ''
      this.relinkText(note, warn + s.reason)
    }
    this.scene?.setFans(s.dryFanPct, s.towerFanPct)
    this.scene?.setReadings(this.sceneReadings())
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
        if (status) status.textContent = '3D unavailable'
        if (boot) boot.textContent = 'WebGL unavailable — use buttons.'
        canvas.style.display = 'none'
        return
      }
      this.scene = new mod.ChillerScene(canvas, (id) => id && this.onExplorerSelect(id), mod.isLowPowerClient())
      this.scene.onInstrument = (id) => this.highlightPipe(id)
      this.bindPipeBoard(el)
      await this.scene.ready
      if (this.view !== 'explorer') return
      this.scene.setValve('chw', this.sim.chwValvePct)
      this.scene.setValve('cw', this.sim.cwValvePct)
      this.scene.setValve('gly', this.sim.glycolValvePct)
      this.scene.setFans(this.snap.dryFanPct, this.snap.towerFanPct)
      this.scene.setReadings(this.sceneReadings())
      if (this.selected) this.scene.select(this.selected)
      if (status) status.textContent = mod.isLowPowerClient() ? 'Light 3D' : 'Orbit · tap a part'
      boot?.remove()
    } catch (e) {
      console.error(e)
      if (status) status.textContent = '3D failed'
      if (boot) boot.textContent = '3D failed — buttons still train you.'
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
          <p>Heat from the hall enters as warm CHW return. Trace compression and rejection.</p>
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
          <button class="btn" type="button" data-cycle-next>${this.cycleIndex === CYCLE_NODES.length - 1 ? 'Finish loop' : 'Next stage'}</button>
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
          this.toast('Loop cleared (+25 XP)')
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
          <p>Ticket → redundancy → power → water → start. Soft stop only after standby carries load.</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn ${this.opMode === 'start' ? '' : 'ghost'}" type="button" data-mode="start">Startup</button>
          <button class="btn ${this.opMode === 'stop' ? 'amber' : 'ghost'}" type="button" data-mode="stop">Shutdown</button>
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
            this.toast('MOP drill cleared (+30 XP)')
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
          <h2>OptiView · CH-01</h2>
          <p>Panel tied to the live plant sim. Soft stop, safety stop, setpoint, MBC status.</p>
        </div>
        <span class="chip">${this.running ? 'RUNNING' : 'STOPPED'} · ${s.ch01.mbc}</span>
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
              <input id="lchlt" type="range" min="42" max="65" step="0.5" value="${this.sim.lchltSet}" style="width:100%;margin-top:6px"/>
            </label>
            <button class="btn" type="button" data-opti="start" ${infoAttr('opti-start')} ${this.running ? 'disabled' : ''}>Start</button>
            <button class="btn amber" type="button" data-opti="soft" ${infoAttr('opti-soft')} ${!this.running ? 'disabled' : ''}>Soft Shutdown</button>
            <button class="btn rose" type="button" data-opti="safety" ${infoAttr('opti-safety')}>Safety Stop</button>
            <button class="btn ghost" type="button" data-opti="warn" ${infoAttr('opti-warn')}>Hall warning</button>
            <button class="btn ghost" type="button" data-opti="noc" ${infoAttr('opti-noc')}>Page NOC</button>
            <button class="btn ghost" type="button" data-opti="done" ${infoAttr('opti-done')}>Mark complete</button>
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
          <div class="gauge" ${infoAttr('gauge-landings')}><div class="label">LANDINGS</div><div class="value">${this.sim.incident === 'landing' ? 1 : 0}</div></div>
          <div class="gauge" ${infoAttr('gauge-vibe')}><div class="label">1× VIBE</div><div class="value">${(0.12 + Math.sin(s.t) * 0.02).toFixed(2)}</div></div>
        </div>
        <div class="schematic">AXIAL  ·····●·····  gap ok
RADIAL X ····●····  centered
RADIAL Y ····●····  centered
TOUCHDOWN bearings: ${s.ch01.mbc === 'LANDED' ? 'ENGAGED' : 'CLEAR'}</div>
        <div class="message-log"><div class="${s.ch01.mbc === 'LANDED' ? 'alarm' : ''}">MBC stream · ${s.ch01.mbc}</div></div>`
    }
    if (this.optiTab === 'alarms') {
      return `<div class="message-log">${this.optiLog
        .slice()
        .reverse()
        .map((m) => `<div class="${m.kind ?? ''}">${m.text}</div>`)
        .join('')}${s.alarm ? `<div class="alarm">${s.alarm}</div>` : ''}</div>`
    }
    return `
      <div class="gauge-row">
        <div class="gauge" ${infoAttr('gauge-set')}><div class="label">LCHLT SET</div><div class="value" data-ov="set">${s.lchltSet.toFixed(1)}°F</div></div>
        <div class="gauge" ${infoAttr('gauge-act')}><div class="label">LCHLT ACT</div><div class="value" data-ov="act">${this.running ? s.lchltAct.toFixed(1) : '58.2'}°F</div></div>
        <div class="gauge" ${infoAttr('gauge-rla')}><div class="label">% RLA</div><div class="value" data-ov="rla">${this.running ? s.ch01.rla : 0}%</div></div>
      </div>
      <div class="gauge-row">
        <div class="gauge" ${infoAttr('gauge-evap')}><div class="label">EVAP</div><div class="value">${this.running ? 36 : 48}<span style="font-size:.75rem"> psig</span></div></div>
        <div class="gauge" ${infoAttr('gauge-cond')}><div class="label">COND</div><div class="value" data-ov="cond">${s.ch01.condPsig}<span style="font-size:.75rem"> psig</span></div></div>
        <div class="gauge" ${infoAttr('gauge-hall')}><div class="label">HALL SA</div><div class="value" data-ov="hall">${s.hallSupplyF}°F</div></div>
      </div>
      <div class="schematic">EVAP ══╗
       ║  COMP ▶ VSD ▶ MBC ${s.ch01.mbc}
COND ══╝     CHW → CRAH → HALL</div>
      <div class="message-log">${this.optiLog
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
      set('act', `${this.running ? s.lchltAct.toFixed(1) : '58.2'}°F`)
      set('rla', `${this.running ? s.ch01.rla : 0}%`)
      set('cond', `${s.ch01.condPsig}`)
      set('hall', `${s.hallSupplyF}°F`)
    }
  }

  private bindOptiview(el: Element) {
    el.querySelectorAll<HTMLButtonElement>('[data-otab]').forEach((b) => {
      b.addEventListener('click', () => {
        this.optiTab = b.dataset.otab as typeof this.optiTab
        this.renderView()
      })
    })
    el.querySelector<HTMLInputElement>('#lchlt')?.addEventListener('input', (e) => {
      this.sim.lchltSet = Number((e.target as HTMLInputElement).value)
      this.optiLog.push({ text: `Setpoint → ${this.sim.lchltSet.toFixed(1)}°F LCHLT` })
      this.patchOptiLive()
    })
    el.querySelectorAll<HTMLButtonElement>('[data-opti]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.opti
        if (a === 'start') {
          this.running = true
          this.sim.ch01Running = true
          this.optiLog.push({ text: 'Start accepted — MBC levitating, VSD ramping' })
        } else if (a === 'soft') {
          this.running = false
          this.sim.ch01Running = false
          this.optiLog.push({ text: 'Soft shutdown — controlled deceleration' })
        } else if (a === 'safety') {
          this.running = false
          this.sim.ch01Running = false
          this.optiLog.push({ text: 'SAFETY STOP', kind: 'alarm' })
        } else if (a === 'warn') {
          this.optiLog.push({ text: 'WARNING: condenser approach / hall risk', kind: 'warn' })
        } else if (a === 'noc') {
          this.optiLog.push({ text: 'NOC TICKET OPENED', kind: 'alarm' })
          this.toast('NOC paged (sim)')
        } else if (a === 'done') {
          if (!this.progress.optiviewComplete) {
            this.progress.optiviewComplete = true
            this.progress = addXp(this.progress, 25)
            this.toast('OptiView cleared (+25 XP)')
            this.persist()
          }
        }
        this.renderView()
      })
    })
  }

  private matchHtml() {
    return `
      <div class="view-head">
        <div><h2>Icon match</h2><p>Icon → system. Perfect board = rounds muscle memory.</p></div>
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
              return `<button type="button" class="match-tile ${locked ? 'locked correct' : ''} ${this.matchSelectedIcon === p.id ? 'selected' : ''}" data-icon="${p.id}" ${infoAttr(componentInfoId(p.id as ComponentId))} ${locked ? 'disabled' : ''}>
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
              return `<button type="button" class="match-tile ${locked ? 'locked correct' : ''}" data-label="${p.id}" ${infoAttr(componentInfoId(p.id as ComponentId))} ${locked ? 'disabled' : ''}><strong>${p.label}</strong></button>`
            })
            .join('')}
        </div></div>
      </div>`
  }

  private bindMatch(el: Element) {
    el.querySelector('[data-match-reset]')?.addEventListener('click', () => {
      this.matchIcons = shuffle(MATCH_PAIRS)
      this.matchLabels = shuffle(MATCH_PAIRS)
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
          this.toast('Pick an icon first')
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
            this.toast('Perfect board (+40 XP)')
            this.persist()
          }
          this.renderView()
        } else {
          btn.classList.add('wrong')
          this.toast('Wrong system')
          window.setTimeout(() => btn.classList.remove('wrong'), 400)
        }
      })
    })
  }

  private quizHtml() {
    if (this.quizIndex >= this.quizOrder.length) {
      return `<div class="view-head"><div><h2>Gate complete</h2><p>Score ${this.quizScore}/${this.quizOrder.length}. Best ${Math.max(this.progress.quizBest, this.quizScore)}.</p></div></div>
        <div class="quiz-card" ${infoAttr('quiz-done')}><button class="btn" type="button" data-quiz-restart>Retry shuffled</button></div>`
    }
    const q = this.quizOrder[this.quizIndex]
    return `
      <div class="view-head">
        <div><h2>Knowledge gate</h2><p>${q.topic} · ${this.quizIndex + 1}/${this.quizOrder.length}</p></div>
        <span class="chip">Score ${this.quizScore}</span>
      </div>
      <div class="quiz-card" ${infoAttr(quizInfoId(q.id))}>
        <h3 style="margin-top:0">${q.prompt}</h3>
        <div class="choices">${q.choices.map((c, i) => `<button type="button" class="choice" data-choice="${i}">${c}</button>`).join('')}</div>
        <div id="quiz-feedback"></div>
        <div style="margin-top:14px"><button class="btn" type="button" data-quiz-next style="display:none">Next</button></div>
      </div>`
  }

  private bindQuiz(el: Element) {
    el.querySelector('[data-quiz-restart]')?.addEventListener('click', () => {
      this.quizOrder = shuffle(QUIZ)
      this.quizIndex = 0
      this.quizScore = 0
      this.quizAnswered = false
      this.renderView()
    })
    if (this.quizIndex >= this.quizOrder.length) {
      if (this.quizScore > this.progress.quizBest) this.progress.quizBest = this.quizScore
      return
    }
    const q = this.quizOrder[this.quizIndex]
    const next = el.querySelector<HTMLButtonElement>('[data-quiz-next]')!
    const feedback = el.querySelector('#quiz-feedback')!
    el.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.quizAnswered) return
        this.quizAnswered = true
        const i = Number(btn.dataset.choice)
        el.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((b, idx) => {
          if (idx === q.answer) b.classList.add('correct')
          else if (idx === i) b.classList.add('wrong')
        })
        if (i === q.answer) this.quizScore += 1
        feedback.innerHTML = `<div class="feedback">${i === q.answer ? 'Correct. ' : 'Not quite. '}${q.explain}</div>`
        linkGlossary(feedback)
        next.style.display = 'inline-flex'
      })
    })
    next.addEventListener('click', () => {
      this.quizIndex += 1
      this.quizAnswered = false
      if (this.quizIndex >= this.quizOrder.length) {
        if (this.quizScore > this.progress.quizBest) this.progress.quizBest = this.quizScore
        this.progress = addXp(this.progress, this.quizScore * 5)
        this.persist()
        this.toast(`Gate: ${this.quizScore}/${QUIZ.length}`)
      }
      this.renderView()
    })
  }

  private startTroubleClock() {
    this.troubleSeconds = 45
    if (this.troubleTimer) clearInterval(this.troubleTimer)
    this.troubleTimer = window.setInterval(() => {
      if (this.view !== 'trouble' || this.troublePicked !== null) return
      this.troubleSeconds -= 1
      const el = this.root.querySelector('#incident-timer')
      if (el) {
        el.textContent = `${Math.max(0, this.troubleSeconds)}s`
        el.classList.toggle('critical', this.troubleSeconds <= 12)
      }
      if (this.troubleSeconds <= 0) {
        this.toast('NOC timer expired — still answer')
        if (this.troubleTimer) clearInterval(this.troubleTimer)
      }
    }, 1000)
  }

  private troubleHtml() {
    const t = TROUBLE_CASES[this.troubleIndex]
    const mapIncident: Record<string, typeof this.sim.incident> = {
      'high-head': 'high-head',
      'hall-hot-chiller-idle': 'hall-hot',
      landing: 'landing',
      'no-start': 'failover',
    }
    if (mapIncident[t.id]) this.sim.incident = mapIncident[t.id]
    return `
      <div class="view-head">
        <div>
          <h2>Incident clock</h2>
          <p>Scenario ${this.troubleIndex + 1}/${TROUBLE_CASES.length}. Live board is stressed. First action under time pressure.</p>
        </div>
        <div class="scoreline">
          <span class="timer ${this.troubleSeconds <= 12 ? 'critical' : ''}" id="incident-timer">${this.troubleSeconds}s</span>
          <span class="chip">${this.progress.troubleSolved.length}/${TROUBLE_CASES.length}</span>
          <button class="btn ghost" type="button" data-tr-prev>Prev</button>
          <button class="btn ghost" type="button" data-tr-next>Next</button>
        </div>
      </div>
      <div class="alarm-banner show">${this.snap.alarm ?? t.title}</div>
      <div class="kpi-strip">${this.kpiHtml(this.snap)}</div>
      <div class="trouble-card" ${infoAttr(troubleInfoId(t.id))}>
        <h3 style="margin-top:0">${t.title}</h3>
        <ul>${t.symptoms.map((s) => `<li>${s}</li>`).join('')}</ul>
        <div class="choices">
          ${t.options
            .map(
              (o, i) =>
                `<button type="button" class="choice ${this.troublePicked === i ? (o.correct ? 'correct' : 'wrong') : ''}" data-tr="${i}">${o.text}</button>`,
            )
            .join('')}
        </div>
        ${
          this.troublePicked !== null
            ? `<div class="feedback">${t.options[this.troublePicked].feedback}<br/><br/><strong>Takeaway:</strong> ${t.teach}</div>`
            : ''
        }
      </div>`
  }

  private bindTrouble(el: Element) {
    el.querySelector('[data-tr-prev]')?.addEventListener('click', () => {
      this.troubleIndex = (this.troubleIndex - 1 + TROUBLE_CASES.length) % TROUBLE_CASES.length
      this.troublePicked = null
      this.startTroubleClock()
      this.renderView()
    })
    el.querySelector('[data-tr-next]')?.addEventListener('click', () => {
      this.troubleIndex = (this.troubleIndex + 1) % TROUBLE_CASES.length
      this.troublePicked = null
      this.startTroubleClock()
      this.renderView()
    })
    const t = TROUBLE_CASES[this.troubleIndex]
    el.querySelectorAll<HTMLButtonElement>('[data-tr]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.tr)
        this.troublePicked = i
        if (t.options[i].correct && !this.progress.troubleSolved.includes(t.id)) {
          const bonus = this.troubleSeconds > 20 ? 30 : 20
          this.progress.troubleSolved.push(t.id)
          this.progress = addXp(this.progress, bonus)
          this.toast(`Incident cleared (+${bonus} XP)`)
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
        <div><h2>Shift deck</h2><p>Tap to acknowledge 24/7 awareness items.</p></div>
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
      ${done ? `<div class="feedback" style="margin-top:16px">Deck complete. Live work still follows site MOPs.</div>` : ''}`
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
          this.toast('Shift deck cleared (+25 XP)')
          this.persist()
        }
        this.renderView()
      })
    })
  }
}
