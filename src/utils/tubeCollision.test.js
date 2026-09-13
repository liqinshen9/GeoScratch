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
  describe('clipped plane patches', () => {
    // A plane in z = 0 whose drawn outline is a square cut off by a wall at x = 3.
    const clippedPatch = () => {
      const plane = makePlane({ planeSize: 12 })
      plane.userData.planePolygon = [
        [-6, -6],
        [3, -6],
        [3, 6],
        [-6, 6],
      ]
      return plane
    }

    it('ends the zone at the drawn edge, not the unclipped square', () => {
      const line = makeLine({ direction: new THREE.Vector3(1, 0, 0) })
      applyTubeCollisions({ line, plane: clippedPatch() })
      const zones = line.userData.setCollisionZones.mock.calls[0][0]
      expect(zones).toHaveLength(1)
      expect(zones[0].start).toBeCloseTo(-6 - TUBE_RADIUS, 9)
      expect(zones[0].end).toBeCloseTo(3 + TUBE_RADIUS, 9)
    })

    it('clips against slanted edges, whichever way the outline winds', () => {
      const triangle = [
        [0, 0],
        [8, 0],
        [0, 8],
      ]
      for (const polygon of [triangle, [...triangle].reverse()]) {
        const plane = makePlane({ planeSize: 40 })
        plane.userData.planePolygon = polygon
        // y = 2 crosses the triangle from x = 0 to x = 6.
        const line = makeLine({ mid: new THREE.Vector3(0, 2, 0) })
        applyTubeCollisions({ line, plane })
        const [zone] = line.userData.setCollisionZones.mock.calls[0][0]
        expect(zone.start).toBeCloseTo(-TUBE_RADIUS, 9)
        expect(zone.end).toBeCloseTo(6 + TUBE_RADIUS * Math.SQRT2, 9)
      }
    })

    it('misses a patch the line lies beside but outside of', () => {
      const line = makeLine({ mid: new THREE.Vector3(0, 9, 0) })
      applyTubeCollisions({ line, plane: clippedPatch() })
      expect(line.userData.setCollisionZones).toHaveBeenCalledWith([])
    })
  })

  describe('annotated objects', () => {
    // What "show point on object" stores in place of the object it wraps.
    function annotate(object) {
      const group = new THREE.Group()
      const marker = new THREE.Object3D()
      marker.userData = { geoType: 'selectable_point_marker' }
      group.add(object, marker)
      group.userData = { geoType: 'annotated_object' }
      return group
    }

    it('collides a wrapped plane as its square, not as the group bounding box', () => {
      // A tilted plane: its world AABB is far larger than the square itself.
      const normal = new THREE.Vector3(0, 1, 1).normalize()
      const plane = makePlane({ normal, planeSize: 4 })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4))
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
      plane.add(mesh)
      const line = makeLine({ direction: new THREE.Vector3(1, 0, 0) })

      applyTubeCollisions({ line, wrapped: annotate(plane) })

      const zones = line.userData.setCollisionZones.mock.calls[0][0]
      expect(zones).toHaveLength(1)
      expect(zones[0].start).toBeCloseTo(-2 - TUBE_RADIUS, 6)
      expect(zones[0].end).toBeCloseTo(2 + TUBE_RADIUS, 6)
    })

    it('never collides a line with a wrapped line', () => {
      const line = makeLine()
      const twin = makeLine()
      twin.add(new THREE.Mesh(new THREE.BoxGeometry(20, 0.1, 0.1)))

      applyTubeCollisions({ line, wrapped: annotate(twin) })

      expect(line.userData.setCollisionZones).toHaveBeenCalledWith([])
      expect(twin.userData.setCollisionZones).toHaveBeenCalledWith([])
    })

    it('still gives a wrapped line its zones', () => {
      const line = makeLine()
      const sphere = makeSphere({ position: new THREE.Vector3(5, 0, 0), radius: 1 })

      applyTubeCollisions({ wrapped: annotate(line), sphere })

      const zones = line.userData.setCollisionZones.mock.calls[0][0]
      expect(zones).toHaveLength(1)
      expect(zones[0].start).toBeCloseTo(5 - 1 - TUBE_RADIUS, 2)
    })
  })
})
