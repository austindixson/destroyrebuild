import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

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
})
