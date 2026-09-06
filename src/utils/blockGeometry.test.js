import { describe, it, expect } from 'vitest'
import { getRectIntersectionArea, getPrimaryBlockRect, getDeletedBlockLabel } from './blockGeometry'

const rect = (left, top, right, bottom) => ({ left, top, right, bottom })

describe('getRectIntersectionArea', () => {
  it('returns the overlap area of two crossing rects', () => {
    expect(getRectIntersectionArea(rect(0, 0, 10, 10), rect(5, 5, 15, 15))).toBe(25)
  })

  it('returns the smaller area when one rect contains the other', () => {
    expect(getRectIntersectionArea(rect(0, 0, 10, 10), rect(2, 2, 4, 6))).toBe(8)
  })

  it('returns 0 for rects that merely touch along an edge', () => {
    // This is the boundary the trash-drop test keys off: a block resting exactly
    // against the padded trash box must not count as dropped on it.
    expect(getRectIntersectionArea(rect(0, 0, 10, 10), rect(10, 0, 20, 10))).toBe(0)
  })

  it('returns 0 for rects that touch at a single corner', () => {
    expect(getRectIntersectionArea(rect(0, 0, 10, 10), rect(10, 10, 20, 20))).toBe(0)
  })

  it('returns 0 for disjoint rects rather than a negative area', () => {
    // Naive width * height would multiply two negatives back to positive here.
    expect(getRectIntersectionArea(rect(0, 0, 5, 5), rect(20, 20, 30, 30))).toBe(0)
  })

  it('returns 0 when either rect is missing', () => {
    expect(getRectIntersectionArea(null, rect(0, 0, 1, 1))).toBe(0)
    expect(getRectIntersectionArea(rect(0, 0, 1, 1), undefined)).toBe(0)
  })
})

describe('getPrimaryBlockRect', () => {
  const svgPathRect = rect(0, 0, 40, 20)
  const rootRect = rect(0, 0, 40, 200)

  it('prefers the primary path rect over the root rect', () => {
    // The root box spans attached child blocks; a tall stack would otherwise
    // register as touching the trash while its visible top sits far away.
    const block = {
      pathObject: { svgPath: { getBoundingClientRect: () => svgPathRect } },
      getSvgRoot: () => ({ getBoundingClientRect: () => rootRect }),
    }
    expect(getPrimaryBlockRect(block)).toBe(svgPathRect)
  })

  it('falls back to querying .blocklyPath when pathObject is absent', () => {
    const block = {
      getSvgRoot: () => ({
        querySelector: (sel) =>
          sel === '.blocklyPath' ? { getBoundingClientRect: () => svgPathRect } : null,
        getBoundingClientRect: () => rootRect,
      }),
    }
    expect(getPrimaryBlockRect(block)).toBe(svgPathRect)
  })

  it('falls back to the root rect when no primary path exists', () => {
    const block = {
      getSvgRoot: () => ({
        querySelector: () => null,
        getBoundingClientRect: () => rootRect,
      }),
    }
    expect(getPrimaryBlockRect(block)).toBe(rootRect)
  })

  it('returns undefined for a block with no rendered SVG', () => {
    expect(getPrimaryBlockRect(null)).toBeUndefined()
    expect(getPrimaryBlockRect({})).toBeUndefined()
  })
})

describe('getDeletedBlockLabel', () => {
  it('uses the block’s own truncated description when available', () => {
    expect(getDeletedBlockLabel({ toString: () => 'Cube side 2', type: 'geo_cube' })).toBe(
      'Cube side 2',
    )
  })

  it('falls back to the block type, then to a generic label', () => {
    expect(getDeletedBlockLabel({ toString: () => '', type: 'geo_cube' })).toBe('geo_cube')
    expect(getDeletedBlockLabel({ toString: () => '' })).toBe('Deleted block')
  })
})
