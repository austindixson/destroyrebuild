import { CYCLE_NODES, MAINT_ITEMS, PLANT_NODES, QUIZ, TROUBLE_CASES, type ComponentId, type ViewId } from '../data/content.ts'
import { masteryPercent, type ProgressState } from '../progress.ts'
import type { PlantController } from '../sim/controller.ts'
import { rankFor, type IncidentKind, type PlantSnapshot, type UnitSnapshot } from '../sim/plantSim.ts'

export interface ScreenInput {
  view: ViewId
  snap: PlantSnapshot
  ch01Running: boolean
  ch02Running: boolean
  paused: boolean
  timeScale: number
  itLoadTargetMw: number
  incident: IncidentKind | null
  chaosLabel: string | null
  optiLog: readonly string[]
  selectedId: ComponentId | null
  selectedName: string | null
  optiTab: 'home' | 'mbc' | 'alarms'
  plantStep: number
  plantSteps: number
  plantLabel: string
  cycleStep: number
  cycleSteps: number
  cycleLabel: string
  opMode: 'start' | 'stop'
  opIndex: number
  troubleSeconds: number
  troubleDone: boolean
  troubleTitle: string
  troubleSolved: number
  troubleTotal: number
  troublePicked: boolean
  quizIndex: number
  quizTotal: number
  quizScore: number
  quizDone: boolean
  matchScore: number
  matchBest: number
  maintChecked: number
  maintTotal: number
  explored: number
  rankTitle: string
  rankTier: number
  masteryPct: number
  xp: number
  wallClock: string
}

export interface ScreenSnapshot {
  view: ViewId
  selectedId: ComponentId | null
  selectedName: string | null
  incident: IncidentKind | null
  chaosLabel: string | null
  blocksWrites: boolean
  quizOpen: boolean
  optiTab: ScreenInput['optiTab']
  optiLog: string[]
  units: UnitSnapshot[]
  plant: PlantSnapshot
  shown: Record<string, string>
}

function weatherLabel(oatF: number): string {
  if (oatF <= 50) return '40°F cold'
  if (oatF >= 90) return '100°F hot'
  return '75°F mild'
}

function chaosText(label: string | null): string {
  if (!label) return 'No fault is active.'
  return `Active fault: ${label}.`
}

function unitState(running: boolean): string {
  return running ? 'In operation' : 'Standby'
}

function chrome(input: ScreenInput): Record<string, string> {
  return {
    'chrome.rank': input.rankTitle,
    'chrome.tier': `Rank T${input.rankTier}`,
    'chrome.mastery': `${input.masteryPct}% mastery`,
    'chrome.xp': `${input.xp} XP`,
  }
}

function kpi(s: PlantSnapshot): Record<string, string> {
  return {
    'kpi.hallSupply': `${s.hallSupplyF}°F`,
    'kpi.lchlt': `${s.lchltAct}°F`,
    'kpi.itLoad': `${s.itLoadMw} MW`,
    'kpi.head': `${s.ch01.condPsig} psig`,
    'kpi.outdoor': `${s.oatF}°F`,
    'kpi.ch01Fla': `${s.ch01.rla}%`,
  }
}

function controls(input: ScreenInput): Record<string, string> {
  const s = input.snap
  const scale = input.paused ? 'paused' : `${input.timeScale}×`
  return {
    'controls.itTarget': `${input.itLoadTargetMw.toFixed(1)} MW`,
    'controls.capacity': `Running capacity ${s.runningCapacityMw.toFixed(1)} MW.`,
    'controls.lchltTarget': `Trainer LCHLT target is ${s.lchltTargetF.toFixed(0)}°F for this dry-bulb.`,
    'controls.ch01': unitState(input.ch01Running),
    'controls.ch02': unitState(input.ch02Running),
    'controls.clock': input.paused ? 'Resume' : 'Pause',
    'controls.scale': scale,
    'controls.simTime': `Sim time ${Math.round(s.t)} s`,
  }
}

