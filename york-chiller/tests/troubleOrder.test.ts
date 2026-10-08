import assert from 'node:assert/strict'
import { test } from 'node:test'
import { INFO, TROUBLE_CASES, troubleInfoId } from '../src/data/content.ts'
import { openTroubleView, shuffleChoices, troubleStep } from '../src/troubleOrder.ts'

function rngFrom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function correctIndex(options: readonly { correct: boolean }[]): number {
  return options.findIndex((option) => option.correct)
}

test('one pass does not leave the correct incident choice first in every case', () => {
  const random = rngFrom(11)
  const positions = TROUBLE_CASES.map((item) => {
    const sourceTexts = item.options.map((option) => option.text)
    const presented = shuffleChoices(item.options, random)
    assert.deepEqual(item.options.map((option) => option.text), sourceTexts)
    assert.deepEqual(
      presented.map((option) => option.text).sort(),
      sourceTexts.slice().sort(),
    )
    const index = correctIndex(presented)
    const source = item.options.find((option) => option.correct)
    assert.equal(presented[index]?.text, source?.text)
    assert.equal(presented[index]?.correct, true)
    assert.equal(presented.filter((option) => option.correct).length, 1)
    return index
  })
  assert.equal(positions.length, TROUBLE_CASES.length)
  assert.ok(positions.some((index) => index !== 0))
  assert.ok(new Set(positions).size > 1)
})

test('a later presentation of the same incident can move the correct choice', () => {
  const item = TROUBLE_CASES[0]
  assert.equal(correctIndex(item.options), 0)
  const positions = new Set<number>()
  for (let seed = 1; seed <= 40; seed += 1) {
    const presented = shuffleChoices(item.options, rngFrom(seed))
    positions.add(correctIndex(presented))
  }
  assert.ok(positions.size > 1)
  assert.ok([...positions].some((index) => index !== 0))
  assert.equal(correctIndex(item.options), 0)
})

test('the correct incident choice is not identifiable by length', () => {
  let notLongest = 0
  for (const item of TROUBLE_CASES) {
    const correct = item.options.filter((option) => option.correct)
    assert.equal(correct.length, 1)
    const correctText = correct[0]?.text ?? ''
    const distractors = item.options.filter((option) => !option.correct).map((option) => option.text.length)
    assert.equal(distractors.length, 3)
    const longest = Math.max(...distractors)
    const ratio = correctText.length / longest
    assert.ok(ratio <= 1.2, `${item.id} correct/longest distractor = ${ratio.toFixed(2)}`)
    if (correctText.length < longest) notLongest += 1
    const body = INFO[troubleInfoId(item.id)].points.join('\n').toLowerCase()
    assert.equal(body.includes(correctText.toLowerCase()), false, item.id)
  }
  assert.ok(notLongest >= 2)
})

test('a cleared incident set does not wrap on Next', () => {
  const count = TROUBLE_CASES.length
  assert.deepEqual(openTroubleView(true, 0), { kind: 'complete' })
  assert.deepEqual(openTroubleView(false, 2), { kind: 'case', index: 2 })
  assert.deepEqual(troubleStep(count - 1, count, 'next', true), { kind: 'complete' })
  assert.deepEqual(troubleStep(0, count, 'prev', true), { kind: 'case', index: 0 })
  assert.deepEqual(troubleStep(1, count, 'next', true), { kind: 'case', index: 2 })
  assert.deepEqual(troubleStep(count - 1, count, 'next', false), { kind: 'case', index: 0 })
  assert.deepEqual(troubleStep(0, count, 'prev', false), { kind: 'case', index: count - 1 })
})
