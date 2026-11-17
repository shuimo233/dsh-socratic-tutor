import test from 'node:test'
import assert from 'node:assert/strict'
import { describeDiagram, inferDiagram, PLANE_DEFAULTS, validatePlane } from '../src/geometry'
import { createNotebook, prepareHelp } from '../src/notebook'

test('offers diagrams for supported geometry without treating every mention of an angle or curve as geometry', () => {
  assert.equal(inferDiagram('求三角函数的最值及其导数。'), undefined)
  assert.equal(inferDiagram('等差数列中，求前 n 项和。'), undefined)
  assert.equal(inferDiagram('四棱锥的底面是正方形，求二面角。'), undefined)
  assert.equal(inferDiagram('已知椭圆及其一条弦。'), 'ellipse')
  assert.equal(inferDiagram('求双曲线的渐近线。'), 'hyperbola-x')
  assert.equal(inferDiagram(String.raw`在 \(\triangle ABC\) 中求边长。`), 'triangle')
  assert.equal(inferDiagram('已知平行四边形 ABCD。'), 'quadrilateral')
  assert.equal(inferDiagram('在 ⊙O 中，求圆周角。'), 'circle')
})

test('polygon data describes labels, side lengths and angles, and refuses a crossed quadrilateral', () => {
  const triangle = describeDiagram(PLANE_DEFAULTS.triangle)
  assert.equal(triangle.kind, 'triangle')
  assert.equal(triangle.approximateArea, 6)
  assert.equal(triangle.approximateAnglesDegrees?.[0]?.angle, 90)
  assert.deepEqual(triangle.approximateSideLengths?.map(side => side.length), [4, 5, 3])
  assert.equal(validatePlane({ kind: 'quadrilateral', vertices: [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }] }), false)
  const concave = describeDiagram({ kind: 'quadrilateral', vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 4 }] })
  assert.ok(concave.approximateAnglesDegrees![2]!.angle > 180)
})

test('circle help includes named objects and the minor central angle', () => {
  const circle = { kind: 'circle', center: { x: 2, y: -1 }, radius: 3, angleA: 330, angleB: 30 } as const
  assert.equal(validatePlane(circle), true)
  assert.equal(validatePlane({ ...circle, angleA: 0, angleB: 360 }), false)
  const notebook = createNotebook()
  notebook.document.problem = '已知圆 O，求弦 AB。'
  notebook.document.steps[0]!.diagram = circle
  const { studentWork } = prepareHelp(notebook, 'hint')
  const { figure } = JSON.parse(studentWork.split('\n').slice(1, -1).join('\n'))
  assert.equal(figure.kind, 'circle')
  assert.deepEqual(figure.centerO, { x: 2, y: -1 })
  assert.equal(figure.approximateMinorAngleAOBDegrees, 60)
  assert.equal(figure.approximateChordLength, 3)
})
