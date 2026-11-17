export const CONIC_KINDS = ['ellipse', 'hyperbola-x', 'hyperbola-y', 'parabola-x', 'parabola-y'] as const
export type ConicKind = typeof CONIC_KINDS[number]
export type ConicDiagram = { kind: ConicKind; a: number; b: number; p: number; vertical: boolean; k: number; d: number }
export type Point = { x: number; y: number }
export const DEFAULT_CONIC: ConicDiagram = { kind: 'ellipse', a: 2, b: 1, p: 1, vertical: false, k: 0, d: 0.5 }

export function validateConic(value: unknown): value is ConicDiagram {
  if (!value || typeof value !== 'object') return false
  const { kind, a, b, p, vertical, k, d } = value as Partial<ConicDiagram>
  return CONIC_KINDS.some(item => item === kind) && inRange(a, 0.1, 100) && inRange(b, 0.1, 100) &&
    inRange(p, -100, 100) && Math.abs(p) >= 0.1 && typeof vertical === 'boolean' &&
    inRange(k, -100, 100) && inRange(d, -100, 100)
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && value >= min && value <= max
}

export function rounded(value: number): number {
  return Number(value.toPrecision(8))
}

function equations({ kind, a, b, p, vertical, k, d }: ConicDiagram) {
  const x = `\\frac{x^2}{${rounded(a * a)}}`
  const y = `\\frac{y^2}{${rounded(b * b)}}`
  const conic = {
    ellipse: `${x}+${y}=1`,
    'hyperbola-x': `${x}-${y}=1`,
    'hyperbola-y': `${y}-${x}=1`,
    'parabola-x': `y^2=${rounded(2 * p)}x`,
    'parabola-y': `x^2=${rounded(2 * p)}y`,
  }[kind]
  const term = k === 1 ? 'x' : k === -1 ? '-x' : `${k}x`
  const line = vertical ? `x=${d}` : k === 0 ? `y=${d}` : `y=${term}${d === 0 ? '' : d > 0 ? `+${d}` : d}`
  return { conic, line }
}

function roots(a: number, b: number, c: number): number[] {
  if (a === 0) return b === 0 ? [] : [-c / b]
  const disc = b * b - 4 * a * c
  const tolerance = 32 * Number.EPSILON * (b * b + Math.abs(4 * a * c))
  if (disc < -tolerance) return []
  if (disc <= tolerance) return [-b / (2 * a)]
  // This form avoids subtracting nearly equal numbers for one of the roots.
  const q = -(b + (b < 0 ? -1 : 1) * Math.sqrt(disc)) / 2
  return [q / a, c / q].sort((left, right) => left - right)
}

export function describeConic(diagram: ConicDiagram) {
  const { kind, a, b, p, vertical, k, d } = diagram
  // Ax*x² + Ay*y² + Bx*x + By*y = C. Substitute a parameterized line.
  const [ax, ay, bx, by, c] = {
    ellipse: [1 / a ** 2, 1 / b ** 2, 0, 0, 1],
    'hyperbola-x': [1 / a ** 2, -1 / b ** 2, 0, 0, 1],
    'hyperbola-y': [-1 / a ** 2, 1 / b ** 2, 0, 0, 1],
    'parabola-x': [0, 1, -2 * p, 0, 0],
    'parabola-y': [1, 0, 0, -2 * p, 0],
  }[kind] as [number, number, number, number, number]
  const [x, y, dx, dy] = vertical ? [d, 0, 0, 1] as const : [0, d, 1, k] as const
  const xTerm = ax * dx ** 2, yTerm = ay * dy ** 2
  const quadratic = Math.abs(xTerm + yTerm) <= 8 * Number.EPSILON * (Math.abs(xTerm) + Math.abs(yTerm)) ? 0 : xTerm + yTerm
  const parameters = roots(quadratic, (2 * ax * x + bx) * dx + (2 * ay * y + by) * dy, ax * x ** 2 + ay * y ** 2 + bx * x + by * y - c)
  const [A, B] = parameters.map(t => ({ x: x + dx * t, y: y + dy * t }))
  const midpoint = A && B ? { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 } : undefined
  const chordLength = A && B ? Math.hypot(A.x - B.x, A.y - B.y) : undefined
  return { ...equations(diagram), A, B, midpoint, chordLength }
}

export function sampleConic({ kind, a, b, p }: ConicDiagram, extent: number): Point[][] {
  function sample(start: number, end: number, point: (t: number) => Point): Point[] {
    return Array.from({ length: 161 }, (_, i) => point(start + (end - start) * i / 160))
  }
  if (kind === 'ellipse') return [sample(0, 2 * Math.PI, t => ({ x: a * Math.cos(t), y: b * Math.sin(t) }))]
  if (kind === 'parabola-x' || kind === 'parabola-y') {
    const bound = Math.min(extent, Math.sqrt(2 * Math.abs(p) * extent))
    return [sample(-bound, bound, t => kind === 'parabola-x' ? { x: t * t / (2 * p), y: t } : { x: t, y: t * t / (2 * p) })]
  }
  const horizontal = kind === 'hyperbola-x'
  const primary = horizontal ? a : b, secondary = horizontal ? b : a
  const bound = Math.min(Math.acosh(Math.max(1, extent / primary)), Math.asinh(extent / secondary))
  return [-1, 1].map(sign => sample(-bound, bound, t => {
    const main = sign * primary * Math.cosh(t), other = secondary * Math.sinh(t)
    return horizontal ? { x: main, y: other } : { x: other, y: main }
  }))
}
