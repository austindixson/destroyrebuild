import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dropUntracedNumbers } from '../src/guard.ts'

/**
 * Permanent heading and number examples from D8 through D25.
 * Each row is the raw reply, the corpus, and the text that must remain.
 */
const rows = [
  ['d8-empty-leaf', 'PUMPS', '', ''],
  ['d8-sibling-removed', 'PUMPS\nThe count is 99.\nCHILLERS\n1. Open the valve.', '', 'CHILLERS\n1. Open the valve.'],
  ['d8-step-then-empty-sibling', 'PUMPS\n1. Open the valve.\n\nFANS', '', 'PUMPS\n1. Open the valve.'],
  ['d8-empty-child', 'PUMPS\nFANS', '', 'PUMPS'],
  ['d8-hour-is-body', 'Eight-hour checklist\nHour 0 to 1\n1. Open the valve.', '', 'Eight-hour checklist\nHour 0 to 1\n1. Open the valve.'],
  ['d8r-empty-bold', '**Pumps**', '', ''],
  ['d8r-bold-kept', '**Pumps**\n1. Open the valve.', '', '**Pumps**\n1. Open the valve.'],
  ['d8r-bold-emptied', '**Pumps**\nThe count is 99.', '', ''],
  ['d14-label-stays-off-new-topic', 'Chilled-water loop: valve at 99. The hall is warm.', '', 'The hall is warm.'],
  ['d14-bullet-label-moves', '- Chilled-water loop: valve at 40% open (untraced 99). Supply 42.5 psig.', '42.5', '- Chilled-water loop: Supply 42.5 psig.'],
  ['d15-multiply-first', 'The product is 14.2 (4.2 + 5 * 2 = 14.2).', '4.2 5 2', 'The product is 14.2 (4.2 + 5 * 2 = 14.2).'],
  ['d15-wrong-product', 'The product is 18.4 (4.2 + 5 * 2 = 18.4).', '4.2 5 2', ''],
  ['d15-add-chain', 'The balance is 5 (5 + 5 - 5 = 5).', '5', 'The balance is 5 (5 + 5 - 5 = 5).'],
  ['d16-shift-start', 'Eight-hour checklist\nShift start\n1. Open the valve.', '', 'Eight-hour checklist\nShift start\n1. Open the valve.'],
  ['d16r-parent-with-step', 'Eight-hour checklist\nShift start\n1. Open the valve.', '', 'Eight-hour checklist\nShift start\n1. Open the valve.'],
  ['d16r2-later-section', 'Eight-hour checklist\nShift start\n1. Check pump 3 (untraced)\nMid shift\n2. Log it', '', 'Mid shift\n2. Log it'],
  ['d21-caps-stack', 'CHECKLIST\nSHIFT START\n1. Open the valve.', '', 'CHECKLIST\nSHIFT START\n1. Open the valve.'],
  ['d21-eight-hour-caps', 'EIGHT-HOUR CHECKLIST\nShift start\n1. Open the valve.', '', 'EIGHT-HOUR CHECKLIST\nShift start\n1. Open the valve.'],
  ['d21-blank-line', 'Eight-hour checklist\n\nShift start\n1. Open the valve.', '', 'Eight-hour checklist\n\nShift start\n1. Open the valve.'],
  ['d21-bold-parent', '**Pumps**\nCHILLERS\n1. Open the valve.', '', '**Pumps**\nCHILLERS\n1. Open the valve.'],
  ['d21-hash-nest', '# Eight-hour checklist\n## Shift start\n1. Open the valve.', '', '# Eight-hour checklist\n## Shift start\n1. Open the valve.'],
  ['d21-pumps-chillers', 'PUMPS\nCHILLERS\n- Open the valve.', '', 'PUMPS\nCHILLERS\n- Open the valve.'],
  ['d21-pumps-fans-step', 'PUMPS\nFANS\n1. Open the valve.', '', 'PUMPS\nFANS\n1. Open the valve.'],
  ['d21-emptied-bold-pair', '**Pumps**\nThe count is 99.\n**Alarms**\nThe count is 88.', '', ''],
  ['d21-emptied-parent', 'Eight-hour checklist\nShift start\nThe count is 99.', '', ''],
  ['d24-chillers-after-blank', 'Eight-hour checklist\nShift start\n1. Check pump 3 (untraced)\n\nCHILLERS\n- CH-01', '', 'CHILLERS\n- CH-01'],
  ['d24-mid-after-content', 'Shift start\nFirst hour\n1. Check pump 3 (untraced)\nMid shift\n2. ok', '', 'Mid shift\n2. ok'],
  ['d24-emptied-hash', '## Pumps\nThe count is 99.\nCHILLERS\n- Open the valve.', '', 'CHILLERS\n- Open the valve.'],
] as const

test('guard table keeps every D8 to D25 example', () => {
  for (const [name, raw, corpus, out] of rows) {
    assert.equal(dropUntracedNumbers(raw, corpus), out, name)
  }
})
