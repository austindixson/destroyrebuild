import assert from 'node:assert/strict'
import { test } from 'node:test'
import { captureScreenSnapshot, type ScreenInput } from '../src/chat/snapshot.ts'
import type { ViewId } from '../src/data/content.ts'
import { PlantController } from '../src/sim/controller.ts'
import type { PlantSnapshot } from '../src/sim/plantSim.ts'

const VIEWS: ViewId[] = [
  'home',
  'plant',
  'explorer',
  'cycle',
  'operation',
  'optiview',
  'match',
  'quiz',
  'trouble',
  'maintenance',
]

function board(): { controller: PlantController; snap: PlantSnapshot } {
  const controller = new PlantController({ seed: 3 })
  controller.tick(2)
  return { controller, snap: controller.snapshot }
}

function screen(view: ViewId, snap: PlantSnapshot, patch: Partial<ScreenInput> = {}): ScreenInput {
  return {
    view,
    snap,
    ch01Running: true,
    ch02Running: false,
    paused: false,
    timeScale: 1,
    itLoadTargetMw: 4.2,
    incident: null,
    chaosLabel: null,
    optiLog: ['CH-01 is online. The BMS link is a simulation.'],
    selectedId: 'compressor',
    selectedName: 'Magnetic bearing compressor',
    optiTab: 'home',
    plantStep: 1,
    plantSteps: 6,
    plantLabel: 'CHW loop',
    cycleStep: 0,
    cycleSteps: 4,
    cycleLabel: 'Evaporator',
    opMode: 'start',
    opIndex: 2,
    troubleSeconds: 30,
    troubleDone: false,
    troubleTitle: 'High head on a peak weather day',
    troubleSolved: 1,
    troubleTotal: 5,
    troublePicked: false,
    quizIndex: 2,
    quizTotal: 10,
    quizScore: 1,
    quizDone: false,
    matchScore: 3,
    matchBest: 4,
    maintChecked: 2,
    maintTotal: 14,
    explored: 3,
    rankTitle: 'New operator',
    rankTier: 1,
    masteryPct: 0,
    xp: 0,
    wallClock: '12:00:00',
    ...patch,
  }
}

function assertPlant(snap: PlantSnapshot, shotPlant: PlantSnapshot): void {
  assert.equal(shotPlant.itLoadMw, snap.itLoadMw)
  assert.equal(shotPlant.hallSupplyF, snap.hallSupplyF)
  assert.equal(shotPlant.hallReturnF, snap.hallReturnF)
  assert.equal(shotPlant.lchltAct, snap.lchltAct)
  assert.equal(shotPlant.lchltSet, snap.lchltSet)
  assert.equal(shotPlant.oatF, snap.oatF)
  assert.equal(shotPlant.wbF, snap.wbF)
  assert.equal(shotPlant.chwValvePct, snap.chwValvePct)
  assert.equal(shotPlant.cwValvePct, snap.cwValvePct)
  assert.equal(shotPlant.glycolValvePct, snap.glycolValvePct)
  assert.equal(shotPlant.towerFanPct, snap.towerFanPct)
  assert.equal(shotPlant.dryFanPct, snap.dryFanPct)
  assert.equal(shotPlant.freeCoolPct, snap.freeCoolPct)
  assert.equal(shotPlant.alarm, snap.alarm)
  assert.equal(shotPlant.ch01.rla, snap.ch01.rla)
  assert.equal(shotPlant.ch01.condPsig, snap.ch01.condPsig)
  assert.deepEqual(shotPlant.units.map((unit) => unit.id), snap.units.map((unit) => unit.id))
  assert.equal(shotPlant.units[0]?.capacityMw, snap.units[0]?.capacityMw)
  assert.equal(shotPlant.runningCapacityMw, snap.runningCapacityMw)
}

test('every view snapshot keeps the live board and the fleet', () => {
  const { snap } = board()
  for (const view of VIEWS) {
    const shot = captureScreenSnapshot(screen(view, snap))
    assert.equal(shot.view, view)
    assertPlant(snap, shot.plant)
    assert.equal(shot.units.length, snap.units.length)
    assert.equal(shot.shown['chrome.rank'], 'New operator')
    assert.equal(shot.shown['chrome.tier'], 'Rank T1')
    assert.equal(shot.shown['chrome.xp'], '0 XP')
    assert.equal(JSON.stringify(shot.shown).includes('%RLA'), false)
    assert.equal(JSON.stringify(shot.shown).includes('%TSLA'), false)
  }
})

