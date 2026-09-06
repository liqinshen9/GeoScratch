import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { applyTubeCollisions } from './tubeCollision'

// Matches PLAIN_TUBE_RADIUS / SOLID_INFLATE in tubeCollision.js.
const TUBE_RADIUS = 0.051

function makeLine({
  mid = new THREE.Vector3(0, 0, 0),
  direction = new THREE.Vector3(1, 0, 0),
  halfLength = 10,
} = {}) {
  const group = new THREE.Group()
  const setCollisionZones = vi.fn()
  group.userData = {
    geoType: 'geo_vector_line',
    segmentMid: mid,
    direction,
    segmentHalfLength: halfLength,
    setCollisionZones,
  }
  return group
}

function makeSphere({ position, radius }) {
  const obj = new THREE.Object3D()
  obj.position.copy(position)
  obj.userData = {
    geoType: 'geo_sphere',
    centre: new THREE.Vector3(0, 0, 0),
    radius,
  }
  return obj
}

function makeCube({ position, size = 2 }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size))
  mesh.position.copy(position)
  mesh.userData = { geoType: 'geo_cube' }
  return mesh
}

// Matches parametricPlane.js's group.userData shape -- point is the plane's
// absolute defining point (not a local offset baked into obj.position, so
// obj itself is left at the identity transform, same as an untransformed
// plane group at runtime).
function makePlane({
  point = new THREE.Vector3(0, 0, 0),
  normal = new THREE.Vector3(0, 0, 1),
  planeSize = 12,
} = {}) {
  const obj = new THREE.Object3D()
  const normalUnit = normal.clone().normalize()
  obj.userData = {
    geoType: 'point_normal_plane_group',
    point: point.clone(),
    normalRaw: normalUnit.clone(),
    normalUnit,
    planeSize,
  }
  return obj
}

