import { describe, expect, it } from 'vitest'
import { assignHues, deltaE2000 } from './categoricalPalette'

describe('deltaE2000', () => {
  // Sharma, Wu & Dalal (2005) test pairs 1, 7 and 17.
  it.each([
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
  ])('%j vs %j is %d', (lab1, lab2, expected) => {
    expect(deltaE2000(lab1, lab2)).toBeCloseTo(expected, 4)
  })
})

describe('assignHues', () => {
  it('gives each key the hue nearest its reference, across the 0/360 seam', () => {
    expect(assignHues([10, 120, 240], { a: 235, b: 355, c: 125 })).toEqual({
      a: 240,
      b: 10,
      c: 120,
    })
  })
})
