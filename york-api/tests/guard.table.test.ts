import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { polishAnswer } from '../src/finish.ts'

/**
 * Permanent D8–D30 examples. Each row is the raw reply and the text the full
 * guard keeps when the corpus is the real home snapshot from real-snapshot.mjs.
 */
const rows = [
  ['d8-empty-leaf', 'PUMPS', ''],
  ['d8-sibling-removed', 'PUMPS\nThe count is 99.\nCHILLERS\n1. Open the valve.', 'CHILLERS\n1. Open the valve. Live numbers are trainer-model values.'],
  ['d8-step-then-empty-sibling', 'PUMPS\n1. Open the valve.\n\nFANS', 'PUMPS\n1. Open the valve. Live numbers are trainer-model values.'],
  ['d8-empty-child', 'PUMPS\nFANS', 'PUMPS'],
  ['d8-hour-is-subheading', 'Eight-hour checklist\nHour 0 to 1\n1. Open the valve.', 'Eight-hour checklist\nHour 0 to 1\n1. Open the valve. Live numbers are trainer-model values.'],
  ['d8r-empty-bold', '**Pumps**', ''],
  ['d8r-bold-kept', '**Pumps**\n1. Open the valve.', '**Pumps**\n1. Open the valve. Live numbers are trainer-model values.'],
  ['d8r-bold-emptied', '**Pumps**\nThe count is 99.', ''],
  ['d9-heading-exempt', 'WHAT WAS DONE (from the OptiView log)\nOpen the valve.', 'WHAT WAS DONE (from the OptiView log)\nOpen the valve.'],
  ['d9-passive-drops', 'The valve was closed by the operator.', ''],
  ['d10-balanced-quote', 'The alarm says "Low head. Check the pump."', 'The alarm says "Low head. Check the pump."'],
  ['d10-bullet-quote', '- The alarm says "Low head.\nCheck the pump."', '- The alarm says "Low head.\nCheck the pump."'],
  ['d11-bullet-number', '- The count is 99. Open the valve.', '- Open the valve.'],
  ['d12-unicode-equation', 'The gap is 12.8 (17 − 4.2 = 12.8).', 'The gap is 12.8 (17 − 4.2 = 12.8). Live numbers are trainer-model values.'],
  ['d12-untraced-input', 'CHW dP is 7.5 psi below target (17 − 9.5 = 7.5).', ''],
  ['d13-orphan-reason', 'Open the valve. The valve was closed by the operator. Reason: The spare is ready.\n3. Read the hall.', 'Open the valve.\n3. Read the hall. Live numbers are trainer-model values.'],
  ['d14-label-stays-off-new-topic', 'Chilled-water loop: valve at 99. The hall is warm.', 'The hall is warm.'],
  ['d14-bullet-label-moves', '- Chilled-water loop: valve at 99. Supply 4.2 psig.', '- Chilled-water loop: Supply 4.2 psig. Live numbers are trainer-model values.'],
  ['d15-multiply-first', 'The product is 21.0 (4.2 * 5 = 21.0).', 'The product is 21.0 (4.2 * 5 = 21.0). Live numbers are trainer-model values.'],
  ['d15-wrong-product', 'The product is 20.0 (4.2 * 5 = 20.0).', ''],
  ['d15-add-chain', 'The balance is 5 (5 + 5 - 5 = 5).', 'The balance is 5 (5 + 5 - 5 = 5). Live numbers are trainer-model values.'],
  ['b10-psi-wrong', '(17 psi - 9.5 psi = 9.5 psi)', ''],
  ['b10-n-plus-wrong', 'N+1 spare is 5 MW (5 MW + 5 MW = 5 MW)', ''],
  ['b10-mw-kept', '(5 MW - 4.2 MW = 0.8 MW)', '(5 MW - 4.2 MW = 0.8 MW) Live numbers are trainer-model values.'],
  ['b10-mixed-units', '5 MW + 3 psi = 8', ''],
  ['b10-unparsed-equals', 'The gap is 5 foo = 3.', ''],
  ['z16-result-unit', '5 - 4.2 = 0.8 MW', '5 - 4.2 = 0.8 MW Live numbers are trainer-model values.'],
  ['z16-gauge-diff', '52 psig - 17 psig = 35 psi', '52 psig - 17 psig = 35 psi Live numbers are trainer-model values.'],
  ['z16-gauge-as-psig', '52 psig - 17 psig = 35 psig', ''],
  ['z16-missing-result-unit', '5 MW - 4.2 MW = 0.8', ''],
  ['b12-set', 'set = 55 F', 'set = 55 F Live numbers are trainer-model values.'],
  ['b12-target', '(target = 55 F)', '(target = 55 F) Live numbers are trainer-model values.'],
  ['b12-hour-t', 'Hour 2 (t=8)', 'Hour 2 (t=8) Live numbers are trainer-model values.'],
  ['b12-unicode-result', '(4.2 - 5 = \u22120.8)', '(4.2 - 5 = \u22120.8) Live numbers are trainer-model values.'],
  ['b12-chain', '(5 + 5 = 10) (10 - 5 = 5)', '(5 + 5 = 10) (10 - 5 = 5) Live numbers are trainer-model values.'],
  ['b12-chain-mid', '(5 + 4.2 = 9.2) (9.2 - 5 = 4.2)', '(5 + 4.2 = 9.2) (9.2 - 5 = 4.2) Live numbers are trainer-model values.'],
  ['d16-shift-start', 'Eight-hour checklist\nShift start\n1. Open the valve.', 'Eight-hour checklist\nShift start\n1. Open the valve. Live numbers are trainer-model values.'],
  ['d16r2-later-section', 'Eight-hour checklist\nShift start\n1. Check pump 3 (untraced)\nMid shift\n2. Log it', 'Eight-hour checklist\nMid shift\n2. Log it Live numbers are trainer-model values.'],
  ['d21-caps-stack', 'CHECKLIST\nSHIFT START\n1. Open the valve.', 'CHECKLIST\nSHIFT START\n1. Open the valve. Live numbers are trainer-model values.'],
  ['d21-eight-hour-caps', 'EIGHT-HOUR CHECKLIST\nShift start\n1. Open the valve.', 'EIGHT-HOUR CHECKLIST\nShift start\n1. Open the valve. Live numbers are trainer-model values.'],
  ['d21-blank-line', 'Eight-hour checklist\n\nShift start\n1. Open the valve.', 'Eight-hour checklist\n\nShift start\n1. Open the valve. Live numbers are trainer-model values.'],
  ['d21-bold-parent', '**Pumps**\nCHILLERS\n1. Open the valve.', '**Pumps**\nCHILLERS\n1. Open the valve. Live numbers are trainer-model values.'],
  ['d21-bold-blank', '**Pumps**\n\nCHILLERS\n1. Open the valve.', '**Pumps**\n\nCHILLERS\n1. Open the valve. Live numbers are trainer-model values.'],
  ['d21-hash-nest', '# Eight-hour checklist\n## Shift start\n1. Open the valve.', '# Eight-hour checklist\n## Shift start\n1. Open the valve. Live numbers are trainer-model values.'],
  ['d21-hash-blank', '# Eight-hour checklist\n\n## Shift start\n1. Open the valve.', '# Eight-hour checklist\n\n## Shift start\n1. Open the valve. Live numbers are trainer-model values.'],
  ['d21-pumps-chillers', 'PUMPS\nCHILLERS\n- Open the valve.', 'PUMPS\nCHILLERS\n- Open the valve.'],
  ['d21-emptied-bold-pair', '**Pumps**\nThe count is 99.\n**Alarms**\nThe count is 88.', ''],
  ['d21-emptied-parent', 'Eight-hour checklist\nShift start\nThe count is 99.', ''],
  ['d24-chillers-after-blank', 'Eight-hour checklist\nShift start\n1. Check pump 3 (untraced)\n\nCHILLERS\n- CH-01', 'CHILLERS\n- CH-01'],
  ['d24-mid-after-content', 'Shift start\nFirst hour\n1. Check pump 3 (untraced)\nMid shift\n2. ok', 'Shift start\nMid shift\n2. ok Live numbers are trainer-model values.'],
  ['d24-hour-subheading', 'Eight-hour checklist\nHour 0 to 1\n1. Check pump 3 (untraced)\nMid shift\n2. Log it', 'Eight-hour checklist\nMid shift\n2. Log it Live numbers are trainer-model values.'],
  ['d27-plant', '# Plant\n## Pumps\n- Pump 3 runs.\n## Chillers\n- CH-01', '# Plant\n## Chillers\n- CH-01'],
  ['d27-title', '# Eight-hour checklist\n## Shift start\n1. Check pump 3 (untraced)\n## Mid shift\n2. Log it', '# Eight-hour checklist\n## Mid shift\n2. Log it Live numbers are trainer-model values.'],
  ['d27-title-blank', '# Eight-hour checklist\n\n## Shift start\n1. Check pump 3 (untraced)\n\n## Mid shift\n2. Log it', '# Eight-hour checklist\n\n## Mid shift\n2. Log it Live numbers are trainer-model values.'],
  ['d11-schedule', 'Hour 2 to 4. Check the tower every 2 hours.', 'Hour 2 to 4. Check the tower every 2 hours. Live numbers are trainer-model values.'],
  ['d11-command-follows-step', '1. A.\n2. The count is 9.\nStart it later.\n3. C.', '1. A.\n3. C. Live numbers are trainer-model values.'],
  ['d16r2-bold', '**Eight-hour checklist**\nShift start\n1. Check pump 3 (untraced)\nMid shift\n2. Log it', '**Eight-hour checklist**\nMid shift\n2. Log it Live numbers are trainer-model values.'],
  ['d16r2-bold-blank', '**Eight-hour checklist**\n\n**Shift start**', '**Eight-hour checklist**'],
  ['d28-hour-after-prose', 'The hall is warm.\nHour 0 to 1\n1. ok\nHour 1 to 2\n2. Check pump 3', 'The hall is warm.\nHour 0 to 1\n1. ok Live numbers are trainer-model values.'],
  ['d29-passive-section', '**Pumps**\n- The valve was opened by the operator.\n\n**Chillers**\n- CH-01 runs.', '**Chillers**\n- CH-01 runs.'],
  ['d29-quote-section', 'ALARMS\nThe alarm says "Low head.\nCHILLERS\n- Open the valve.', 'CHILLERS\n- Open the valve.'],
] as const

