import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TROUBLE_CASES } from '../src/data/content'
import { ACTION_LOG_LIMIT, PlantController, SNAPSHOT_STACK_DEPTH } from '../src/sim/controller'
import { trainerFleet } from '../src/sim/plantSim'
import { createYorkTools } from '../src/sim/tools'
import { isTroubleCaseId, troubleIncident } from '../src/sim/troubleMap'

function advance(controller: PlantController, seconds: number, step = 1) {
  const steps = Math.round(seconds / step)
  for (let i = 0; i < steps; i += 1) controller.tick(step)
}

test('raising IT load by 1.5 MW on CH-01 warms the hall, and CH-02 brings it back', () => {
  const controller = new PlantController({ seed: 0 })
  advance(controller, 5)
  const before = controller.snapshot.hallSupplyF
  assert.equal(controller.unitRunning('CH-01'), true)
  assert.equal(controller.unitRunning('CH-02'), false)
  const raised = controller.setItLoad({ deltaMw: 1.5 })
  assert.equal(raised.ok, true)
  assert.ok(Math.abs(controller.itLoadCenterMw - 5.7) < 0.05)
  advance(controller, 60)
  const hot = controller.snapshot.hallSupplyF
  assert.ok(hot > before + 0.6, `hall supply ${before} -> ${hot}`)
  assert.ok(controller.snapshot.unmetMw > 0.2, `unmet ${controller.snapshot.unmetMw}`)
  controller.startChiller('CH-02')
  assert.equal(controller.snapshot.runningCapacityMw, 10)
  advance(controller, 60)
  const recovered = controller.snapshot.hallSupplyF
  assert.ok(recovered < hot - 0.5, `hall supply ${hot} -> ${recovered}`)
  assert.ok(recovered < before + 0.5, `recovered ${recovered} baseline ${before}`)
})

test('running capacity is the sum of every running unit', () => {
  const controller = new PlantController({ units: trainerFleet(3, 1, 5), seed: 0 })
  assert.equal(controller.snapshot.runningCapacityMw, 5)
  assert.equal(controller.snapshot.units.length, 3)
  controller.startChiller('CH-02')
  controller.startChiller('CH-03')
  assert.equal(controller.snapshot.runningCapacityMw, 15)
  controller.setItLoad({ targetMw: 8 })
  advance(controller, 30)
  assert.equal(controller.snapshot.unmetMw, 0)
  const one = new PlantController({ units: trainerFleet(3, 1, 5), seed: 0 })
  one.setItLoad({ targetMw: 8 })
  advance(one, 60)
  assert.ok(one.snapshot.unmetMw > 2, `unmet ${one.snapshot.unmetMw}`)
  assert.ok(one.snapshot.hallSupplyF > 75, `hall ${one.snapshot.hallSupplyF}`)
})

test('the same seed and tool sequence replays the same snapshot', () => {
  const run = () => {
    const controller = new PlantController({ seed: 3 })
    controller.setWeather('hot')
    controller.setItLoad({ targetMw: 6.5, rampSeconds: 10 })
    controller.setValve('gly', 40)
    advance(controller, 15)
    controller.startChiller('CH-02')
    advance(controller, 5, 0.5)
    return controller.snapshot
  }
  assert.deepEqual(run(), run())
})

test('pause freezes the clock and time scale multiplies the step', () => {
  const controller = new PlantController({ seed: 0 })
  controller.setClock({ paused: true })
  controller.tick(5)
  assert.equal(controller.snapshot.t, 0)
  controller.setClock({ paused: false, scale: 5 })
  controller.tick(1)
  assert.equal(controller.snapshot.t, 5)
})

test('undo restores the sim clock and the outdoor temperature', () => {
  const controller = new PlantController({ seed: 0 })
  advance(controller, 4)
  controller.setOutdoorDryBulb(100)
  advance(controller, 6)
  assert.equal(controller.snapshot.t, 10)
  assert.equal(controller.snapshot.oatF, 100)
  const undone = controller.undo()
  assert.equal(undone.ok, true)
  assert.equal(controller.snapshot.t, 4)
  assert.equal(controller.snapshot.oatF, 75)
})

test('incident.clear restores the pre-incident plant, including the clock', () => {
  const controller = new PlantController({ seed: 0 })
  controller.setValve('chw', 55)
  controller.startChiller('CH-02')
  controller.setLchltSetpoint(60)
  advance(controller, 8)
  const marked = controller.snapshot
  controller.injectIncident('high-head')
  advance(controller, 10)
  controller.setValve('chw', 90)
  controller.setLchltSetpoint(48)
  assert.ok(controller.snapshot.t > marked.t)
  const cleared = controller.clearIncident()
  assert.equal(cleared.ok, true)
  assert.equal(controller.incident, null)
  assert.equal(controller.snapshot.t, marked.t)
  assert.equal(controller.snapshot.chwValvePct, marked.chwValvePct)
  assert.equal(controller.snapshot.lchltSet, 60)
  assert.equal(controller.unitRunning('CH-01'), true)
  assert.equal(controller.unitRunning('CH-02'), true)
  assert.equal(controller.running, true)
})