describe('applyTubeCollisions', () => {
  it('ignores lines with no solids in the scene', () => {
    const line = makeLine()
    applyTubeCollisions({ line })
    expect(line.userData.setCollisionZones).toHaveBeenCalledWith([])
  })

  it('finds the exact analytic collision zone where a line tube passes through a sphere', () => {
    const line = makeLine()
    const sphere = makeSphere({ position: new THREE.Vector3(5, 0, 0), radius: 1 })
    applyTubeCollisions({ line, sphere })

    expect(line.userData.setCollisionZones).toHaveBeenCalledTimes(1)
    const zones = line.userData.setCollisionZones.mock.calls[0][0]
    expect(zones).toHaveLength(1)
    expect(zones[0].start).toBeCloseTo(5 - 1 - TUBE_RADIUS, 2)
    expect(zones[0].end).toBeCloseTo(5 + 1 + TUBE_RADIUS, 2)
  })

  it('finds the collision zone where a line tube passes through a box solid', () => {
    const line = makeLine()
    const cube = makeCube({ position: new THREE.Vector3(-5, 0, 0), size: 2 })
    applyTubeCollisions({ line, cube })

    const zones = line.userData.setCollisionZones.mock.calls[0][0]
    expect(zones).toHaveLength(1)
    expect(zones[0].start).toBeCloseTo(-5 - 1 - TUBE_RADIUS, 2)
    expect(zones[0].end).toBeCloseTo(-5 + 1 + TUBE_RADIUS, 2)
  })

  it('reports no zone when the line misses the solid entirely', () => {
    const line = makeLine()
    const sphere = makeSphere({ position: new THREE.Vector3(5, 5, 0), radius: 1 })
    applyTubeCollisions({ line, sphere })
    expect(line.userData.setCollisionZones).toHaveBeenCalledWith([])
  })

  it('merges overlapping zones from multiple solids into one', () => {
    const line = makeLine()
    // Two overlapping spheres straddling x=5.
    const sphereA = makeSphere({ position: new THREE.Vector3(4.5, 0, 0), radius: 1 })
    const sphereB = makeSphere({ position: new THREE.Vector3(5.5, 0, 0), radius: 1 })
    applyTubeCollisions({ line, sphereA, sphereB })

    const zones = line.userData.setCollisionZones.mock.calls[0][0]
    expect(zones).toHaveLength(1)
    expect(zones[0].start).toBeCloseTo(4.5 - 1 - TUBE_RADIUS, 2)
    expect(zones[0].end).toBeCloseTo(5.5 + 1 + TUBE_RADIUS, 2)
  })

  it('keeps distinct, non-overlapping zones separate and sorted', () => {
    const line = makeLine()
    const sphere = makeSphere({ position: new THREE.Vector3(5, 0, 0), radius: 1 })
    const cube = makeCube({ position: new THREE.Vector3(-5, 0, 0), size: 2 })
    applyTubeCollisions({ line, sphere, cube })

    const zones = line.userData.setCollisionZones.mock.calls[0][0]
    expect(zones).toHaveLength(2)
    expect(zones[0].start).toBeLessThan(zones[1].start)
    expect(zones[0].end).toBeCloseTo(-5 + 1 + TUBE_RADIUS, 2)
    expect(zones[1].start).toBeCloseTo(5 - 1 - TUBE_RADIUS, 2)
  })

  it('ignores objects that are not recognized solid geo types', () => {
    const line = makeLine()
    const bystander = new THREE.Object3D()
    bystander.position.set(5, 0, 0)
    bystander.userData = { geoType: 'some_unrelated_type' }
    applyTubeCollisions({ line, bystander })
    expect(line.userData.setCollisionZones).toHaveBeenCalledWith([])
  })

  describe('plane collisions', () => {
    it('reports no zone when a line crosses a plane at a single point (not parallel)', () => {
      // Straight through the z=0 plane, perpendicular to its normal.
      const line = makeLine({ direction: new THREE.Vector3(0, 0, 1) })
      const plane = makePlane({
        point: new THREE.Vector3(0, 0, 0),
        normal: new THREE.Vector3(0, 0, 1),
      })
      applyTubeCollisions({ line, plane })
      expect(line.userData.setCollisionZones).toHaveBeenCalledWith([])
    })

    it('reports no zone for a line parallel to but offset away from the plane', () => {
      // Runs along x, parallel to the z=0 plane, but 5 units off it.
      const line = makeLine({
        mid: new THREE.Vector3(0, 0, 5),
        direction: new THREE.Vector3(1, 0, 0),
      })
      const plane = makePlane({
        point: new THREE.Vector3(0, 0, 0),
        normal: new THREE.Vector3(0, 0, 1),
      })
      applyTubeCollisions({ line, plane })
      expect(line.userData.setCollisionZones).toHaveBeenCalledWith([])
    })

    it("finds the zone clipped to the plane's finite square when the line lies in it", () => {
      // Runs along x, through the z=0 plane's own point, i.e. coincident with it.
      const line = makeLine({ direction: new THREE.Vector3(1, 0, 0), halfLength: 20 })
      const plane = makePlane({
        point: new THREE.Vector3(0, 0, 0),
        normal: new THREE.Vector3(0, 0, 1),
        planeSize: 12,
      })
      applyTubeCollisions({ line, plane })

      const zones = line.userData.setCollisionZones.mock.calls[0][0]
      expect(zones).toHaveLength(1)
      expect(zones[0].start).toBeCloseTo(-6 - TUBE_RADIUS, 2)
      expect(zones[0].end).toBeCloseTo(6 + TUBE_RADIUS, 2)
    })

    it("reports no zone when the coincident line runs entirely outside the plane's square", () => {
      // Still in the z=0 plane and parallel to it, but offset along y well
      // past the plane's own finite extent.
      const line = makeLine({
        mid: new THREE.Vector3(0, 10, 0),
        direction: new THREE.Vector3(1, 0, 0),
      })
      const plane = makePlane({
        point: new THREE.Vector3(0, 0, 0),
        normal: new THREE.Vector3(0, 0, 1),
        planeSize: 12,
      })
      applyTubeCollisions({ line, plane })
      expect(line.userData.setCollisionZones).toHaveBeenCalledWith([])
    })
  })
})
