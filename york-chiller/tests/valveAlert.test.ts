import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  dismissValveAlert,
  reduceValveAlert,
  seedValveAlert,
  valveZone,
  type ValveAlertState,
  type ValveReading,
} from '../src/sim/valveAlert'

function reading(patch: Partial<ValveReading> = {}): ValveReading {
  return { chw: 72, cw: 78, gly: 70, oatF: 75, ...patch }
}

function step(state: ValveAlertState, patch: Partial<ValveReading>) {
  return reduceValveAlert(state, reading(patch))
}

test('steady red marks are the valve thresholds', () => {
  assert.equal(valveZone('chw', 40, 75), 'low')
  assert.equal(valveZone('chw', 41, 75), 'ok')
  assert.equal(valveZone('chw', 92, 75), 'ok')
  assert.equal(valveZone('chw', 93, 75), 'high')
  assert.equal(valveZone('cw', 43, 75), 'low')
  assert.equal(valveZone('cw', 44, 75), 'ok')
  assert.equal(valveZone('cw', 45, 75), 'ok')
  assert.equal(valveZone('cw', 100, 75), 'ok')
  assert.equal(valveZone('gly', 15, 49), 'ok')
  assert.equal(valveZone('gly', 15, 48), 'low')
  assert.equal(valveZone('gly', 90, 48), 'ok')
  assert.equal(valveZone('gly', 15, 20), 'ok')
  assert.equal(valveZone('gly', 22, 40), 'low')
  assert.equal(valveZone('gly', 23, 40), 'ok')
})

test('a red entry alerts once, and later ticks in that zone do not enter again', () => {
  let state = seedValveAlert(reading())
  const first = step(state, { chw: 30 })
  assert.equal(first.entered, true)
  assert.equal(first.show?.loop, 'chw')
  assert.equal(first.show?.zone, 'low')
  assert.match(first.show?.text ?? '', /hall supply temperature rises/)
  assert.match(first.show?.text ?? '', /too far closed/)
  assert.match(first.show?.text ?? '', /trainer limit of 12 psi/)
  assert.doesNotMatch(first.show?.text ?? '', /%RLA|%TSLA|freeze|flow switch/)

  const held = [25, 20, 15].reduce((current, chw) => {
    const next = step(current, { chw })
    assert.equal(next.entered, false)
    assert.equal(next.show?.text, first.show?.text)
    return next.state
  }, first.state)

  const dismissed = dismissValveAlert(held)
  const stillRed = step(dismissed, { chw: 16 })
  assert.equal(stillRed.entered, false)
  assert.equal(stillRed.show, null)

  const left = step(stillRed.state, { chw: 72 })
  assert.equal(left.entered, false)
  assert.equal(left.show, null)

  const again = step(left.state, { chw: 30 })
  assert.equal(again.entered, true)
  assert.equal(again.show?.zone, 'low')
})

test('leaving red clears the alert, and another red valve downgrades the panel', () => {
  let state = seedValveAlert(reading())
  const chw = step(state, { chw: 20 })
  assert.equal(chw.entered, true)
  const both = step(chw.state, { chw: 20, cw: 30 })
  assert.equal(both.entered, true)
  assert.equal(both.show?.loop, 'cw')
  assert.match(both.show?.text ?? '', /CW return temperature rise/)
  assert.match(both.show?.text ?? '', /trainer limit of 8 psi/)
  assert.doesNotMatch(both.show?.text ?? '', /approach/)
  assert.match(both.show?.text ?? '', /cooling tower flow is low/)

  const chwLeft = step(both.state, { chw: 72, cw: 30 })
  assert.equal(chwLeft.entered, false)
  assert.equal(chwLeft.show?.loop, 'cw')

  const clear = step(chwLeft.state, { cw: 78 })
  assert.equal(clear.entered, false)
  assert.equal(clear.show, null)

  const high = step(clear.state, { chw: 100 })
  assert.equal(high.entered, true)
  assert.equal(high.show?.zone, 'high')
  assert.match(high.show?.text ?? '', /trainer limit of 24 psi/)
  assert.match(high.show?.text ?? '', /restriction/)

  const cwStill = step(high.state, { chw: 72, cw: 30 })
  const chwAgain = step(cwStill.state, { chw: 20, cw: 30 })
  assert.equal(chwAgain.show?.loop, 'chw')
  const downgrade = step(chwAgain.state, { chw: 72, cw: 30 })
  assert.equal(downgrade.entered, false)
  assert.equal(downgrade.show?.loop, 'cw')
  assert.match(downgrade.show?.text ?? '', /CW return temperature rise/)
})

test('glycol red follows outdoor temperature and does not repeat while the valve stays shut', () => {
  let state = seedValveAlert(reading({ gly: 15, oatF: 75 }))
  const hot = step(state, { gly: 15, oatF: 100 })
  assert.equal(hot.entered, false)
  assert.equal(hot.show, null)

  const cold = step(hot.state, { gly: 15, oatF: 40 })
  assert.equal(cold.entered, true)
  assert.equal(cold.show?.loop, 'gly')
  assert.match(cold.show?.text ?? '', /dry cooler is low/)
  assert.match(cold.show?.text ?? '', /trainer limit of 8 psi/)

  const held = step(cold.state, { gly: 16, oatF: 40 })
  assert.equal(held.entered, false)
  assert.equal(held.show?.text, cold.show?.text)

  const open = step(held.state, { gly: 90, oatF: 40 })
  assert.equal(open.show, null)
})

test('two valves that enter red on the same tick show the later loop', () => {
  const state = seedValveAlert(reading())
  const both = step(state, { chw: 20, cw: 30 })
  assert.equal(both.entered, true)
  assert.equal(both.show?.loop, 'cw')
  assert.match(both.show?.text ?? '', /CW return temperature rise/)
})

test('hall-hot 9.5 psi does not raise a valve alert that contradicts the board', () => {
  const state = seedValveAlert(reading())
  const hot = step(state, { chwDp: 9.5 })
  assert.equal(hot.entered, false)
  assert.equal(hot.show, null)

  const wide = step(hot.state, { chw: 100, chwDp: 9.5 })
  assert.equal(wide.entered, false)
  assert.equal(wide.show, null)

  const shut = step(wide.state, { chw: 20, chwDp: 9.5 })
  assert.equal(shut.entered, true)
  assert.equal(shut.show?.zone, 'low')
  assert.match(shut.show?.text ?? '', /trainer limit of 12 psi/)
})