function realHomeSnapshot(): { view: string; plant: { chwValvePct: number } } {
  const script = fileURLToPath(new URL('../scripts/real-snapshot.mjs', import.meta.url))
  const run = spawnSync(process.execPath, ['--experimental-strip-types', script], { encoding: 'utf8', maxBuffer: 8_000_000 })
  assert.equal(run.status, 0, run.stderr)
  const body = JSON.parse(run.stdout) as { snapshot: { view: string; plant: { chwValvePct: number } } }
  return body.snapshot
}

test('guard table keeps every D8 to D30 example against the real snapshot', () => {
  const snapshot = realHomeSnapshot()
  assert.equal(snapshot.view, 'home')
  assert.equal(typeof snapshot.plant.chwValvePct, 'number')
  for (const [name, raw, out] of rows) {
    assert.equal(polishAnswer(raw, [], [], snapshot).answer, out, name)
  }
})

const LIVE = ' Live numbers are trainer-model values.'

/** Readings for D34 and the unit rules. 34 and 40 are absent from the home snapshot. */
const ruledSnapshot = {
  units: [{ id: 'CH-01', running: true, mode: 'lead', rla: 34, capacityMw: 5 }],
  plant: {
    itLoadMw: 4.2,
    chwValvePct: 40,
    chwDpPsi: 52,
    chwDpTargetPsi: 42.5,
    towerFanPct: 2,
    condTons: 500,
    span: 1000,
    noise: 9.2,
    extra: 3,
    other: 8,
    head: 17,
    gap: 9.5,
    low: 12.5,
  },
}

