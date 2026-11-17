import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONIC, describeConic } from '../src/conic'
import { createNotebook, newStep, prepareHelp, validateDocument } from '../src/notebook'

test('ellipse shows a secant, a tangent or no intersection as the intercept moves', () => {
  const { A, B, midpoint, chordLength } = describeConic(DEFAULT_CONIC)
  assert.ok(A && B && midpoint && chordLength)
  assert.ok(Math.abs(A.x + Math.sqrt(3)) < 1e-12)
  assert.ok(Math.abs(B.x - Math.sqrt(3)) < 1e-12)
  assert.ok(Math.abs(midpoint.x) < 1e-12)
  assert.equal(midpoint.y, 0.5)
  assert.ok(Math.abs(chordLength - 2 * Math.sqrt(3)) < 1e-12)
  const tangent = describeConic({ ...DEFAULT_CONIC, d: 1 })
  assert.equal(Math.abs(tangent.A!.x), 0)
  assert.equal(tangent.A!.y, 1)
  assert.equal(tangent.B, undefined)
  assert.equal(tangent.midpoint, undefined)
  assert.equal(describeConic({ ...DEFAULT_CONIC, d: 1.2 }).A, undefined)
})

test('parabola supports a vertical chord and hyperbola handles an asymptote-parallel line', () => {
  const parabola = describeConic({ ...DEFAULT_CONIC, kind: 'parabola-x', p: -1, vertical: true, d: -2 })
  assert.deepEqual(parabola.A, { x: -2, y: -2 })
  assert.deepEqual(parabola.B, { x: -2, y: 2 })
  assert.equal(parabola.chordLength, 4)
  const hyperbola = describeConic({ ...DEFAULT_CONIC, kind: 'hyperbola-x', k: 0.5, d: 1 })
  assert.deepEqual(hyperbola.A, { x: -2, y: 0 })
  assert.equal(hyperbola.B, undefined)
})

test('help describes the last applied figure at or before the selected step', () => {
  const notebook = createNotebook()
  notebook.document.problem = '已知椭圆和弦，研究其中点。'
  const first = notebook.document.steps[0]!
  first.diagram = DEFAULT_CONIC
  const second = newStep()
  notebook.document.steps.push(second, { ...newStep(), diagram: { ...DEFAULT_CONIC, d: 99 } })
  notebook.document.selectedId = second.id
  const { studentWork, system } = prepareHelp(notebook, 'hint')
  const work = JSON.parse(studentWork.split('\n').slice(1, -1).join('\n'))
  assert.equal(work.figure.step, 1)
  assert.equal(work.figure.lineLatex, 'y=0.5')
  assert.equal(work.figure.approximatePoints.P.y, 0.5)
  assert.equal(work.steps.length, 2)
  assert.match(system, /不能代替证明/)
  assert.equal(validateDocument(notebook.document), true)
  first.diagram = { ...DEFAULT_CONIC, p: 0 }
  assert.equal(validateDocument(notebook.document), false)
})