function homeShown(input: ScreenInput): Record<string, string> {
  const s = input.snap
  const noc = s.alarm ? 'Escalated' : 'The watch desk is normal'
  return {
    ...chrome(input),
    ...kpi(s),
    ...controls(input),
    'weather.preset': weatherLabel(s.oatF),
    'alarm': s.alarm ?? '',
    'mimic.it': `${s.itLoadMw} MW of IT heat`,
    'mimic.hall': `Supply ${s.hallSupplyF}°F · Return ${s.hallReturnF}°F`,
    'mimic.chwDp': `ΔP ${s.chwDpPsi} psi`,
    'mimic.ch01': `${s.ch01.mode.toUpperCase()} · ${s.ch01.rla}% FLA`,
    'mimic.tower': `Wet-bulb ${s.wbF}°F · Dry-bulb ${s.oatF}°F · free cooling ${s.freeCoolPct}%`,
    'mimic.noc': noc,
    'reason': s.reason,
    'chaos': chaosText(input.chaosLabel),
  }
}

function pipeShown(s: PlantSnapshot): Record<string, string> {
  return {
    'pipe.oat': `${s.oatF}°F`,
    'pipe.chwEnterT': `${s.chwrF}°F`,
    'pipe.chwEnterP': `${s.chwrPsi.toFixed(1)} psi`,
    'pipe.chwLeaveT': `${s.chwsF}°F`,
    'pipe.chwLeaveP': `${s.chwsPsi.toFixed(1)} psi`,
    'pipe.cwEnterT': `${s.cwsF}°F`,
    'pipe.cwEnterP': `${s.cwsPsi.toFixed(1)} psi`,
    'pipe.cwLeaveT': `${s.cwrF}°F`,
    'pipe.cwLeaveP': `${s.cwrPsi.toFixed(1)} psi`,
    'pipe.glyEnterT': `${s.glyS}°F`,
    'pipe.glyEnterP': `${s.glySPsi.toFixed(1)} psi`,
    'pipe.glyLeaveT': `${s.glyR}°F`,
    'pipe.glyLeaveP': `${s.glyRPsi.toFixed(1)} psi`,
    'pipe.chwValve': `${s.chwValvePct}%`,
    'pipe.cwValve': `${s.cwValvePct}%`,
    'pipe.glyValve': `${s.glycolValvePct}%`,
    'pipe.chwDp': `ΔP ${s.chwDpPsi.toFixed(1)} psi · target ${s.chwTargetPsi}`,
    'pipe.cwDp': `ΔP ${s.cwDpPsi.toFixed(1)} psi · fans ${s.towerFanPct}%`,
    'pipe.glyDp': `ΔP ${s.glycolDpPsi.toFixed(1)} psi · free cooling ${s.freeCoolPct}%`,
    'pipe.chwGain': `${s.chwGain.toFixed(1)} psi per 10% of stem`,
    'pipe.cwGain': `${s.cwHeadGain.toFixed(1)} psi of head per 10%. Wet-bulb ${s.wbF}°F`,
    'pipe.glyGain': `${s.glycolGain.toFixed(1)} psi per 10%. Dry cooler fans ${s.dryFanPct}%`,
    'pipe.reason': s.reason,
  }
}

function explorerShown(input: ScreenInput): Record<string, string> {
  const selected = input.selectedName ?? 'Select a system'
  return {
    ...chrome(input),
    ...pipeShown(input.snap),
    'explorer.count': `${input.explored} of 8 complete`,
    'explorer.selected': selected,
  }
}

function optiAct(input: ScreenInput): string {
  const value = input.ch01Running ? input.snap.lchltAct.toFixed(1) : '58.2'
  return `${value}°F`
}

function optiFla(input: ScreenInput): string {
  const fla = input.ch01Running ? input.snap.ch01.rla : 0
  return `${fla}%`
}

function lchltHint(s: PlantSnapshot): string {
  if (s.alarm && s.alarm.includes('LCHLT setpoint fights')) return s.alarm
  return `Trainer target ${s.lchltTargetF.toFixed(0)}°F.`
}

