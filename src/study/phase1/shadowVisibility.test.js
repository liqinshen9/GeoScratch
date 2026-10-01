import { describe, it, expect } from 'vitest'
import THREE from '@/utils/three'
import { OVERHEAD_LIGHT_POSITION } from '@/components/Scene3D/sceneConstants'
import { shadowOnRoom, shadowVisibleShare, targetShadowVisibility } from './shadowVisibility'
import { makeStudyCamera, getStudyStimulusSet } from './stimuli'

const light = new THREE.Vector3(...OVERHEAD_LIGHT_POSITION)
const camera = makeStudyCamera()

describe('shadowOnRoom', () => {
  it('drops a point straight below the light onto the floor', () => {
    const hit = shadowOnRoom(new THREE.Vector3(light.x, 0, light.z), light)
    expect(hit.face).toBe('NY')
    expect(hit.point.y).toBeCloseTo(-20)
    expect(hit.point.x).toBeCloseTo(light.x)
    expect(hit.point.z).toBeCloseTo(light.z)
  })
})

describe('shadowVisibleShare', () => {
  it('is 0 for a shadow thrown onto a near wall, which the camera culls', () => {
    // The trial camera sits beyond the +x and +z walls.
    expect(camera.position.x).toBeGreaterThan(20)
    const towardPX = light.clone().add(new THREE.Vector3((19 - light.x) * 0.9, -0.2, 0))
    expect(shadowOnRoom(towardPX, light).face).toBe('PX')
    expect(shadowVisibleShare({ kind: 'point', position: towardPX.toArray() }, camera, light)).toBe(
      0,
    )
  })

  it('gives a line the share of its length whose shadow is visible', () => {
    const share = shadowVisibleShare(
      { kind: 'line', origin: [0, 0, 0], direction: [1, 0, 0] },
      camera,
      light,
    )
    expect(share).toBeGreaterThanOrEqual(0)
    expect(share).toBeLessThanOrEqual(1)
  })
})

describe('targetShadowVisibility over the stimulus set', () => {
  const set = getStudyStimulusSet()
  const all = [...set.practice, ...set.measured]

  it('returns a share for both targets of every stimulus', () => {
    for (const s of all) {
      const { A, B } = targetShadowVisibility(s, camera)
      for (const share of [A, B]) {
        expect(share, s.id).toBeGreaterThanOrEqual(0)
        expect(share, s.id).toBeLessThanOrEqual(1)
      }
    }
  })
})
