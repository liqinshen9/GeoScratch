import { describe, it, expect } from 'vitest'
import THREE from './three'
import { getObjectFocus } from './sceneFocus'

function meshOfSize(size, position = [0, 0, 0], userData = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size))
  mesh.position.set(...position)
  Object.assign(mesh.userData, userData)
  return mesh
}

describe('getObjectFocus', () => {
  it('returns null when there is nothing to frame', () => {
    expect(getObjectFocus([])).toBeNull()
    expect(getObjectFocus([null, undefined])).toBeNull()
  })

  it('centres on a single object and sizes the radius to it', () => {
    const focus = getObjectFocus([meshOfSize(10, [4, 0, -2])])

    expect(focus.center.x).toBeCloseTo(4)
    expect(focus.center.z).toBeCloseTo(-2)
    expect(focus.radius).toBeCloseTo(5)
  })

  it('spans the union of several objects', () => {
    const focus = getObjectFocus([meshOfSize(2, [-10, 0, 0]), meshOfSize(2, [10, 0, 0])])

    expect(focus.center.x).toBeCloseTo(0)
    // -11 to 11 across, so half of the 22-unit extent.
    expect(focus.radius).toBeCloseTo(11)
  })

  it('ignores infinite plane meshes', () => {
    // A plane is unbounded; letting it into the bounds would zoom the camera out
    // until every real object was a speck.
    const focus = getObjectFocus([
      meshOfSize(2),
      meshOfSize(1000, [0, 0, 0], { geoType: 'plane_mesh' }),
    ])

    expect(focus.radius).toBeCloseTo(1)
  })

  it('floors the radius at 0.5 for a tiny object', () => {
    // Math.max(..., 1) * 0.5 -- without it the camera would fly inside a point
    // marker and clip through it.
    expect(getObjectFocus([meshOfSize(0.01)]).radius).toBeCloseTo(0.5)
  })

  it('accounts for a nested child transform', () => {
    const parent = new THREE.Group()
    parent.position.set(100, 0, 0)
    parent.add(meshOfSize(2))

    expect(getObjectFocus([parent]).center.x).toBeCloseTo(100)
  })

  it('skips objects that contain no renderable geometry', () => {
    expect(getObjectFocus([new THREE.Group()])).toBeNull()
  })
})
