import { describe, expect, it } from 'vitest'
import {
  VIEW_HEIGHT_REFERENCE,
  tubeWidthPx,
  tubeWidthScale,
  viewHeightFactor,
} from './zoomInvariantScale'

describe('view-height glyph sizing', () => {
  it('is 1 at the reference height and grows as the view gets shorter', () => {
    expect(viewHeightFactor(VIEW_HEIGHT_REFERENCE)).toBe(1)
    expect(viewHeightFactor(640)).toBeCloseTo(820 / 640)
    expect(viewHeightFactor(0)).toBe(VIEW_HEIGHT_REFERENCE)
  })

  it('scales a tube to the target pixel width', () => {
    // A plain line tube used to be about 1.8px at the reference height.
    expect(tubeWidthPx(0.051, 45)).toBeCloseTo(1.81, 2)
    expect(tubeWidthPx(0.051, 45) * tubeWidthScale(0.051, 45, 2.6)).toBeCloseTo(2.6)
    expect(tubeWidthPx(0.045, 45) * tubeWidthScale(0.045, 45, 2.6)).toBeCloseTo(2.6)
  })
})
