import { describe, it, expect } from 'vitest'
import { leastSquares2, closestLineData } from './lineIntersectionMath'

const v = (x, y, z) => ({ x, y, z })
const ops = {
  add: (a, b) => v(a.x + b.x, a.y + b.y, a.z + b.z),
  sub: (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z),
  scale: (a, s) => v(a.x * s, a.y * s, a.z * s),
  dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
  distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
}

describe('leastSquares2', () => {
  it('solves an exact system with orthogonal columns', () => {
    const [t1, t2] = leastSquares2(v(1, 0, 0), v(0, 1, 0), v(3, 4, 0), ops.dot)
    expect(t1).toBeCloseTo(3)
    expect(t2).toBeCloseTo(4)
  })

  it('solves an exact system with non-orthogonal columns', () => {
    // col1*2 + col2*(-1) should reproduce target exactly
    const col1 = v(1, 1, 0)
    const col2 = v(1, -1, 0)
    const target = ops.add(ops.scale(col1, 2), ops.scale(col2, -1))
    const [t1, t2] = leastSquares2(col1, col2, target, ops.dot)
    expect(t1).toBeCloseTo(2)
    expect(t2).toBeCloseTo(-1)
  })

  it('returns zero coefficients when both columns are degenerate (zero vectors)', () => {
    const [t1, t2] = leastSquares2(v(0, 0, 0), v(0, 0, 0), v(1, 2, 3), ops.dot)
    expect(t1).toBe(0)
    expect(t2).toBe(0)
  })
})

describe('closestLineData', () => {
  it('finds zero gap and the shared point for two lines that truly intersect', () => {
    const lineA = { origin: v(0, 0, 0), direction: v(1, 0, 0) }
    const lineB = { origin: v(2, -2, 0), direction: v(0, 1, 0) }
    const result = closestLineData(lineA, lineB, ops)
    expect(result.gap).toBeCloseTo(0)
    expect(result.midpoint.x).toBeCloseTo(2)
    expect(result.midpoint.y).toBeCloseTo(0)
    expect(result.midpoint.z).toBeCloseTo(0)
  })

  it('finds the known minimal gap between two skew lines', () => {
    // x-axis, and a line parallel to the y-axis offset by (0,0,5)
    const lineA = { origin: v(0, 0, 0), direction: v(1, 0, 0) }
    const lineB = { origin: v(0, 0, 5), direction: v(0, 1, 0) }
    const result = closestLineData(lineA, lineB, ops)
    expect(result.gap).toBeCloseTo(5)
  })
})
