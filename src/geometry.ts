import { describeConic, rounded, validateConic, type ConicDiagram, type ConicKind, type Point } from './conic'

export type PolygonKind = 'triangle' | 'quadrilateral'
export type PlaneKind = PolygonKind | 'circle'
export type PlaneDiagram = { kind: 'triangle'; vertices: Point[] } | { kind: 'quadrilateral'; vertices: Point[] } |
  { kind: 'circle'; center: Point; radius: number; angleA: number; angleB: number }
export type Diagram = ConicDiagram | PlaneDiagram
export type DiagramFamily = 'conic' | PlaneKind
export const PLANE_KINDS = ['triangle', 'quadrilateral', 'circle'] as const
export const VERTICES = ['A', 'B', 'C', 'D'] as const

export function inferDiagram(problem: string): Diagram['kind'] | undefined {
  if (/立体几何|棱锥|棱柱|正方体|四面体|二面角|圆柱|圆锥(?!曲线)/.test(problem)) return
  if (/椭圆|圆锥曲线/.test(problem)) return 'ellipse'
  if (/双曲线/.test(problem)) return 'hyperbola-x'
  if (/抛物线/.test(problem)) return 'parabola-x'
  if (/四边形|梯形|菱形|矩形|正方形|长方形/.test(problem)) return 'quadrilateral'
  if (/圆心|圆周角|圆周|圆内接|圆外切|圆的方程|直径|⊙|圆\s*(?=[A-Z]|[（(]|\\\(|与|上|内)/.test(problem)) return 'circle'
  if (/三角形|△|\\triangle\b/.test(problem)) return 'triangle'
}

export function diagramFamily(kind: Diagram['kind'] | undefined): DiagramFamily {
  if (kind === 'triangle' || kind === 'quadrilateral' || kind === 'circle') return kind
  return 'conic'
}

export function isConicDiagram(diagram: Diagram | undefined): diagram is ConicDiagram {
  return diagram !== undefined && diagramFamily(diagram.kind) === 'conic'
}

export function initialConicKind(kind: Diagram['kind'] | undefined): ConicKind {
  return kind && kind !== 'triangle' && kind !== 'quadrilateral' && kind !== 'circle' ? kind : 'ellipse'
}

export const PLANE_DEFAULTS: Record<PlaneKind, PlaneDiagram> = {
  triangle: { kind: 'triangle', vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }] },
  quadrilateral: { kind: 'quadrilateral', vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }] },
  circle: { kind: 'circle', center: { x: 0, y: 0 }, radius: 3, angleA: 0, angleB: 90 },
}

function numberIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && value >= min && value <= max
}

function point(value: unknown): value is Point {
  return typeof value === 'object' && value !== null && 'x' in value && 'y' in value && numberIn(value.x, -100, 100) && numberIn(value.y, -100, 100)
}

function turn(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function crosses(a: Point, b: Point, c: Point, d: Point) {
  return turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0
}

export function validatePlane(value: unknown): value is PlaneDiagram {
  if (!value || typeof value !== 'object') return false
  const input = value as Record<string, unknown>
  if (input.kind === 'circle') return point(input.center) && numberIn(input.radius, 0.1, 100) &&
    numberIn(input.angleA, -360, 360) && numberIn(input.angleB, -360, 360) && (input.angleA - input.angleB) % 360 !== 0
  if (input.kind !== 'triangle' && input.kind !== 'quadrilateral') return false
  const count = input.kind === 'triangle' ? 3 : 4
  if (!Array.isArray(input.vertices) || input.vertices.length !== count || !input.vertices.every(point)) return false
  const vertices: Point[] = input.vertices
  if (vertices.some((p, i) => Math.abs(turn(p, vertices[(i + 1) % count]!, vertices[(i + 2) % count]!)) < 1e-9)) return false
  const [a, b, c, d] = vertices
  return !d || (!crosses(a!, b!, c!, d) && !crosses(b!, c!, d, a!))
}

export function validateDiagram(value: unknown): value is Diagram {
  return validateConic(value) || validatePlane(value)
}

export function approxPoint(point: Point) {
  return { x: rounded(point.x), y: rounded(point.y) }
}

function distance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y) }

export function polygonData(vertices: Point[]) {
  const count = vertices.length
  const signedArea = vertices.reduce((sum, p, i) => sum + turn(vertices[0]!, p, vertices[(i + 1) % count]!), 0) / 2
  const points = vertices.map((p, i) => {
    const prev = vertices[(i + count - 1) % count]!, next = vertices[(i + 1) % count]!
    const dot = (prev.x - p.x) * (next.x - p.x) + (prev.y - p.y) * (next.y - p.y)
    const direction = turn(prev, p, next)
    const smallAngle = Math.atan2(Math.abs(direction), dot) * 180 / Math.PI
    return { label: VERTICES[i]!, x: p.x, y: p.y, angle: rounded(direction * signedArea < 0 ? 360 - smallAngle : smallAngle) }
  })
  const sides = points.map((p, i) => {
    const q = points[(i + 1) % count]!
    return { name: p.label + q.label, length: rounded(distance(p, q)) }
  })
  return { points, sides, area: rounded(Math.abs(signedArea)) }
}

export function circleData(diagram: Extract<PlaneDiagram, { kind: 'circle' }>) {
  const { center, radius, angleA, angleB } = diagram
  const at = (angle: number): Point => {
    const rad = angle * Math.PI / 180
    return { x: center.x + radius * Math.cos(rad), y: center.y + radius * Math.sin(rad) }
  }
  const A = at(angleA), B = at(angleB)
  const difference = Math.abs(angleA - angleB) % 360
  return { A, B, angle: rounded(Math.min(difference, 360 - difference)), chord: rounded(distance(A, B)) }
}

export function describeDiagram(diagram: Diagram) {
  if (diagram.kind === 'triangle' || diagram.kind === 'quadrilateral') {
    const { points, sides, area } = polygonData(diagram.vertices)
    return { kind: diagram.kind, vertices: points.map(({ label, x, y }) => ({ label, x, y })), approximateAnglesDegrees: points.map(({ label, angle }) => ({ label, angle })), approximateSideLengths: sides, approximateArea: area }
  }
  if (diagram.kind === 'circle') {
    const { A, B, angle, chord } = circleData(diagram)
    return { kind: 'circle', centerO: { x: diagram.center.x, y: diagram.center.y }, radius: diagram.radius, approximatePoints: { A: approxPoint(A), B: approxPoint(B) }, approximateMinorAngleAOBDegrees: angle, approximateChordLength: chord }
  }
  const { conic, line, A, B, midpoint, chordLength } = describeConic(diagram)
  return {
    kind: diagram.kind, conicLatex: conic, lineLatex: line,
    approximatePoints: { A: A && approxPoint(A), B: B && approxPoint(B), P: midpoint && approxPoint(midpoint) },
    approximateChordLength: chordLength === undefined ? undefined : rounded(chordLength),
    labelP: midpoint ? 'P 是弦 AB 的中点' : undefined,
  }
}
