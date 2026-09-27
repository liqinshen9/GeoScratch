import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CAMERA_POSITION,
  OVERHEAD_LIGHT_POSITION,
  positionFromOrbit,
} from './sceneConstants'

describe('positionFromOrbit', () => {
  it('puts azimuth 45 / elevation 35.26 on the isometric (1, 1, 1) diagonal', () => {
    const elevationDeg = (Math.atan(1 / Math.SQRT2) * 180) / Math.PI
    const [x, y, z] = positionFromOrbit({ distance: 10, azimuthDeg: 45, elevationDeg })
    expect(x).toBeCloseTo(10 / Math.sqrt(3))
    expect(y).toBeCloseTo(10 / Math.sqrt(3))
    expect(z).toBeCloseTo(10 / Math.sqrt(3))
  })

  it('puts the overhead light on the left of the default view', () => {
    const [cx, , cz] = DEFAULT_CAMERA_POSITION
    const [lx, ly, lz] = OVERHEAD_LIGHT_POSITION
    // Screen-right of a camera looking at the origin from (cx, cz) is (cz, -cx) in XZ.
    expect(lx * cz - lz * cx).toBeLessThan(0)
    expect(ly).toBeGreaterThan(0)
  })

  it('measures azimuth from +Z towards +X', () => {
    const [x, y, z] = positionFromOrbit({ distance: 5, azimuthDeg: 90, elevationDeg: 0 })
    expect(x).toBeCloseTo(5)
    expect(y).toBeCloseTo(0)
    expect(z).toBeCloseTo(0)
  })
})
