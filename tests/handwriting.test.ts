import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeInk, inkBounds, parseRecognition, preferredVisionModel, TRANSCRIPTION_PROMPT } from '../src/handwriting'

test('recognition defaults to the current session or native DeepSeek Flash without a second connection', () => {
  const other = { provider: 'other', id: 'vision', name: 'other vision' }
  const deepseek = { provider: 'deepseek-official', id: 'deepseek-flash', name: 'DeepSeek Flash' }
  assert.deepEqual(preferredVisionModel([other, deepseek], other), other)
  assert.deepEqual(preferredVisionModel([other, deepseek]), deepseek)
  assert.equal(preferredVisionModel([]), undefined)
})

test('recognition preserves a transcribed formula and explicitly reports ambiguity', () => {
  const formula = { latex: '\\frac{x^2+1}{2}', uncertain: true, message: '分母可能是 2，请核对。' }
  assert.deepEqual(parseRecognition(JSON.stringify(formula)), formula)
  assert.deepEqual(parseRecognition('```json\n' + JSON.stringify(formula) + '\n```'), formula)
  assert.match(TRANSCRIPTION_PROMPT, /不解题/)
  assert.match(TRANSCRIPTION_PROMPT, /不改正学生的数学错误/)
})
test('invalid or truncated recognition results cannot be inserted as formulas', () => {
  for (const raw of ['not-json', '{"latex":"x"}', '{"latex":123,"uncertain":false}', '{"latex":"x","uncertain":"yes"}', JSON.stringify({ latex: 'x'.repeat(2001), uncertain: false })]) {
    assert.throws(() => parseRecognition(raw))
  }
  assert.deepEqual(parseRecognition('{"latex":"","uncertain":true}'), { latex: '', uncertain: true, message: '' })
})
test('ink decoding rejects invalid coordinates and unbounded data', () => {
  assert.deepEqual(decodeInk('[[{"x":0.2,"y":0.4}]]'), [[{ x: 0.2, y: 0.4 }]])
  for (const raw of ['{}', '[[]]', '[[{"x":-1,"y":0}]]', '[[{"x":0,"y":2}]]', '[[{"x":"0","y":0}]]', ' '.repeat(500001)]) assert.throws(() => decodeInk(raw))
})
test('image crops retain complete strokes with white-space padding and stay within the canvas', () => {
  assert.deepEqual(inkBounds([[{ x: 0.5, y: 0.5 }, { x: 0.7, y: 0.6 }]], 1000, 500), { x: 476, y: 226, width: 248, height: 98 })
  assert.deepEqual(inkBounds([[{ x: 0, y: 0 }, { x: 1, y: 1 }]], 1000, 500), { x: 0, y: 0, width: 1000, height: 500 })
  assert.throws(() => inkBounds([], 1000, 500))
})