const ruled = [
  ['d34-since-t', 'CH-01 runs at 34% FLA since t=0.', `CH-01 runs at 34% FLA since t=0.${LIVE}`],
  ['d34-valve-t', 'The CHW valve went to 40% open at t=0.', `The CHW valve went to 40% open at t=0.${LIVE}`],
  ['d34-rla', 'CH-01 runs at 34% FLA with rla=34.', `CH-01 runs at 34% FLA with rla=34.${LIVE}`],
  ['d34-reason-t', 'Reason: The logged command set 40% open at t=0.', `Reason: The logged command set 40% open at t=0.${LIVE}`],
  ['d34-key-value', 'The gap is 5 foo = 3.', `The gap is 5 foo = 3.${LIVE}`],
  ['z16-result-only', '5 - 4.2 = 0.8 MW', `5 - 4.2 = 0.8 MW${LIVE}`],
  ['z16-psig-diff', '52 psig - 42.5 psig = 9.5 psi', `52 psig - 42.5 psig = 9.5 psi${LIVE}`],
  ['z16-unitless-mul', '500 tons * 2 = 1000 tons', `500 tons * 2 = 1000 tons${LIVE}`],
  ['z16-unitless-mul-left', '2 * 500 tons = 1000 tons', `2 * 500 tons = 1000 tons${LIVE}`],
  ['z16-unitless-div', '1000 tons / 2 = 500 tons', `1000 tons / 2 = 500 tons${LIVE}`],
  ['z16-same-add', '5 psig + 4.2 psig = 9.2 psig', `5 psig + 4.2 psig = 9.2 psig${LIVE}`],
  ['z16-mixed-add', '5 MW + 3 psi = 8', ''],
  ['z16-gauge-result-psig', '52 psig - 42.5 psig = 9.5 psig', ''],
  ['z16-bare-result', '5 MW - 4.2 MW = 0.8', ''],
  ['z16-add-bare-result', '5 MW + 3 MW = 8', ''],
  ['z16-mixed-mul', '500 tons * 2 psi = 1000 psi', ''],
  ['z16-one-sided-add', '5 MW + 4.2 = 9.2 MW', ''],
  ['z16-leftover-op', 'The gap is 5 + 4.2 foo = 9.2.', `The gap is 5 + 4.2 foo = 9.2.${LIVE}`],
  ['z16-bare-left', 'The total is 5 + 4.2 = foo.', ''],
  ['z16-unicode-75', '(5 - 12.5 = \u22127.5)', `(5 - 12.5 = \u22127.5)${LIVE}`],
  ['z16-wrong-psi', '(17 psi - 9.5 psi = 9.5 psi)', ''],
] as const

test('guard table keeps t=N, key=value, a gauge difference, a result unit, and a unitless factor', () => {
  for (const [name, raw, out] of ruled) {
    assert.equal(polishAnswer(raw, [], [], ruledSnapshot).answer, out, name)
  }
})
