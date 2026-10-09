import assert from 'node:assert/strict'
import { test } from 'node:test'
import { askTrainer } from '../src/chat/loop'
import { captureScreenSnapshot, defaultHomeInput } from '../src/chat/snapshot'
import { PlantController } from '../src/sim/controller'
import { createYorkTools } from '../src/sim/tools'

test('getActionLog rows reach the next server body', async () => {
  const controller = new PlantController({ seed: 0 })
  controller.setValve('chw', 40, 'user')
  const tools = createYorkTools(controller)
  const bodies: Record<string, unknown>[] = []
  let step = 0
  await askTrainer({
    question: 'How many actions are in the action log?',
    previousQuestions: [],
    history: [],
    snapshot: captureScreenSnapshot(defaultHomeInput(controller)),
    signal: new AbortController().signal,
    host: { callTool: (name, args) => tools.call(name, args, 'ai') },
    onConfirm: async () => false,
    onUndoOffer: () => {},
    onStatus: () => {},
    post: async (body) => {
      bodies.push(body as Record<string, unknown>)
      step += 1
      if (step === 1) return { status: 'tools', calls: [{ name: 'plant.getActionLog', args: {} }], round: 1 }
      return { status: 'answer', answer: 'The log has one valve move.', sources: [] }
    },
  })
  const second = bodies[1]
  const results = second?.toolResults as { name: string; message: string; rows?: Record<string, unknown>[]; snapshot?: unknown }[]
  assert.equal(results[0]?.name, 'plant.getActionLog')
  assert.match(results[0]?.message ?? '', /setValve/)
  assert.equal(results[0]?.rows?.some((row) => row.action === 'setValve' && row.actor === 'user'), true)
  assert.equal(results[0]?.snapshot, undefined)
})
