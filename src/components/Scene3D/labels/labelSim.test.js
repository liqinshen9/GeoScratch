import { describe, it, expect } from 'vitest'
import { stepLabelSim, minkowskiSafeDist, GAP, MAX_OFFSET } from './labelSim'

const DT = 1 / 60

function label(cx, cy, width = 70, height = 22, mass = 1) {
  return {
    cx,
    cy,
    hw: width / 2,
    hh: height / 2,
    offsetX: 0,
    offsetY: 0,
    velX: 0,
    velY: 0,
    mass,
  }
}

function run(entries, frames) {
  const trail = entries.map(() => [])
  for (let f = 0; f < frames; f++) {
    stepLabelSim(entries, DT)
    entries.forEach((e, i) => trail[i].push([e.offsetX, e.offsetY]))
  }
  return trail
}

// Largest distance any label travels in a single frame over the given window.
function peakFrameMotion(trail, fromFrame) {
  let peak = 0
  for (const path of trail) {
    for (let f = Math.max(1, fromFrame); f < path.length; f++) {
      peak = Math.max(peak, Math.hypot(path[f][0] - path[f - 1][0], path[f][1] - path[f - 1][1]))
    }
  }
  return peak
}

function overlapDepth(a, b) {
  const x = a.hw + b.hw - Math.abs(a.cx + a.offsetX - (b.cx + b.offsetX))
  const y = a.hh + b.hh - Math.abs(a.cy + a.offsetY - (b.cy + b.offsetY))
  return x > 0 && y > 0 ? Math.min(x, y) : 0
}

function worstOverlap(entries) {
  let worst = 0
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++)
      worst = Math.max(worst, overlapDepth(entries[i], entries[j]))
  return worst
}

// A cluster far denser than its labels can fit -- there is no overlap-free
// arrangement, so this is the layout that used to buzz indefinitely.
function denseCluster(n) {
  return Array.from({ length: n }, (_, i) =>
    label(400 + ((i * 29) % 50), 300 + ((i * 41) % 36), 70 + ((i * 13) % 50)),
  )
}

describe('minkowskiSafeDist', () => {
  it('returns the half-extent along an axis-aligned direction', () => {
    expect(minkowskiSafeDist(1, 0, 40, 20)).toBe(40)
    expect(minkowskiSafeDist(0, -1, 40, 20)).toBe(20)
  })

  it('picks whichever rect face the ray exits first', () => {
    const d = Math.SQRT1_2
    expect(minkowskiSafeDist(d, d, 40, 20)).toBeCloseTo(20 / d, 6)
  })
})

describe('stepLabelSim', () => {
  it('separates two overlapping labels and leaves a visible gap', () => {
    const entries = [label(400, 300), label(430, 300)]
    run(entries, 240)
    expect(worstOverlap(entries)).toBe(0)
    const gapX = Math.abs(entries[0].cx + entries[0].offsetX - (entries[1].cx + entries[1].offsetX))
    const gapY = Math.abs(entries[0].cy + entries[0].offsetY - (entries[1].cy + entries[1].offsetY))
    const clearX = gapX - (entries[0].hw + entries[1].hw)
    const clearY = gapY - (entries[0].hh + entries[1].hh)
    expect(Math.max(clearX, clearY)).toBeGreaterThan(GAP / 2)
  })

  it('fans perfectly coincident labels apart', () => {
    const entries = [label(400, 300), label(400, 300), label(400, 300)]
    run(entries, 240)
    expect(worstOverlap(entries)).toBe(0)
  })

  it('leaves a label with nothing to avoid at its home offset', () => {
    const entries = [label(400, 300)]
    const trail = run(entries, 120)
    // Home is up-and-right of the anchor, never (0, 0).
    expect(entries[0].offsetX).toBeGreaterThan(0)
    expect(entries[0].offsetY).toBeLessThan(0)
    expect(peakFrameMotion(trail, 60)).toBe(0)
  })

  it('comes to rest, and stays at rest, in a crowded cluster', () => {
    // The regression this pins: the contact regime is far stiffer than the
    // spring, and with spring damping alone it rang forever -- clusters of six
    // or more labels held a ~10px limit cycle that never decayed.
    // See docs/architecture/label-declutter.md#contact-damping.
    for (const n of [6, 8, 12]) {
      const entries = denseCluster(n)
      const trail = run(entries, 900)
      expect(peakFrameMotion(trail, 600)).toBeLessThan(0.1)
    }
  })

  it('holds still while a neighbour is dragged past it', () => {
    const entries = [label(400, 300), label(300, 300)]
    run(entries, 120)
    const trail = entries.map(() => [])
    for (let f = 0; f < 300; f++) {
      entries[1].cx = 300 + f * 0.6 // sweep through and out the far side
      stepLabelSim(entries, DT)
      entries.forEach((e, i) => trail[i].push([e.cx + e.offsetX, e.cy + e.offsetY]))
    }
    // Motion should track the sweep, not chatter on top of it: 0.6px/frame of
    // anchor travel must not provoke multi-pixel jumps.
    expect(peakFrameMotion(trail, 1)).toBeLessThan(3)
  })

  it('never drifts further than the offset cap', () => {
    const entries = denseCluster(12)
    run(entries, 600)
    for (const e of entries) {
      expect(Math.hypot(e.offsetX, e.offsetY)).toBeLessThanOrEqual(MAX_OFFSET + 1e-6)
    }
  })

  it('reports motion while settling and quiet once settled', () => {
    const entries = [label(400, 300), label(430, 300)]
    expect(stepLabelSim(entries, DT)).toBe(true)
    run(entries, 600)
    expect(stepLabelSim(entries, DT)).toBe(false)
  })

  it('is stable when a slow frame arrives', () => {
    const entries = denseCluster(8)
    for (let f = 0; f < 300; f++) stepLabelSim(entries, f % 20 === 0 ? 0.5 : DT)
    for (const e of entries) {
      expect(Number.isFinite(e.offsetX)).toBe(true)
      expect(Number.isFinite(e.offsetY)).toBe(true)
    }
  })
})
