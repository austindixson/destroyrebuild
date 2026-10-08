import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TOOL_GATES } from '../../york-api/src/gates.ts'
import { yorkToolCatalog } from '../src/sim/tools.ts'

test('API tool gates match the trainer registry', () => {
  const catalog = yorkToolCatalog()
  assert.deepEqual(Object.keys(TOOL_GATES).sort(), catalog.map((tool) => tool.name).sort())
  for (const tool of catalog) {
    assert.equal(TOOL_GATES[tool.name], tool.gate)
  }
})