test('home snapshot contains each live board value', () => {
  const { controller, snap } = board()
  controller.injectIncident('hall-hot', 'user')
  const live = controller.snapshot
  const shot = captureScreenSnapshot(
    screen('home', live, {
      incident: 'hall-hot',
      chaosLabel: 'Hot hall, low chiller load',
      ch01Running: controller.running,
      ch02Running: controller.unitRunning('CH-02'),
      itLoadTargetMw: controller.itLoadCenterMw,
    }),
  )
  const shown = shot.shown
  assert.equal(shown['kpi.hallSupply'], `${live.hallSupplyF}°F`)
  assert.equal(shown['kpi.lchlt'], `${live.lchltAct}°F`)
  assert.equal(shown['kpi.itLoad'], `${live.itLoadMw} MW`)
  assert.equal(shown['kpi.head'], `${live.ch01.condPsig} psig`)
  assert.equal(shown['kpi.outdoor'], `${live.oatF}°F`)
  assert.equal(shown['kpi.ch01Fla'], `${live.ch01.rla}%`)
  assert.equal(shown['mimic.it'], `${live.itLoadMw} MW of IT heat`)
  assert.equal(shown['mimic.hall'], `Supply ${live.hallSupplyF}°F · Return ${live.hallReturnF}°F`)
  assert.equal(shown['mimic.chwDp'], `ΔP ${live.chwDpPsi} psi`)
  assert.equal(shown['mimic.ch01'], `${live.ch01.mode.toUpperCase()} · ${live.ch01.rla}% FLA`)
  assert.equal(shown['mimic.tower'], `Wet-bulb ${live.wbF}°F · Dry-bulb ${live.oatF}°F · free cooling ${live.freeCoolPct}%`)
  assert.equal(shown['mimic.noc'], live.alarm ? 'Escalated' : 'The watch desk is normal')
  assert.equal(shown['alarm'], live.alarm ?? '')
  assert.equal(shown['reason'], live.reason)
  assert.equal(shown['chaos'], 'Active fault: Hot hall, low chiller load.')
  assert.equal(shown['controls.itTarget'], `${controller.itLoadCenterMw.toFixed(1)} MW`)
  assert.equal(shown['controls.capacity'], `Running capacity ${live.runningCapacityMw.toFixed(1)} MW.`)
  assert.equal(shown['controls.lchltTarget'], `Trainer LCHLT target is ${live.lchltTargetF.toFixed(0)}°F for this dry-bulb.`)
  assert.equal(shown['controls.ch01'], controller.running ? 'In operation' : 'Standby')
  assert.equal(shown['controls.ch02'], 'Standby')
  assert.equal(shown['controls.clock'], 'Pause')
  assert.equal(shown['controls.scale'], '1×')
  assert.equal(shown['controls.simTime'], `Sim time ${Math.round(live.t)} s`)
  assert.equal(shown['weather.preset'], '75°F mild')
  assert.equal(shot.incident, 'hall-hot')
  assert.equal(shot.blocksWrites, false)
})

test('explorer snapshot contains pipe, valve, fan, and outdoor values', () => {
  const { snap } = board()
  const shown = captureScreenSnapshot(screen('explorer', snap)).shown
  assert.equal(shown['pipe.oat'], `${snap.oatF}°F`)
  assert.equal(shown['pipe.chwEnterT'], `${snap.chwrF}°F`)
  assert.equal(shown['pipe.chwEnterP'], `${snap.chwrPsi.toFixed(1)} psi`)
  assert.equal(shown['pipe.chwLeaveT'], `${snap.chwsF}°F`)
  assert.equal(shown['pipe.chwLeaveP'], `${snap.chwsPsi.toFixed(1)} psi`)
  assert.equal(shown['pipe.cwEnterT'], `${snap.cwsF}°F`)
  assert.equal(shown['pipe.cwEnterP'], `${snap.cwsPsi.toFixed(1)} psi`)
  assert.equal(shown['pipe.cwLeaveT'], `${snap.cwrF}°F`)
  assert.equal(shown['pipe.cwLeaveP'], `${snap.cwrPsi.toFixed(1)} psi`)
  assert.equal(shown['pipe.glyEnterT'], `${snap.glyS}°F`)
  assert.equal(shown['pipe.glyEnterP'], `${snap.glySPsi.toFixed(1)} psi`)
  assert.equal(shown['pipe.glyLeaveT'], `${snap.glyR}°F`)
  assert.equal(shown['pipe.glyLeaveP'], `${snap.glyRPsi.toFixed(1)} psi`)
  assert.equal(shown['pipe.chwValve'], `${snap.chwValvePct}%`)
  assert.equal(shown['pipe.cwValve'], `${snap.cwValvePct}%`)
  assert.equal(shown['pipe.glyValve'], `${snap.glycolValvePct}%`)
  assert.equal(shown['pipe.chwDp'], `ΔP ${snap.chwDpPsi.toFixed(1)} psi · target ${snap.chwTargetPsi}`)
  assert.equal(shown['pipe.cwDp'], `ΔP ${snap.cwDpPsi.toFixed(1)} psi · fans ${snap.towerFanPct}%`)
  assert.equal(shown['pipe.glyDp'], `ΔP ${snap.glycolDpPsi.toFixed(1)} psi · free cooling ${snap.freeCoolPct}%`)
  assert.equal(shown['pipe.chwGain'], `${snap.chwGain.toFixed(1)} psi per 10% of stem`)
  assert.equal(shown['pipe.cwGain'], `${snap.cwHeadGain.toFixed(1)} psi of head per 10%. Wet-bulb ${snap.wbF}°F`)
  assert.equal(shown['pipe.glyGain'], `${snap.glycolGain.toFixed(1)} psi per 10%. Dry cooler fans ${snap.dryFanPct}%`)
  assert.equal(shown['pipe.reason'], snap.reason)
  assert.equal(shown['explorer.selected'], 'Magnetic bearing compressor')
  assert.equal(shown['explorer.count'], '3 of 8 complete')
})

