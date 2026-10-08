interface FieldSpec {
  type: 'string' | 'number' | 'boolean' | 'enum' | 'units'
  required: boolean
  values?: readonly (string | number)[]
  min?: number
  max?: number
  maxLen?: number
}

type ReadOk = { ok: true; value: unknown }
type ReadFail = { ok: false }
type Read = ReadOk | ReadFail

const FAIL: ReadFail = { ok: false }

function str(required = false): FieldSpec {
  return { type: 'string', required, maxLen: 80 }
}

function num(required = false, min?: number, max?: number): FieldSpec {
  return { type: 'number', required, min, max }
}

function en(values: readonly (string | number)[], required = false): FieldSpec {
  return { type: 'enum', required, values }
}

function bool(): FieldSpec {
  return { type: 'boolean', required: false }
}

export const INJECT_KINDS = ['high-head', 'hall-hot', 'landing', 'failover', 'bms-fight'] as const

/** Argument shapes for the trainer tools. Keys must match TOOL_GATES. */
const SCHEMAS: Record<string, Record<string, FieldSpec>> = {
  'plant.getSnapshot': {},
  'plant.getActionLog': { sinceT: num() },
  'plant.getAlarms': {},
  'plant.explain': {},
  'plant.setWeather': { preset: en(['cold', 'mild', 'hot'], true) },
  'plant.setOutdoorDryBulb': { f: num(true, 20, 110) },
  'plant.setLchltSetpoint': { f: num(true, 42, 65) },
  'plant.setValve': { loop: en(['chw', 'cw', 'gly'], true), pct: num(true) },
  'plant.setItLoad': { deltaMw: num(), targetMw: num(), rampSeconds: num() },
  'chiller.start': { unit: str(true) },
  'chiller.stop': { unit: str(true), mode: en(['soft', 'safety'], true) },
  'incident.inject': {
    kind: en(INJECT_KINDS, true),
    forceUnitOff: str(),
  },
  'incident.clear': {},
  'optiview.message': { kind: en(['hall-warning', 'page-noc'], true) },
  'sim.setClock': { paused: bool(), scale: en([1, 2, 5]) },
  'sim.reset': {},
  'sim.undo': {},
  'plant.configureFleet': { units: { type: 'units', required: true } },
}

const UNIT_KEYS = new Set(['id', 'running', 'capacityMw'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(field: FieldSpec, value: unknown): Read {
  if (typeof value !== 'string') return FAIL
  const max = field.maxLen ?? 80
  if (value.length === 0 || value.length > max) return FAIL
  return { ok: true, value }
}

function readNumber(field: FieldSpec, value: unknown): Read {
  if (typeof value !== 'number' || !Number.isFinite(value)) return FAIL
  if (field.min !== undefined && value < field.min) return FAIL
  if (field.max !== undefined && value > field.max) return FAIL
  return { ok: true, value }
}

function readEnum(field: FieldSpec, value: unknown): Read {
  const values = field.values ?? []
  if (typeof value !== 'string' && typeof value !== 'number') return FAIL
  if (!values.some((item) => item === value)) return FAIL
  return { ok: true, value }
}

function readUnit(item: unknown): { id: string; running: boolean; capacityMw: number } | null {
  if (!isRecord(item)) return null
  const keys = Object.keys(item)
  if (keys.length !== 3 || keys.some((key) => !UNIT_KEYS.has(key))) return null
  if (typeof item.id !== 'string' || item.id.length === 0 || item.id.length > 64) return null
  if (typeof item.running !== 'boolean') return null
  if (typeof item.capacityMw !== 'number' || !Number.isFinite(item.capacityMw)) return null
  return { id: item.id, running: item.running, capacityMw: item.capacityMw }
}

function readUnits(value: unknown): Read {
  if (!Array.isArray(value) || value.length > 64) return FAIL
  const units: Array<{ id: string; running: boolean; capacityMw: number }> = []
  for (const item of value) {
    const unit = readUnit(item)
    if (!unit) return FAIL
    units.push(unit)
  }
  return { ok: true, value: units }
}

function readField(field: FieldSpec, value: unknown): Read {
  switch (field.type) {
    case 'string':
      return readString(field, value)
    case 'number':
      return readNumber(field, value)
    case 'boolean':
      return typeof value === 'boolean' ? { ok: true, value } : FAIL
    case 'enum':
      return readEnum(field, value)
    case 'units':
      return readUnits(value)
    default: {
      const neverType: never = field.type
      return neverType
    }
  }
}

function itLoadOk(name: string, args: Record<string, unknown>): boolean {
  if (name !== 'plant.setItLoad') return true
  return args.deltaMw !== undefined || args.targetMw !== undefined
}

export function toolSchemaNames(): string[] {
  return Object.keys(SCHEMAS)
}

/** Copy of the allowed keys, or null when the model object fails the schema. */
export function validateToolArgs(name: string, value: unknown): Record<string, unknown> | null {
  const spec = SCHEMAS[name]
  if (!spec || !isRecord(value)) return null
  for (const key of Object.keys(value)) {
    if (!spec[key]) return null
  }
  const args: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(spec)) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      if (field.required) return null
      continue
    }
    const read = readField(field, value[key])
    if (!read.ok) return null
    args[key] = read.value
  }
  if (!itLoadOk(name, args)) return null
  return args
}
