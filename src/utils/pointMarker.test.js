import { describe, it, expect, beforeEach } from 'vitest'
import useSettingsStore from '@/store/useSettingsStore'
import {
  POINT_MARKER_RADIUS,
  applyPointFinish,
  createPointMarker,
  createPointMaterial,
  resetPointMarkerRegistry,
} from './pointMarker'

const setMatte = (on) => useSettingsStore.getState().updateSetting('mattePoints', on)

describe('pointMarker', () => {
  beforeEach(() => {
    useSettingsStore.getState().clearExerciseOverrides()
    useSettingsStore.getState().resetSettings()
    resetPointMarkerRegistry()
  })

  it('defaults to the matte finish', () => {
    expect(useSettingsStore.getState().settings.mattePoints).toBe(true)
    expect(createPointMaterial(0x112233).roughness).toBe(1)
  })

  it('applyPointFinish swaps between the sheen and matte finishes', () => {
    const material = {}
    applyPointFinish(material, { mattePoints: false })
    expect(material).toEqual({ roughness: 0.35, metalness: 0.05 })
    applyPointFinish(material, { mattePoints: true })
    expect(material).toEqual({ roughness: 1, metalness: 0 })
  })

  it('builds a marker at the default radius, tagged for the zoom scaler', () => {
    const marker = createPointMarker({ color: 0x112233 })
    expect(marker.geometry.parameters.radius).toBe(POINT_MARKER_RADIUS)
    // GlyphSizing keys off both of these; a marker missing them never scales.
    expect(marker.userData.zoomInvariantRadius).toBe(POINT_MARKER_RADIUS)
    expect(marker.userData.zoomInvariantUniform).toBe(true)
  })

  it('tags zoomInvariantRadius with the radius actually used, not the default', () => {
    const marker = createPointMarker({ color: 0x112233, radius: 0.04 })
    expect(marker.geometry.parameters.radius).toBe(0.04)
    expect(marker.userData.zoomInvariantRadius).toBe(0.04)
  })

  it('only sets geoType and srcBlockId when they are given', () => {
    const bare = createPointMarker({ color: 0x112233 })
    expect('geoType' in bare.userData).toBe(false)
    expect('srcBlockId' in bare.userData).toBe(false)

    const tagged = createPointMarker({ color: 0x112233, geoType: 'point', srcBlockId: 'b1' })
    expect(tagged.userData.geoType).toBe('point')
    expect(tagged.userData.srcBlockId).toBe('b1')
  })

  it('takes the current finish at build time', () => {
    setMatte(true)
    expect(createPointMaterial(0x112233).roughness).toBe(1)
    setMatte(false)
    expect(createPointMaterial(0x112233).roughness).toBe(0.35)
  })

  // The point of the registry: nothing re-runs the generated code when a
  // setting changes, so live materials have to be repainted in place.
  it('repaints materials already built when the setting changes', () => {
    setMatte(false)
    const material = createPointMaterial(0x112233)
    expect(material.roughness).toBe(0.35)
    setMatte(true)
    expect(material.roughness).toBe(1)
    expect(material.metalness).toBe(0)
    setMatte(false)
    expect(material.roughness).toBe(0.35)
  })

  it('stops repainting materials from a previous run once the registry is reset', () => {
    setMatte(false)
    const stale = createPointMaterial(0x112233)
    resetPointMarkerRegistry()
    const current = createPointMaterial(0x112233)

    setMatte(true)
    expect(current.roughness).toBe(1)
    // The previous run's scene is gone; repainting its materials is wasted work
    // that grows with every rebuild.
    expect(stale.roughness).toBe(0.35)
  })
})