function optiHome(input: ScreenInput): Record<string, string> {
  const s = input.snap
  const evap = input.ch01Running ? '36' : '48'
  return {
    'opti.run': `${unitState(input.ch01Running)} · ${s.ch01.mbc}`,
    'opti.clock': input.wallClock,
    'opti.lchltSet': `${s.lchltSet.toFixed(1)}°F`,
    'opti.lchltAct': optiAct(input),
    'opti.fla': optiFla(input),
    'opti.evap': `${evap} psig`,
    'opti.cond': `${s.ch01.condPsig} psig`,
    'opti.hall': `${s.hallSupplyF}°F`,
    'opti.hint': lchltHint(s),
    'opti.mbc': s.ch01.mbc,
    'opti.setpoint': String(input.snap.lchltSet),
  }
}

function optiMbc(input: ScreenInput): Record<string, string> {
  const s = input.snap
  const vibe = (0.12 + Math.sin(s.t) * 0.02).toFixed(2)
  const landings = input.incident === 'landing' ? '1' : '0'
  const touch = s.ch01.mbc === 'LANDED' ? 'ENGAGED' : 'CLEAR'
  return {
    'opti.run': `${unitState(input.ch01Running)} · ${s.ch01.mbc}`,
    'opti.clock': input.wallClock,
    'opti.mbc': s.ch01.mbc,
    'opti.landings': landings,
    'opti.vibe': vibe,
    'opti.touchdown': touch,
  }
}

function optiAlarms(input: ScreenInput): Record<string, string> {
  const lines = input.optiLog.map((line, index) => [`opti.log.${index}`, line])
  return {
    'opti.run': `${unitState(input.ch01Running)} · ${input.snap.ch01.mbc}`,
    'opti.clock': input.wallClock,
    'opti.alarm': input.snap.alarm ?? '',
    ...Object.fromEntries(lines),
  }
}

function optiviewShown(input: ScreenInput): Record<string, string> {
  switch (input.optiTab) {
    case 'mbc':
      return { ...chrome(input), ...optiMbc(input) }
    case 'alarms':
      return { ...chrome(input), ...optiAlarms(input) }
    case 'home':
      return { ...chrome(input), ...optiHome(input) }
    default: {
      const unknown: never = input.optiTab
      return unknown
    }
  }
}

function troubleShown(input: ScreenInput): Record<string, string> {
  const banner = input.snap.alarm ?? input.troubleTitle
  const timer = input.troubleDone ? 'complete' : `${input.troubleSeconds}s`
  return {
    ...chrome(input),
    ...kpi(input.snap),
    'trouble.timer': timer,
    'trouble.progress': `${input.troubleSolved} of ${input.troubleTotal}`,
    'trouble.title': input.troubleTitle,
    'trouble.alarm': banner,
  }
}

function plantShown(input: ScreenInput): Record<string, string> {
  return {
    ...chrome(input),
    'plant.step': `Link ${input.plantStep + 1}/${input.plantSteps}`,
    'plant.label': input.plantLabel,
  }
}

function cycleShown(input: ScreenInput): Record<string, string> {
  return {
    ...chrome(input),
    'cycle.step': `Stage ${input.cycleStep + 1}/${input.cycleSteps}`,
    'cycle.label': input.cycleLabel,
  }
}

function operationShown(input: ScreenInput): Record<string, string> {
  const mode = input.opMode === 'start' ? 'Start steps' : 'Stop steps'
  return {
    ...chrome(input),
    'operation.mode': mode,
    'operation.step': String(input.opIndex + 1),
  }
}

function matchShown(input: ScreenInput): Record<string, string> {
  return {
    ...chrome(input),
    'match.score': `${input.matchScore}/8`,
    'match.best': `Best ${input.matchBest}/8`,
  }
}

function quizShown(input: ScreenInput): Record<string, string> {
  const place = input.quizDone ? 'complete' : `${input.quizIndex + 1}/${input.quizTotal}`
  return {
    ...chrome(input),
    'quiz.place': place,
    'quiz.score': `Score ${input.quizScore}`,
  }
}

function maintenanceShown(input: ScreenInput): Record<string, string> {
  return {
    ...chrome(input),
    'maint.count': `${input.maintChecked}/${input.maintTotal}`,
  }
}

