#!/usr/bin/env node
/**
 * Print the screen snapshot and the plant.getSnapshot tool result the web client sends.
 * Run: node --experimental-strip-types scripts/real-snapshot.mjs [hall-hot]
 * The optional fault is a trainer incident. hall-hot also sets the CHW valve to 40%.
 */
import { fileURLToPath } from 'node:url'
import { captureScreenSnapshot, defaultHomeInput } from '../../york-chiller/src/chat/snapshot.ts'
import { PlantController } from '../../york-chiller/src/sim/controller.ts'
import { isIncidentKind } from '../../york-chiller/src/sim/plantSim.ts'
import { createYorkTools } from '../../york-chiller/src/sim/tools.ts'

const READS = ['plant.getSnapshot', 'plant.getActionLog', 'plant.getAlarms', 'plant.explain']

function plantFor(fault) {
  const controller = new PlantController()
  if (!fault) return controller
  if (!isIncidentKind(fault)) throw new Error(`unknown fault ${fault}`)
  controller.injectIncident(fault, 'user')
  if (fault === 'hall-hot') controller.setValve('chw', 40, 'user')
  return controller
}

function toolRow(tools, name) {
  const called = tools.call(name, {}, 'ai')
  return { name, ok: called.ok, message: called.message }
}

export function realSnapshot(fault = '') {
  const controller = plantFor(fault)
  const tools = createYorkTools(controller)
  return {
    snapshot: captureScreenSnapshot(defaultHomeInput(controller)),
    toolResults: READS.map((name) => toolRow(tools, name)),
  }
}

function main() {
  const fault = process.argv[2] ?? ''
  process.stdout.write(`${JSON.stringify(realSnapshot(fault))}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
