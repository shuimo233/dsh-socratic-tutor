import { useEffect, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { CONIC_KINDS, DEFAULT_CONIC, describeConic, rounded, sampleConic, validateConic, type ConicDiagram, type ConicKind, type Point } from '../conic'
import { ProblemText } from './problem-text'
import { NotebookSelector } from './notebook-selector'

const names: Record<ConicKind, string> = {
  ellipse: '椭圆', 'hyperbola-x': '双曲线（左右开口）', 'hyperbola-y': '双曲线（上下开口）',
  'parabola-x': '抛物线（横轴）', 'parabola-y': '抛物线（纵轴）',
}
const conicOptions = CONIC_KINDS.map(value => ({ value, label: names[value] }))
const lineOptions = [{ value: 'slope', label: 'y = kx + d' }, { value: 'vertical', label: 'x = d' }]

type NumericKey = 'a' | 'b' | 'p' | 'k' | 'd'
function asFields(diagram: ConicDiagram) {
  const { kind, vertical, a, b, p, k, d } = diagram
  return { kind, vertical, a: String(a), b: String(b), p: String(p), k: String(k), d: String(d) }
}

export function ConicBoard({ diagram, inherited, initialKind, onApply, onRemove }: {
  diagram?: ConicDiagram; inherited?: ConicDiagram; initialKind: ConicKind; onApply(value: ConicDiagram): void; onRemove(): void
}) {
  const seed = diagram ?? inherited ?? DEFAULT_CONIC
  const seedKind = diagram?.kind ?? inherited?.kind ?? initialKind
  const [fields, setFields] = useState(() => asFields({ ...seed, kind: seedKind }))
  useEffect(() => setFields(asFields({ ...seed, kind: seedKind })), [seed, seedKind])
  const number = (key: NumericKey) => fields[key].trim() ? Number(fields[key]) : NaN
  const parabola = fields.kind === 'parabola-x' || fields.kind === 'parabola-y'
  const preview: ConicDiagram = {
    kind: fields.kind, vertical: fields.vertical, a: parabola ? seed.a : number('a'), b: parabola ? seed.b : number('b'),
    p: parabola ? number('p') : seed.p, k: fields.vertical ? seed.k : number('k'), d: number('d'),
  }
  const valid = validateConic(preview)
  const changed = !diagram || Object.keys(preview).some(key => preview[key as keyof ConicDiagram] !== diagram[key as keyof ConicDiagram])

  function input(key: NumericKey, label: string, min = -100) {
    return <label>{label}<input type="number" min={min} max={100} step="any" value={fields[key]}
      onChange={event => setFields(previous => ({ ...previous, [key]: event.target.value }))} /></label>
  }

  return <div className="st-diagram-body">
    <div className="st-diagram-controls">
      <NotebookSelector label="曲线类型" value={fields.kind} options={conicOptions} onChange={value => {
        const kind = CONIC_KINDS.find(item => item === value)
        if (kind) setFields(previous => ({ ...previous, kind }))
      }} />
      {parabola ? input('p', '焦参数 p') : <>{input('a', '横轴参数 a', 0.1)}{input('b', '纵轴参数 b', 0.1)}</>}
      <NotebookSelector label="直线类型" value={fields.vertical ? 'vertical' : 'slope'} options={lineOptions}
        onChange={value => setFields(previous => ({ ...previous, vertical: value === 'vertical' }))} />
      {!fields.vertical && input('k', '斜率 k')}
      {input('d', fields.vertical ? '横坐标 d' : '截距 d')}
    </div>
    {valid ? <ConicPlot diagram={preview} /> : <p role="alert" className="st-feedback-error">请输入 −100 到 100 之间的数值，a、b 和 |p| 至少为 0.1。</p>}
    <div className="st-diagram-actions">
      <span>{changed ? '预览' : '已应用'}</span>
      {diagram && <Button label="移除本步图形" size="sm" variant="ghost" onClick={onRemove} />}
      <Button label="应用到本步" size="sm" variant="secondary" isDisabled={!valid || !changed} onClick={() => onApply(preview)} />
    </div>
  </div>
}

export function ConicPlot({ diagram }: { diagram: ConicDiagram }) {
  const { conic, line, A, B, midpoint, chordLength } = describeConic(diagram)
  const points = [{ label: 'A', point: A, dx: -15, dy: -8 }, { label: 'B', point: B, dx: 7, dy: -8 }, { label: 'P', point: midpoint, dx: 6, dy: 15 }]
  const farthest = Math.max(...points.map(({ point }) => point ? Math.max(Math.abs(point.x), Math.abs(point.y)) : 0))
  const curveSize = diagram.kind.startsWith('parabola') ? Math.sqrt(Math.abs(diagram.p)) : Math.max(diagram.a, diagram.b)
  const extent = Math.min(125, Math.max(3, curveSize * 1.25, farthest * 1.22, Math.abs(diagram.d) * 1.15))
  const interval = [0.5, 1, 2, 5, 10, 20, 50].find(n => extent / n <= 7) ?? 50
  const grid = Array.from({ length: Math.floor(extent / interval) * 2 + 1 }, (_, i) => (i - Math.floor(extent / interval)) * interval)
  const screenX = (x: number) => 180 + x * 180 / extent
  const screenY = (y: number) => 180 - y * 180 / extent
  const pair = ({ x, y }: Point) => `${screenX(x).toFixed(2)} ${screenY(y).toFixed(2)}`
  const d = diagram.d
  const linePoints = diagram.vertical ? [{ x: d, y: -extent }, { x: d, y: extent }]
    : [{ x: -extent, y: d - diagram.k * extent }, { x: extent, y: d + diagram.k * extent }]
  return <figure className="st-conic-figure">
    <figcaption><ProblemText text={`曲线 \\(${conic}\\)　直线 \\(${line}\\)`} /></figcaption>
    <svg viewBox="0 0 360 360" className="st-conic-svg" role="img" aria-label="圆锥曲线坐标图">
      {grid.map(t => <g key={t} className={t === 0 ? 'st-plot-axes' : 'st-plot-grid'}>
        <line x1={screenX(t)} y1="0" x2={screenX(t)} y2="360" />
        <line x1="0" y1={screenY(t)} x2="360" y2={screenY(t)} />
        {t !== 0 && Math.abs(t) < extent * 0.94 && <><text x={screenX(t)} y="195" textAnchor="middle">{t}</text><text x="172" y={screenY(t) + 4} textAnchor="end">{t}</text></>}
      </g>)}
      <text className="st-plot-axis-label" x="347" y="172">x</text>
      <text className="st-plot-axis-label" x="189" y="16">y</text>
      {sampleConic(diagram, extent).map((branch, index) => <path key={index} className="st-plot-curve" d={`M ${branch.map(pair).join(' L ')}`} />)}
      <path className="st-plot-line" d={`M ${linePoints.map(pair).join(' L ')}`} />
      {points.map(({ label, point, dx, dy }) => point && Math.abs(point.x) <= extent && Math.abs(point.y) <= extent && <g key={label} className={`st-plot-point${label === 'P' ? ' st-plot-midpoint' : ''}`}>
        <circle cx={screenX(point.x)} cy={screenY(point.y)} r="4" />
        <text x={screenX(point.x) + dx} y={screenY(point.y) + dy}>{label}</text>
      </g>)}
    </svg>
    <div className="st-diagram-points" aria-label="图形数值">
      {A ? points.map(({ label, point }) => point && <span key={label}>{label} ≈ ({rounded(point.x)}, {rounded(point.y)}){label === 'P' ? ' · 弦中点' : ''}</span>) : <span>直线和曲线无实交点</span>}
      {chordLength !== undefined && <span>|AB| ≈ {rounded(chordLength)}</span>}
      {farthest > extent && <span>部分交点在画幅外</span>}
    </div>
  </figure>
}