test('optiview snapshot matches the gauges on each tab', () => {
  const { snap } = board()
  const home = captureScreenSnapshot(screen('optiview', snap, { ch01Running: false, optiTab: 'home' })).shown
  assert.equal(home['opti.lchltSet'], `${snap.lchltSet.toFixed(1)}°F`)
  assert.equal(home['opti.lchltAct'], '58.2°F')
  assert.equal(home['opti.fla'], '0%')
  assert.equal(home['opti.evap'], '48 psig')
  assert.equal(home['opti.cond'], `${snap.ch01.condPsig} psig`)
  assert.equal(home['opti.hall'], `${snap.hallSupplyF}°F`)
  assert.equal(home['opti.run'], `Standby · ${snap.ch01.mbc}`)
  assert.equal(home['opti.clock'], '12:00:00')
  assert.equal(home['opti.mbc'], snap.ch01.mbc)

  const running = captureScreenSnapshot(screen('optiview', snap, { ch01Running: true, optiTab: 'home' })).shown
  assert.equal(running['opti.lchltAct'], `${snap.lchltAct.toFixed(1)}°F`)
  assert.equal(running['opti.fla'], `${snap.ch01.rla}%`)
  assert.equal(running['opti.evap'], '36 psig')

  const mbc = captureScreenSnapshot(screen('optiview', snap, { incident: 'landing', optiTab: 'mbc' })).shown
  assert.equal(mbc['opti.landings'], '1')
  assert.equal(mbc['opti.vibe'], (0.12 + Math.sin(snap.t) * 0.02).toFixed(2))
  assert.equal(mbc['opti.touchdown'], snap.ch01.mbc === 'LANDED' ? 'ENGAGED' : 'CLEAR')

  const alarms = captureScreenSnapshot(screen('optiview', snap, { optiTab: 'alarms' })).shown
  assert.equal(alarms['opti.log.0'], 'CH-01 is online. The BMS link is a simulation.')
  assert.equal(alarms['opti.alarm'], snap.alarm ?? '')
})

test('trouble, drill, and quiz views keep their live state', () => {
  const { snap } = board()
  const trouble = captureScreenSnapshot(screen('trouble', snap)).shown
  assert.equal(trouble['kpi.hallSupply'], `${snap.hallSupplyF}°F`)
  assert.equal(trouble['kpi.ch01Fla'], `${snap.ch01.rla}%`)
  assert.equal(trouble['trouble.timer'], '30s')
  assert.equal(trouble['trouble.title'], 'High head on a peak weather day')
  assert.equal(trouble['trouble.progress'], '1 of 5')
  assert.equal(captureScreenSnapshot(screen('trouble', snap)).blocksWrites, true)
  assert.equal(captureScreenSnapshot(screen('trouble', snap, { troublePicked: true })).blocksWrites, false)

  const plant = captureScreenSnapshot(screen('plant', snap)).shown
  assert.equal(plant['plant.step'], 'Link 2/6')
  assert.equal(plant['plant.label'], 'CHW loop')

  const cycle = captureScreenSnapshot(screen('cycle', snap)).shown
  assert.equal(cycle['cycle.step'], 'Stage 1/4')
  assert.equal(cycle['cycle.label'], 'Evaporator')

  const operation = captureScreenSnapshot(screen('operation', snap, { opMode: 'stop' })).shown
  assert.equal(operation['operation.mode'], 'Stop steps')
  assert.equal(operation['operation.step'], '3')

  const match = captureScreenSnapshot(screen('match', snap)).shown
  assert.equal(match['match.score'], '3/8')
  assert.equal(match['match.best'], 'Best 4/8')

  const quizShot = captureScreenSnapshot(screen('quiz', snap))
  assert.equal(quizShot.quizOpen, true)
  assert.equal(quizShot.shown['quiz.place'], '3/10')
  assert.equal(quizShot.shown['quiz.score'], 'Score 1')
  assert.equal(captureScreenSnapshot(screen('quiz', snap, { quizDone: true })).quizOpen, false)
  assert.equal(captureScreenSnapshot(screen('home', snap)).quizOpen, false)

  const maint = captureScreenSnapshot(screen('maintenance', snap)).shown
  assert.equal(maint['maint.count'], '2/14')
})
