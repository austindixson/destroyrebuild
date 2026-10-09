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
