import { useEffect, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { rounded, type Point } from '../conic'
import { circleData, PLANE_DEFAULTS, polygonData, validatePlane, VERTICES, type PlaneDiagram, type PlaneKind } from '../geometry'

function parameters(diagram: PlaneDiagram) {
  if (diagram.kind === 'circle') return [
    { label: '圆心 O 的 x', value: diagram.center.x, min: -100, max: 100 },
    { label: '圆心 O 的 y', value: diagram.center.y, min: -100, max: 100 },
    { label: '半径 r', value: diagram.radius, min: 0.1, max: 100 },
    { label: '圆周点 A 的方位角', value: diagram.angleA, min: -360, max: 360 },
    { label: '圆周点 B 的方位角', value: diagram.angleB, min: -360, max: 360 },
  ]
  return diagram.vertices.flatMap((point, i) => (['x', 'y'] as const).map(axis => ({
    label: `顶点 ${VERTICES[i]} 的 ${axis}`, value: point[axis], min: -100, max: 100,
  })))
}

export function PlaneBoard({ kind, diagram, inherited, onApply, onRemove }: {
  kind: PlaneKind; diagram?: PlaneDiagram; inherited?: PlaneDiagram; onApply(value: PlaneDiagram): void; onRemove(): void
}) {
  const saved = diagram?.kind === kind ? diagram : undefined
  const seed = saved ?? (inherited?.kind === kind ? inherited : PLANE_DEFAULTS[kind])
  const [fields, setFields] = useState(() => parameters(seed).map(param => String(param.value)))
  useEffect(() => setFields(parameters(seed).map(param => String(param.value))), [seed])
  const value = (index: number) => fields[index]?.trim() ? Number(fields[index]) : NaN
  const preview: PlaneDiagram = seed.kind === 'circle'
    ? { kind: 'circle', center: { x: value(0), y: value(1) }, radius: value(2), angleA: value(3), angleB: value(4) }
    : { kind: seed.kind, vertices: seed.vertices.map((_, i) => ({ x: value(i * 2), y: value(i * 2 + 1) })) }
  const valid = validatePlane(preview)
  const changed = !saved || parameters(saved).some((param, i) => param.value !== value(i))

  return <div className="st-diagram-body">
    <div className="st-diagram-controls">
      {parameters(seed).map(({ label, min, max }, index) => <label key={label}>{label}
        <input type="number" min={min} max={max} step="any" value={fields[index] ?? ''} onChange={event => {
          const next = event.target.value
          setFields(previous => previous.map((field, i) => i === index ? next : field))
        }} />
      </label>)}
    </div>
    {seed.kind === 'circle' && <p className="st-feedback-note">方位角以圆心向右为 0°，逆时针为正。</p>}
    {valid ? <PlanePlot diagram={preview} /> : <p role="alert" className="st-feedback-error">{seed.kind === 'circle'
      ? '请检查坐标、半径和角度范围，并让两个圆周点分开。'
      : '坐标范围为 −100 到 100。请按边界顺序填写顶点，避免重合、共线或边相交。'}</p>}
    <div className="st-diagram-actions">
      <span>{changed ? '预览' : '已应用'}</span>
      {saved && <Button label="移除本步图形" size="sm" variant="ghost" onClick={onRemove} />}
      <Button label="应用到本步" size="sm" variant="secondary" isDisabled={!valid || !changed} onClick={() => onApply(preview)} />
    </div>
  </div>
}

export function PlanePlot({ diagram }: { diagram: PlaneDiagram }) {
  const circle = diagram.kind === 'circle' ? { ...diagram, ...circleData(diagram) } : undefined
  const polygon = diagram.kind === 'circle' ? undefined : polygonData(diagram.vertices)
  const points = circle ? [{ ...circle.center, label: 'O' }, { ...circle.A, label: 'A' }, { ...circle.B, label: 'B' }] : polygon!.points
  const extentPoints = circle ? [
    { x: circle.center.x - circle.radius, y: circle.center.y - circle.radius },
    { x: circle.center.x + circle.radius, y: circle.center.y + circle.radius },
  ] : points
  const minX = Math.min(...extentPoints.map(p => p.x)), maxX = Math.max(...extentPoints.map(p => p.x))
  const minY = Math.min(...extentPoints.map(p => p.y)), maxY = Math.max(...extentPoints.map(p => p.y))
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2
  const scale = 176 / Math.max(maxX - minX, maxY - minY)
  const x = (p: Point) => 150 + (p.x - centerX) * scale
  const y = (p: Point) => 110 - (p.y - centerY) * scale
  const pair = (p: Point) => `${x(p)},${y(p)}`
  return <figure className="st-conic-figure">
    <svg viewBox="0 0 300 220" className="st-conic-svg" role="img" aria-label="平面几何图">
      {circle ? <>
        <circle className="st-plot-curve" cx={x(circle.center)} cy={y(circle.center)} r={circle.radius * scale} />
        <polyline className="st-plot-radius" points={`${pair(circle.A)} ${pair(circle.center)} ${pair(circle.B)}`} />
        <line className="st-plot-line" x1={x(circle.A)} y1={y(circle.A)} x2={x(circle.B)} y2={y(circle.B)} />
      </> : <polygon className="st-plot-curve" points={points.map(pair).join(' ')} />}
      {points.map(point => <g key={point.label} className="st-plot-point">
        <circle cx={x(point)} cy={y(point)} r="4" />
        <text x={x(point) + (point.x < centerX ? -16 : 8)} y={y(point) + (point.y < centerY ? 15 : -8)}>{point.label}</text>
      </g>)}
    </svg>
    <details className="st-diagram-measurements">
      <summary>查看测量值</summary>
      <div className="st-diagram-points" aria-label="图形数值">
        {polygon?.sides.map(side => <span key={side.name}>{side.name} ≈ {rounded(side.length)}</span>)}
        {polygon?.points.map(point => <span key={point.label}>∠{point.label} ≈ {point.angle}°</span>)}
        {polygon && <span>面积 ≈ {polygon.area}</span>}
        {circle && <><span>∠AOB ≈ {circle.angle}°</span><span>|AB| ≈ {circle.chord}</span></>}
      </div>
    </details>
  </figure>
}
