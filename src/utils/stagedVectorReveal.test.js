import { describe, it, expect, vi } from 'vitest'
import { makeStagedVectorReveal } from './stagedVectorReveal'

const makeArrow = () => {
  const calls = []
  return {
    visible: true,
    userData: { setVectorLength: vi.fn((n) => calls.push(n)) },
    calls,
  }
}

describe('makeStagedVectorReveal', () => {
  it('reveals parts one after another over equal slices', () => {
    const a = makeArrow()
    const b = makeArrow()
    const c = makeArrow()
    const animate = makeStagedVectorReveal([
      { obj: a, full: 10 },
      { obj: b, full: 20 },
      { obj: c, full: 30 },
    ])

    animate(0) // nothing has grown
    expect(a.calls.at(-1)).toBe(0)
    expect(b.calls.at(-1)).toBe(0)
    expect(c.calls.at(-1)).toBe(0)
    expect(a.visible).toBe(false)

    animate(1 / 3) // a full, b/c not started
    expect(a.calls.at(-1)).toBeCloseTo(10)
    expect(b.calls.at(-1)).toBe(0)
    expect(a.visible).toBe(true)
    expect(b.visible).toBe(false)

    animate(1) // all full
    expect(a.calls.at(-1)).toBeCloseTo(10)
    expect(b.calls.at(-1)).toBeCloseTo(20)
    expect(c.calls.at(-1)).toBeCloseTo(30)
    expect(c.visible).toBe(true)
  })

  it('applies the easing function to each stage local progress', () => {
    const a = makeArrow()
    const square = (t) => t * t
    const animate = makeStagedVectorReveal([{ obj: a, full: 100 }])

    animate(0.5, square) // local raw = 0.5 -> eased 0.25
    expect(a.calls.at(-1)).toBeCloseTo(25)
  })

  it('leaves a degenerate part (full 0, no setVectorLength) visible', () => {
    const marker = { visible: true, userData: {} }
    const animate = makeStagedVectorReveal([{ obj: marker, full: 0 }])
    animate(0)
    expect(marker.visible).toBe(true)
  })
})