test('failover keeps CH-02 when it is already running', () => {
  const controller = new PlantController({ seed: 0 })
  controller.startChiller('CH-02')
  controller.injectIncident('failover')
  assert.equal(controller.running, false)
  assert.equal(controller.unitRunning('CH-02'), true)
  assert.equal(controller.snapshot.ch01.mode, 'offline')
  assert.match(controller.snapshot.alarm ?? '', /CH-02 has the load/)
})

test('the no-start drill forces CH-02 off, and a plain failover does not', () => {
  const forced = new PlantController({ seed: 0 })
  forced.startChiller('CH-02')
  forced.injectIncident('failover', 'user', { forceUnitOff: 'CH-02' })
  assert.equal(forced.unitRunning('CH-02'), false)
  assert.match(forced.snapshot.alarm ?? '', /inhibit/)
  const mapped = troubleIncident('no-start')
  assert.equal(mapped.kind, 'failover')
  assert.equal(mapped.forceUnitOff, 'CH-02')
  assert.equal(troubleIncident('bms-fight').kind, 'bms-fight')
  assert.equal(troubleIncident('high-head').forceUnitOff, undefined)
})

test('landing clears the CH-01 run flag that OptiView uses', () => {
  const controller = new PlantController({ seed: 0 })
  assert.equal(controller.running, true)
  controller.injectIncident('landing')
  assert.equal(controller.running, false)
  assert.equal(controller.snapshot.ch01.mbc, 'LANDED')
  assert.equal(controller.snapshot.ch01.rla, 0)
  assert.notEqual(controller.snapshot.ch01.mode, 'lead')
  assert.equal(controller.startChiller('CH-01').ok, false)
})

test('high-head keeps CH-01 in operation while the mode is alarm', () => {
  const controller = new PlantController({ seed: 0 })
  controller.injectIncident('high-head')
  assert.equal(controller.running, true)
  assert.equal(controller.snapshot.ch01.mode, 'alarm')
  assert.equal(controller.snapshot.ch01.mbc, 'LEVITATED')
})

test('bms-fight swings lchltAct and leaves the setpoint in place', () => {
  const controller = new PlantController({ seed: 0 })
  const set = controller.snapshot.lchltSet
  controller.injectIncident('bms-fight')
  advance(controller, 3)
  const high = controller.snapshot.lchltAct
  assert.equal(controller.snapshot.lchltSet, set)
  advance(controller, 6)
  const low = controller.snapshot.lchltAct
  assert.equal(controller.snapshot.lchltSet, set)
  assert.ok(high > low + 2, `lchltAct ${high} vs ${low}`)
})

test('the snapshot stack and the action log are bounded', () => {
  const controller = new PlantController({ seed: 0 })
  for (let i = 0; i < 25; i += 1) {
    if (i % 2 === 0) controller.startChiller('CH-02')
    else controller.stopChiller('CH-02', 'soft')
  }
  assert.equal(controller.stackDepth, SNAPSHOT_STACK_DEPTH)
  let undos = 0
  while (controller.undo().ok) undos += 1
  assert.equal(undos, SNAPSHOT_STACK_DEPTH)
  const logged = new PlantController({ seed: 0 })
  for (let i = 0; i < ACTION_LOG_LIMIT + 5; i += 1) logged.setOutdoorDryBulb(20 + (i % 40))
  assert.equal(logged.getActionLog().length, ACTION_LOG_LIMIT)
})

test('the action log and alarm tools list the rows', () => {
  const controller = new PlantController({ seed: 0 })
  const tools = createYorkTools(controller)
  assert.equal(tools.call('plant.getActionLog').message, 'The action log is empty.')
  assert.equal(tools.call('plant.getAlarms').message, 'No active alarm.')
  controller.setValve('chw', 40, 'user')
  controller.setWeather('hot', 'ai')
  const log = tools.call('plant.getActionLog').message
  assert.match(log, /user setValve loop=chw pct=40/)
  assert.match(log, /ai setWeather preset=hot/)
  assert.equal(log.includes('2 actions.'), false)
  controller.injectIncident('hall-hot', 'user')
  const alarms = tools.call('plant.getAlarms').message
  assert.match(alarms, /The hall is hot/)
  assert.match(alarms, /The incident is active/)
  assert.notEqual(alarms, 'No alarm.')
})

test('the action log records actor, args, and both snapshots', () => {
  const controller = new PlantController({ seed: 0 })
  controller.setValve('cw', 50, 'ai')
  const [row] = controller.getActionLog()
  assert.equal(row.actor, 'ai')
  assert.equal(row.action, 'setValve')
  assert.deepEqual(row.args, { loop: 'cw', pct: 50 })
  assert.equal(row.snapshotBefore.cwValvePct, 78)
  assert.equal(row.snapshotAfter.cwValvePct, 50)
  assert.equal(typeof row.t, 'number')
})

test('change fires once per action and not on tick', () => {
  const controller = new PlantController({ seed: 0 })
  let fires = 0
  controller.addEventListener('change', () => {
    fires += 1
  })
  controller.setValve('chw', 60)
  controller.tick(1)
  assert.equal(fires, 1)
})