function shownFor(input: ScreenInput): Record<string, string> {
  switch (input.view) {
    case 'home':
      return homeShown(input)
    case 'explorer':
      return explorerShown(input)
    case 'optiview':
      return optiviewShown(input)
    case 'trouble':
      return troubleShown(input)
    case 'plant':
      return plantShown(input)
    case 'cycle':
      return cycleShown(input)
    case 'operation':
      return operationShown(input)
    case 'match':
      return matchShown(input)
    case 'quiz':
      return quizShown(input)
    case 'maintenance':
      return maintenanceShown(input)
    default: {
      const unknown: never = input.view
      return unknown
    }
  }
}

function writesBlocked(input: ScreenInput): boolean {
  return input.view === 'trouble' && !input.troubleDone && !input.troublePicked && input.troubleSeconds > 0
}

function quizQuestionOpen(input: ScreenInput): boolean {
  return input.view === 'quiz' && !input.quizDone && input.quizIndex < input.quizTotal
}

const FRESH_PROGRESS: ProgressState = {
  explored: [],
  plantComplete: false,
  cycleComplete: false,
  operationComplete: false,
  optiviewComplete: false,
  matchBest: 0,
  quizBest: 0,
  troubleSolved: [],
  maintenanceComplete: false,
  xp: 0,
}

function incidentLabel(kind: IncidentKind): string {
  switch (kind) {
    case 'high-head':
      return 'Peak weather, high head'
    case 'hall-hot':
      return 'Hot hall, low chiller load'
    case 'landing':
      return 'ATS landing'
    case 'failover':
      return 'Lead trip and failover'
    case 'bms-fight':
      return 'BMS and panel disagree'
    default: {
      const unknown: never = kind
      return unknown
    }
  }
}

/** Home screen at a fresh rank, using the same capture the chat panel sends. */
export function defaultHomeInput(controller: PlantController): ScreenInput {
  const snap = controller.snapshot
  const incident = controller.incident
  const pct = masteryPercent(FRESH_PROGRESS)
  const rank = rankFor(pct, FRESH_PROGRESS.xp)
  return {
    view: 'home',
    snap,
    ch01Running: controller.running,
    ch02Running: controller.unitRunning('CH-02'),
    paused: controller.paused,
    timeScale: controller.timeScale,
    itLoadTargetMw: controller.itLoadCenterMw,
    incident,
    chaosLabel: incident ? incidentLabel(incident) : null,
    optiLog: controller.optiLogLines.map((line) => line.text),
    selectedId: null,
    selectedName: null,
    optiTab: 'home',
    plantStep: 0,
    plantSteps: PLANT_NODES.length,
    plantLabel: PLANT_NODES[0]?.label ?? '',
    cycleStep: 0,
    cycleSteps: CYCLE_NODES.length,
    cycleLabel: CYCLE_NODES[0]?.label ?? '',
    opMode: 'start',
    opIndex: 0,
    troubleSeconds: 45,
    troubleDone: false,
    troubleTitle: TROUBLE_CASES[0]?.title ?? '',
    troubleSolved: 0,
    troubleTotal: TROUBLE_CASES.length,
    troublePicked: false,
    quizIndex: 0,
    quizTotal: QUIZ.length,
    quizScore: 0,
    quizDone: false,
    matchScore: 0,
    matchBest: 0,
    maintChecked: 0,
    maintTotal: MAINT_ITEMS.length,
    explored: 0,
    rankTitle: rank.title,
    rankTier: rank.tier,
    masteryPct: pct,
    xp: FRESH_PROGRESS.xp,
    wallClock: new Date().toLocaleTimeString(),
  }
}

/** Capture every live value on the current view, plus the full trainer board. */
export function captureScreenSnapshot(input: ScreenInput): ScreenSnapshot {
  return {
    view: input.view,
    selectedId: input.selectedId,
    selectedName: input.selectedName,
    incident: input.incident,
    chaosLabel: input.chaosLabel,
    blocksWrites: writesBlocked(input),
    quizOpen: quizQuestionOpen(input),
    optiTab: input.optiTab,
    optiLog: input.optiLog.slice(),
    units: input.snap.units.map((unit) => ({ ...unit })),
    plant: input.snap,
    shown: shownFor(input),
  }
}
