import { describe, it, expect, vi } from 'vitest'
import { makeStagedVectorReveal, orderRevealParts } from './stagedVectorReveal'

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

  it('leaves a glyph a setting has switched off hidden', () => {
    const a = makeArrow()
    a.visible = false
    a.userData.hiddenBySetting = true
    const animate = makeStagedVectorReveal([{ obj: a, full: 10 }])

    animate(1)
    expect(a.calls.at(-1)).toBeCloseTo(10)
    expect(a.visible).toBe(false)
  })

  it('gives a delegated reveal a slot per arrow it owns, not one slot', () => {
    const inner = makeStagedVectorReveal([
      { obj: makeArrow(), full: 1 },
      { obj: makeArrow(), full: 1 },
    ])
    const seen = []
    const delegate = (raw) => seen.push(raw)
    delegate.stages = inner.stages
    const c = makeArrow()
    const animate = makeStagedVectorReveal([{ animate: delegate }, { obj: c, full: 30 }])

    expect(inner.stages).toBe(2)
    animate(2 / 3) // the delegate owns two of the three slots
    expect(seen.at(-1)).toBe(1)
    expect(c.calls.at(-1)).toBe(0)

    animate(1 / 3) // half way through the delegate's own two stages
    expect(seen.at(-1)).toBeCloseTo(0.5)
  })

  it('grows coincident glyphs together in one stage', () => {
    const a = makeArrow()
    const b = makeArrow()
    const c = makeArrow()
    const animate = makeStagedVectorReveal([
      { objs: [a, b], full: 10 },
      { obj: c, full: 20 },
    ])

    animate(0.5) // first stage done, second not started
    expect(a.calls.at(-1)).toBeCloseTo(10)
    expect(b.calls.at(-1)).toBeCloseTo(10)
    expect(c.calls.at(-1)).toBe(0)
    expect(a.visible).toBe(true)
    expect(b.visible).toBe(true)
    expect(c.visible).toBe(false)
  })
})

describe('orderRevealParts', () => {
  const at = (anchor, tip) => ({ anchor, tip })

  it('keeps socket order when nothing hangs off anything', () => {
    const u = at([0, 0, 0], [1, 3, 2])
    const v = at([0, 0, 0], [1, -2, 1])
    expect(orderRevealParts([u, v])).toEqual([u, v])
  })

  it('reveals the arrow that supplies the other tail first', () => {
    // u is the "from point:" operand: its tail sits on v's tip.
    const u = at([1, 3, 2], [2, 1, 3])
    const v = at([0, 0, 0], [1, 3, 2])
    expect(orderRevealParts([u, v])).toEqual([v, u])
  })

  it('orders a longer chain', () => {
    const c = at([3, 0, 0], [6, 0, 0])
    const a = at([0, 0, 0], [1, 0, 0])
    const b = at([1, 0, 0], [3, 0, 0])
    expect(orderRevealParts([c, a, b])).toEqual([a, b, c])
  })

  it('terminates on a degenerate cycle', () => {
    const a = { anchor: [0, 0, 0], tip: [0, 0, 0] }
    const b = { anchor: [0, 0, 0], tip: [0, 0, 0] }
    expect(orderRevealParts([a, b])).toHaveLength(2)
  })

  it('leaves parts carrying no tails alone', () => {
    const a = { full: 1 }
    const b = { full: 2 }
    expect(orderRevealParts([a, b])).toEqual([a, b])
  })
})