test('a tool call and a controller call produce the same snapshot', () => {
  const direct = new PlantController({ seed: 1 })
  const viaTool = new PlantController({ seed: 1 })
  const tools = createYorkTools(viaTool)
  direct.setOutdoorDryBulb(88)
  const result = tools.call('plant.setOutdoorDryBulb', { f: 88 }, 'ai')
  assert.equal(result.ok, true)
  assert.deepEqual(direct.snapshot, viaTool.snapshot)
  direct.startChiller('CH-02')
  tools.call('chiller.start', { unit: 'CH-02' }, 'ai')
  assert.deepEqual(direct.snapshot, viaTool.snapshot)
})

test('unknown unit ids do not change the plant', () => {
  const controller = new PlantController({ seed: 0 })
  const before = controller.snapshot
  const result = controller.startChiller('CH-99')
  assert.equal(result.ok, false)
  assert.equal(controller.snapshot.units.length, before.units.length)
  assert.equal(controller.unitRunning('CH-01'), true)
})

test('outdoor air moves unpinned targets, and a conflicting LCHLT raises an alarm', () => {
  const controller = new PlantController({ seed: 0 })
  assert.equal(controller.snapshot.lchltSet, 55)
  assert.equal(controller.snapshot.lchltTargetF, 55)
  assert.equal(controller.snapshot.alarm, null)

  controller.setOutdoorDryBulb(40)
  assert.equal(controller.snapshot.lchltSet, 60)
  assert.equal(controller.snapshot.lchltTargetF, 60)
  assert.equal(controller.snapshot.chwValvePct, 51)
  assert.equal(controller.snapshot.cwValvePct, 70)
  assert.equal(controller.snapshot.glycolValvePct, 90)
  assert.equal(controller.snapshot.alarm, null)

  controller.setLchltSetpoint(64)
  assert.equal(controller.snapshot.lchltSet, 64)
  assert.match(controller.snapshot.alarm ?? '', /LCHLT setpoint fights/)

  controller.setOutdoorDryBulb(100)
  assert.equal(controller.snapshot.lchltSet, 64)
  assert.equal(controller.snapshot.lchltTargetF, 50)
  assert.equal(controller.snapshot.glycolValvePct, 25)
  assert.match(controller.snapshot.alarm ?? '', /LCHLT setpoint fights/)

  controller.setLchltSetpoint(50)
  assert.equal(controller.snapshot.lchltSet, 50)
  assert.equal(controller.snapshot.alarm, null)
})

test('outdoor bands change at 48/49 and 91/92, and a pinned valve stays put', () => {
  const edges = new PlantController({ seed: 0 })
  edges.setOutdoorDryBulb(48)
  assert.equal(edges.snapshot.lchltTargetF, 60)
  assert.equal(edges.snapshot.lchltSet, 60)
  edges.setOutdoorDryBulb(49)
  assert.equal(edges.snapshot.lchltTargetF, 55)
  assert.equal(edges.snapshot.lchltSet, 55)
  edges.setOutdoorDryBulb(91)
  assert.equal(edges.snapshot.lchltTargetF, 55)
  assert.equal(edges.snapshot.lchltSet, 55)
  edges.setOutdoorDryBulb(92)
  assert.equal(edges.snapshot.lchltTargetF, 50)
  assert.equal(edges.snapshot.lchltSet, 50)

  const pinned = new PlantController({ seed: 0 })
  pinned.setValve('chw', 80)
  pinned.setValve('cw', 78)
  pinned.setValve('gly', 40)
  pinned.setOutdoorDryBulb(40)
  assert.equal(pinned.snapshot.chwValvePct, 80)
  assert.equal(pinned.snapshot.cwValvePct, 70)
  assert.equal(pinned.snapshot.glycolValvePct, 40)
  assert.match(pinned.snapshot.alarm ?? '', /CHW valve fights/)
})

test('a pinned CW valve on a hot day raises a trainer alarm', () => {
  const controller = new PlantController({ seed: 0 })
  controller.setOutdoorDryBulb(100)
  controller.setValve('cw', 50)
  assert.equal(controller.snapshot.cwValvePct, 50)
  assert.match(controller.snapshot.alarm ?? '', /CW valve fights/)
})

test('a capacity alarm stays visible when the LCHLT setpoint also fights', () => {
  const controller = new PlantController({ seed: 0 })
  controller.setItLoad({ targetMw: 8 })
  controller.setLchltSetpoint(64)
  assert.match(controller.snapshot.alarm ?? '', /running chiller capacity/)
})

test('a pinned open glycol valve on a hot day raises a trainer alarm', () => {
  const controller = new PlantController({ seed: 0 })
  controller.setOutdoorDryBulb(100)
  controller.setValve('gly', 80)
  assert.equal(controller.snapshot.glycolValvePct, 80)
  assert.match(controller.snapshot.alarm ?? '', /glycol valve fights/)
})

test('every incident-clock case maps once, including bms-fight', () => {
  for (const item of TROUBLE_CASES) {
    assert.equal(isTroubleCaseId(item.id), true, item.id)
  }
  assert.equal(TROUBLE_CASES.length, 5)
})
