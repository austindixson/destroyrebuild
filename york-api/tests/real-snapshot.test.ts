import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { jsonWithin, withNPlusOne } from '../src/prompt.ts'

function runSnapshot(fault = '') {
  const script = fileURLToPath(new URL('../scripts/real-snapshot.mjs', import.meta.url))
  const args = ['--experimental-strip-types', script]
  if (fault) args.push(fault)
  return spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 8_000_000 })
}

test('the real snapshot is the trainer capture, including hall-hot at 40 percent', () => {
  const source = readFileSync(fileURLToPath(new URL('../scripts/real-snapshot.mjs', import.meta.url)), 'utf8')
  assert.match(source, /captureScreenSnapshot/)
  assert.match(source, /createYorkTools/)
  assert.match(source, /PlantController/)
  const calm = runSnapshot()
  assert.equal(calm.status, 0, calm.stderr)
  const home = JSON.parse(calm.stdout) as {
    snapshot: { incident: string | null; view: string; plant: { chwValvePct: number }; blocksWrites: boolean }
    toolResults: { name: string; ok: boolean; message: string }[]
  }
  assert.equal(home.snapshot.view, 'home')
  assert.equal(home.snapshot.incident, null)
  assert.equal(home.snapshot.blocksWrites, false)
  assert.equal(typeof home.snapshot.plant.chwValvePct, 'number')
  const snap = home.toolResults.find((row) => row.name === 'plant.getSnapshot')
  assert.deepEqual(snap, { name: 'plant.getSnapshot', ok: true, message: 'Snapshot.' })
  const hotRun = runSnapshot('hall-hot')
  assert.equal(hotRun.status, 0, hotRun.stderr)
  const hot = JSON.parse(hotRun.stdout) as {
    snapshot: { incident: string; plant: { chwValvePct: number }; shown: { chaos: string } }
  }
  assert.equal(hot.snapshot.incident, 'hall-hot')
  assert.equal(hot.snapshot.plant.chwValvePct, 40)
  assert.match(hot.snapshot.shown.chaos, /Hot hall, low chiller load/)
  const checklist = readFileSync(fileURLToPath(new URL('../scripts/real-call-checklist.mjs', import.meta.url)), 'utf8')
  assert.match(checklist, /real-snapshot\.mjs/)
  assert.match(checklist, /tail -c \+/)
  assert.equal(checklist.includes('~/.ssh/york-canary.txt'), false)
  const unit = (home.snapshot as { units?: { id: string }[] }).units?.[0]
  assert.ok(unit)
  let count = 45
  let wide: { units: { id: string }[] } = { ...home.snapshot, units: Array.from({ length: count }, () => unit) }
  while (JSON.stringify(wide).length <= 12_000 && count < 400) {
    count += 15
    wide = { ...home.snapshot, units: Array.from({ length: count }, () => unit) }
  }
  assert.ok(JSON.stringify(wide).length > 12_000)
  const late = { units: wide.units, nPlusOneSpareUnits: 7 }
  const cut = jsonWithin(late)
  assert.ok(cut.length <= 12_000)
  const parsed = JSON.parse(cut) as { units: { id: string }[]; nPlusOneSpareUnits: number }
  assert.ok(parsed.units.length >= 1)
  assert.equal(parsed.units[0].id, unit.id)
  assert.equal(parsed.nPlusOneSpareUnits, 7)
  const shaped = jsonWithin(withNPlusOne({ units: [{ running: true }, { running: true }], note: 'x'.repeat(20_000) }))
  const spare = JSON.parse(shaped) as { nPlusOneSpareUnits?: number }
  assert.equal(spare.nPlusOneSpareUnits, 1)
})
