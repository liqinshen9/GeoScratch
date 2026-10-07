import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { hideLinesUnderVectors } from './vectorsAlongLines'

const line = (mid, direction) => {
  const group = new THREE.Group()
  group.userData = {
    geoType: 'geo_vector_line',
    segmentMid: mid,
    direction,
    setGapZones: vi.fn(),
  }
  return group
}

const vector = (origin, direction, length) => {
  const glyph = new THREE.Group()
  // The z-fight jitter every glyph carries.
  glyph.position.set(0.0015, 0, 0)
  glyph.userData = {
    vectorOrigin: origin,
    vectorDirection: direction.clone().normalize(),
    vectorLength: length,
    setVectorLength: () => {},
  }
  return glyph
}

const gapsOf = (l) => l.userData.setGapZones.mock.calls.at(-1)[0]

describe('hideLinesUnderVectors', () => {
  it('does not cut a line for a vector hidden by its reveal or an ancestor', () => {
    const L = line(new THREE.Vector3(), new THREE.Vector3(1, 0, 0))
    const glyph = vector(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), 2)
    glyph.visible = false
    hideLinesUnderVectors({ L, glyph })
    expect(gapsOf(L)).toEqual([])
    glyph.visible = true
    const parent = new THREE.Group()
    parent.visible = false
    parent.add(glyph)
    hideLinesUnderVectors({ L, parent })
    expect(gapsOf(L)).toEqual([])
  })

  it('updates gaps as a vector grows and avoids rebuilding unchanged gaps', () => {
    const L = line(new THREE.Vector3(), new THREE.Vector3(1, 0, 0))
    const glyph = vector(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), 0.5)
    hideLinesUnderVectors({ L, glyph })
    expect(gapsOf(L)).toEqual([{ start: 0, end: 0.5 }])
    glyph.userData.vectorLength = 2
    hideLinesUnderVectors({ L, glyph })
    expect(gapsOf(L)).toEqual([{ start: 0, end: 2 }])
    hideLinesUnderVectors({ L, glyph })
    expect(L.userData.setGapZones).toHaveBeenCalledTimes(2)
  })

  it('uses the moving line pose rather than its completed geometry', () => {
    const L = line(new THREE.Vector3(), new THREE.Vector3(1, 0, 0))
    const glyph = vector(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), 2)
    hideLinesUnderVectors({ L, glyph })
    expect(gapsOf(L)).toHaveLength(1)
    L.position.y = 3
    hideLinesUnderVectors({ L, glyph })
    expect(gapsOf(L)).toEqual([])
    L.position.y = 0
    L.rotation.z = Math.PI / 2
    hideLinesUnderVectors({ L, glyph })
    expect(gapsOf(L)).toEqual([])
  })

  it('maps world-space vector coverage into a stretched line frame', () => {
    const L = line(new THREE.Vector3(), new THREE.Vector3(1, 0, 0))
    L.scale.x = 2
    L.position.x = 1
    const glyph = vector(new THREE.Vector3(3, 0, 0), new THREE.Vector3(1, 0, 0), 4)
    hideLinesUnderVectors({ L, glyph })
    expect(gapsOf(L)).toEqual([{ start: 1, end: 3 }])
    const parent = new THREE.Group()
    parent.scale.x = 2
    parent.add(glyph)
    hideLinesUnderVectors({ L, parent })
    expect(gapsOf(L)).toEqual([{ start: 2.5, end: 6.5 }])
  })

  it('leaves out the stretch of a line a vector covers', () => {
    const N = line(new THREE.Vector3(), new THREE.Vector3(1, 0, 0))
    hideLinesUnderVectors({
      N,
      n: vector(new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0), 2),
    })
    const [gap] = gapsOf(N)
    expect(gap.start).toBeCloseTo(1)
    expect(gap.end).toBeCloseTo(3)
  })

  it('measures along the line whichever way the vector points', () => {
    const N = line(new THREE.Vector3(), new THREE.Vector3(1, 0, 0))
    hideLinesUnderVectors({ N, n: vector(new THREE.Vector3(), new THREE.Vector3(-1, 0, 0), 2) })
    const [gap] = gapsOf(N)
    expect(gap.start).toBeCloseTo(-2)
    expect(gap.end).toBeCloseTo(0)
  })

  it('keeps the line whole for a vector crossing it or beside it', () => {
    const L = line(new THREE.Vector3(), new THREE.Vector3(1, 0, 0))
    hideLinesUnderVectors({
      L,
      crossing: vector(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 2),
      beside: vector(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), 2),
    })
    expect(gapsOf(L)).toEqual([])
  })

  it('finds a vector nested inside another block’s group', () => {
    const L1 = line(new THREE.Vector3(3, 0, -3), new THREE.Vector3(1, 0, -1))
    const cross = new THREE.Group()
    cross.add(vector(new THREE.Vector3(), new THREE.Vector3(1, 0, -1), Math.SQRT2))
    hideLinesUnderVectors({ L1, cross })
    expect(gapsOf(L1)).toHaveLength(1)
  })
})
