/**
 * Dev tool registry for the Phase 0 controller.
 * Fans stay read-only: there is no plant.setFanOverride.
 * Confirm gates are enforced by the human UI before it calls a C tool.
 * This registry does not prompt. A later AI confirm card uses the same calls.
 *
 * fleet: N units — plant.configureFleet accepts a unit list. The board does not
 * draw a bank of 18 yet. The next slice adds lead/lag staging for N=18, then 36.
 */

import type { Actor, PlantController, PlantResult, StopMode, TimeScale, WeatherPreset } from './controller'
import type { ChillerUnitState, IncidentKind } from './plantSim'
import { isIncidentKind } from './plantSim'

export interface ToolResult {
  ok: boolean
  message: string
  snapshot: PlantResult['snapshot']
}

export interface YorkToolInfo {
  name: string
  gate: 'R' | 'W' | 'C'
  description: string
  parameters: Record<string, unknown>
}

export interface YorkToolbox {
  list: () => YorkToolInfo[]
  call: (name: string, args?: Record<string, unknown>, actor?: Actor) => ToolResult
}

type ToolRun = (controller: PlantController, args: Record<string, unknown>, actor: Actor) => ToolResult

interface ToolDef extends YorkToolInfo {
  run: ToolRun
}

function fromPlant(result: PlantResult): ToolResult {
  return { ok: result.ok, message: result.message, snapshot: result.snapshot }
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

const TOOLS: ToolDef[] = [
  {
    name: 'plant.getSnapshot',
    gate: 'R',
    description: 'Read the current trainer board.',
    parameters: { type: 'object', properties: {} },
    run: (controller) => fromPlant({ ok: true, message: 'Snapshot.', snapshot: controller.snapshot, running: controller.running }),
  },
  {
    name: 'plant.getActionLog',
    gate: 'R',
    description: 'Read the action log.',
    parameters: { type: 'object', properties: { sinceT: { type: 'number' } } },
    run: (controller, args) => {
      const since = num(args.sinceT)
      const rows = controller.getActionLog(since ?? undefined)
      return { ok: true, message: `${rows.length} actions.`, snapshot: controller.snapshot }
    },
  },
  {
    name: 'plant.getAlarms',
    gate: 'R',
    description: 'Read the alarm text and the OptiView log.',
    parameters: { type: 'object', properties: {} },
    run: (controller) => {
      const alarms = controller.getAlarms()
      return { ok: true, message: alarms.alarm ?? 'No alarm.', snapshot: controller.snapshot }
    },
  },
  {
    name: 'plant.explain',
    gate: 'R',
    description: 'Read the trainer reason text.',
    parameters: { type: 'object', properties: {} },
    run: (controller) => ({ ok: true, message: controller.snapshot.reason, snapshot: controller.snapshot }),
  },
  {
    name: 'plant.setWeather',
    gate: 'W',
    description: 'Set a weather preset.',
    parameters: { type: 'object', properties: { preset: { enum: ['cold', 'mild', 'hot'] } }, required: ['preset'] },
    run: (controller, args, actor) => {
      const preset = str(args.preset)
      if (preset !== 'cold' && preset !== 'mild' && preset !== 'hot') {
        return { ok: false, message: 'Use cold, mild, or hot.', snapshot: controller.snapshot }
      }
      return fromPlant(controller.setWeather(preset as WeatherPreset, actor))
    },
  },
  {
    name: 'plant.setOutdoorDryBulb',
    gate: 'W',
    description: 'Set the outdoor dry bulb in °F.',
    parameters: { type: 'object', properties: { f: { type: 'number', minimum: 20, maximum: 110 } }, required: ['f'] },
    run: (controller, args, actor) => {
      const f = num(args.f)
      if (f === null) return { ok: false, message: 'Give a dry bulb in °F.', snapshot: controller.snapshot }
      return fromPlant(controller.setOutdoorDryBulb(f, actor))
    },
  },
  {
    name: 'plant.setLchltSetpoint',
    gate: 'W',
    description: 'Set the LCHLT setpoint in °F.',
    parameters: { type: 'object', properties: { f: { type: 'number', minimum: 42, maximum: 65 } }, required: ['f'] },
    run: (controller, args, actor) => {
      const f = num(args.f)
      if (f === null) return { ok: false, message: 'Give a setpoint in °F.', snapshot: controller.snapshot }
      return fromPlant(controller.setLchltSetpoint(f, actor))
    },
  },
  {
    name: 'plant.setValve',
    gate: 'W',
    description: 'Set a header valve percent.',
    parameters: {
      type: 'object',
      properties: { loop: { enum: ['chw', 'cw', 'gly'] }, pct: { type: 'number' } },
      required: ['loop', 'pct'],
    },
    run: (controller, args, actor) => {
      const loop = str(args.loop)
      const pct = num(args.pct)
      if ((loop !== 'chw' && loop !== 'cw' && loop !== 'gly') || pct === null) {
        return { ok: false, message: 'Give a loop and a percent.', snapshot: controller.snapshot }
      }
      return fromPlant(controller.setValve(loop, pct, actor))
    },
  },
  {
    name: 'plant.setItLoad',
    gate: 'W',
    description: 'Set the IT load target in MW. Trainer value.',
    parameters: {
      type: 'object',
      properties: { deltaMw: { type: 'number' }, targetMw: { type: 'number' }, rampSeconds: { type: 'number' } },
    },
    run: (controller, args, actor) => {
      const deltaMw = num(args.deltaMw)
      const targetMw = num(args.targetMw)
      const rampSeconds = num(args.rampSeconds)
      if (deltaMw === null && targetMw === null) {
        return { ok: false, message: 'Give a target or a delta in MW.', snapshot: controller.snapshot }
      }
      return fromPlant(
        controller.setItLoad(
          {
            deltaMw: deltaMw ?? undefined,
            targetMw: targetMw ?? undefined,
            rampSeconds: rampSeconds ?? undefined,
          },
          actor,
        ),
      )
    },
  },
  {
    name: 'chiller.start',
    gate: 'W',
    description: 'Start a chiller by unit id.',
    parameters: { type: 'object', properties: { unit: { type: 'string' } }, required: ['unit'] },
    run: (controller, args, actor) => {
      const unit = str(args.unit)
      if (!unit) return { ok: false, message: 'Give a unit id.', snapshot: controller.snapshot }
      return fromPlant(controller.startChiller(unit, actor))
    },
  },
  {
    name: 'chiller.stop',
    gate: 'C',
    description: 'Stop a chiller by unit id. The UI confirms first.',
    parameters: {
      type: 'object',
      properties: { unit: { type: 'string' }, mode: { enum: ['soft', 'safety'] } },
      required: ['unit', 'mode'],
    },
    run: (controller, args, actor) => {
      const unit = str(args.unit)
      const mode = str(args.mode)
      if (!unit || (mode !== 'soft' && mode !== 'safety')) {
        return { ok: false, message: 'Give a unit id and a stop mode.', snapshot: controller.snapshot }
      }
      return fromPlant(controller.stopChiller(unit, mode as StopMode, actor))
    },
  },
  {
    name: 'incident.inject',
    gate: 'C',
    description: 'Apply a trainer fault. forceUnitOff is optional.',
    parameters: {
      type: 'object',
      properties: { kind: { type: 'string' }, forceUnitOff: { type: 'string' } },
      required: ['kind'],
    },
    run: (controller, args, actor) => {
      const kind = str(args.kind)
      if (!kind || !isIncidentKind(kind)) {
        return { ok: false, message: 'Give a known incident.', snapshot: controller.snapshot }
      }
      const forceUnitOff = str(args.forceUnitOff) ?? undefined
      return fromPlant(controller.injectIncident(kind as IncidentKind, actor, { forceUnitOff }))
    },
  },
  {
    name: 'incident.clear',
    gate: 'C',
    description: 'Restore the plant to the state before the fault.',
    parameters: { type: 'object', properties: {} },
    run: (controller, _args, actor) => fromPlant(controller.clearIncident(actor)),
  },
  {
    name: 'optiview.message',
    gate: 'W',
    description: 'Write a hall warning or a NOC page to the log.',
    parameters: { type: 'object', properties: { kind: { enum: ['hall-warning', 'page-noc'] } }, required: ['kind'] },
    run: (controller, args, actor) => {
      const kind = str(args.kind)
      if (kind !== 'hall-warning' && kind !== 'page-noc') {
        return { ok: false, message: 'Use hall-warning or page-noc.', snapshot: controller.snapshot }
      }
      return fromPlant(controller.optiviewMessage(kind, actor))
    },
  },
  {
    name: 'sim.setClock',
    gate: 'W',
    description: 'Pause, resume, or set the time scale to 1, 2, or 5.',
    parameters: { type: 'object', properties: { paused: { type: 'boolean' }, scale: { enum: [1, 2, 5] } } },
    run: (controller, args, actor) => {
      const paused = typeof args.paused === 'boolean' ? args.paused : undefined
      const scale = num(args.scale)
      if (scale !== null && scale !== 1 && scale !== 2 && scale !== 5) {
        return { ok: false, message: 'Use a time scale of 1, 2, or 5.', snapshot: controller.snapshot }
      }
      return fromPlant(controller.setClock({ paused, scale: scale === null ? undefined : (scale as TimeScale) }, actor))
    },
  },
  {
    name: 'sim.reset',
    gate: 'C',
    description: 'Restore the default two-unit trainer plant.',
    parameters: { type: 'object', properties: {} },
    run: (controller, _args, actor) => fromPlant(controller.reset(actor)),
  },
  {
    name: 'sim.undo',
    gate: 'W',
    description: 'Restore the previous plant state, including the sim clock.',
    parameters: { type: 'object', properties: {} },
    run: (controller, _args, actor) => fromPlant(controller.undo(actor)),
  },
  {
    name: 'plant.configureFleet',
    gate: 'W',
    description: 'Replace the unit list. The board still draws CH-01 and CH-02.',
    parameters: { type: 'object', properties: { units: { type: 'array' } }, required: ['units'] },
    run: (controller, args, actor) => {
      if (!Array.isArray(args.units)) {
        return { ok: false, message: 'Give a unit list.', snapshot: controller.snapshot }
      }
      const units: ChillerUnitState[] = []
      for (const item of args.units) {
        if (!item || typeof item !== 'object') {
          return { ok: false, message: 'Give a unit list.', snapshot: controller.snapshot }
        }
        const row = item as Record<string, unknown>
        const id = str(row.id)
        const capacityMw = num(row.capacityMw)
        if (!id || capacityMw === null || typeof row.running !== 'boolean') {
          return { ok: false, message: 'Each unit needs an id, a run state, and a capacity.', snapshot: controller.snapshot }
        }
        units.push({ id, running: row.running, capacityMw: Math.max(0, capacityMw) })
      }
      return fromPlant(controller.configureFleet(units, actor))
    },
  },
]

export function yorkToolCatalog(): YorkToolInfo[] {
  return TOOLS.map(({ name, gate, description, parameters }) => ({ name, gate, description, parameters }))
}

export function createYorkTools(controller: PlantController): YorkToolbox {
  const byName = new Map(TOOLS.map((tool) => [tool.name, tool]))
  return {
    list: () => yorkToolCatalog(),
    call: (name, args = {}, actor = 'user') => {
      const tool = byName.get(name)
      if (!tool) return { ok: false, message: 'This trainer has no tool with that name.', snapshot: controller.snapshot }
      return tool.run(controller, args, actor)
    },
  }
}
