import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { bakeLineTransformAnimation } from './lineTransformAnimation'

// Line-vs-AABB slab test, matching the one geoVectorLineDefinition builds with
// and hands to the transform layer as userData.boxInterval.
const BOX_HALF_EXTENT = 20
function lineBoxInterval(rayOrigin, rayDir) {
  let tEnter = -Infinity
  let tExit = Infinity
  for (const axis of ['x', 'y', 'z']) {
    const o = rayOrigin[axis]
    const d = rayDir[axis]
    if (Math.abs(d) < 1e-9) {
      if (o < -BOX_HALF_EXTENT || o > BOX_HALF_EXTENT) return null
      continue
    }
    let tNear = (-BOX_HALF_EXTENT - o) / d
    let tFar = (BOX_HALF_EXTENT - o) / d
    if (tNear > tFar) [tNear, tFar] = [tFar, tNear]
    tEnter = Math.max(tEnter, tNear)
    tExit = Math.min(tExit, tFar)
  }
  if (!Number.isFinite(tEnter) || !Number.isFinite(tExit) || tExit < tEnter) return null
  return [tEnter, tExit]
}

// Stands in for a built line group: the extent baked into its geometry, plus
// the userData bakeLineTransformAnimation reads. `t` adds the marker.
function makeLine(origin, direction, { t, jitter = new THREE.Vector3() } = {}) {
  const unit = direction.clone().normalize()
  const extent = lineBoxInterval(origin, unit)
  const group = new THREE.Group()
  group.position.copy(jitter)

  let marker = null
  if (t !== undefined) {
    marker = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), new THREE.MeshBasicMaterial())
    marker.position.copy(origin).addScaledVector(direction, t)
    group.add(marker)
  }

  group.userData = {
    geoType: 'geo_vector_line',
    srcBlockId: 'line-1',
    origin: origin.clone(),
    direction: direction.clone(),
    boxInterval: lineBoxInterval,
    boxExtent: extent,
    tMarker: marker,
    t,
  }
  group.updateMatrixWorld(true)
  return group
}

// The two ends of the line's geometry, in world space, at the current pose.
function bakedEndpoints(line) {
  const { origin, direction, boxExtent } = line.userData
  const unit = direction.clone().normalize()
  return [
    origin.clone().addScaledVector(unit, boxExtent[0]).applyMatrix4(line.matrix),
    origin.clone().addScaledVector(unit, boxExtent[1]).applyMatrix4(line.matrix),
  ]
}

function expectedEndpoints(origin, direction) {
  const unit = direction.clone().normalize()
  const [enter, exit] = lineBoxInterval(origin, unit)
  return [origin.clone().addScaledVector(unit, enter), origin.clone().addScaledVector(unit, exit)]
}

function expectVectorClose(actual, expected, precision = 5) {
  expect(actual.x).toBeCloseTo(expected.x, precision)
  expect(actual.y).toBeCloseTo(expected.y, precision)
  expect(actual.z).toBeCloseTo(expected.z, precision)
}

describe('bakeLineTransformAnimation', () => {
  it('opts the line in, keyed to the line block and the pipelines driving it', () => {
    const line = makeLine(new THREE.Vector3(10, 0, 0), new THREE.Vector3(1, 1, 1))
    bakeLineTransformAnimation(line, new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1), [
      'pipe-1',
    ])

    expect(typeof line.userData.animate).toBe('function')
    expect(line.userData.animAliasBlockIds).toEqual(['pipe-1'])
  })

  it('leaves the line untouched at progress 1', () => {
    const line = makeLine(new THREE.Vector3(10, 0, 0), new THREE.Vector3(1, 1, 1))
    const resting = line.matrix.clone()
    bakeLineTransformAnimation(line, new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1), [
      'pipe-1',
    ])

    line.userData.animate(1)

    expect(line.matrixAutoUpdate).toBe(true)
    expect(line.matrix.elements).toEqual(resting.elements)
  })

  it('re-clips a translated line to the bounding box at progress 0', () => {
    const start = { origin: new THREE.Vector3(0, 0, 0), direction: new THREE.Vector3(1, 1, 1) }
    const line = makeLine(new THREE.Vector3(10, 0, 0), start.direction.clone())
    bakeLineTransformAnimation(line, start.origin.clone(), start.direction.clone(), ['pipe-1'])

    line.userData.animate(0)

    const [a, b] = bakedEndpoints(line)
    const [expectedA, expectedB] = expectedEndpoints(start.origin, start.direction)
    expectVectorClose(a, expectedA)
    expectVectorClose(b, expectedB)
  })

  it('re-clips a rotated line to the bounding box at progress 0', () => {
    const start = { origin: new THREE.Vector3(2, 1, 0), direction: new THREE.Vector3(1, 0, 0) }
    const line = makeLine(new THREE.Vector3(2, 1, 0), new THREE.Vector3(0, 0, 3))
    bakeLineTransformAnimation(line, start.origin.clone(), start.direction.clone(), ['pipe-1'])

    line.userData.animate(0)

    const [a, b] = bakedEndpoints(line)
    const [expectedA, expectedB] = expectedEndpoints(start.origin, start.direction)
    expectVectorClose(a, expectedA)
    expectVectorClose(b, expectedB)
  })

  it("carries the build's z-fight jitter through the animation, still sub-visual", () => {
    const start = { origin: new THREE.Vector3(2, 1, 0), direction: new THREE.Vector3(1, 0, 0) }
    const jitter = new THREE.Vector3(0.001, 0, 0.0005)
    const line = makeLine(new THREE.Vector3(2, 1, 0), new THREE.Vector3(0, 0, 3), { jitter })
    bakeLineTransformAnimation(line, start.origin.clone(), start.direction.clone(), ['pipe-1'])

    line.userData.animate(0)

    // The jitter is transformed along with the geometry, so it does not simply
    // subtract back out -- but it stays the same imperceptible size it was.
    const [a] = bakedEndpoints(line)
    const [expectedA] = expectedEndpoints(start.origin, start.direction)
    expect(a.distanceTo(expectedA)).toBeLessThan(jitter.length() * 1.001)
  })

  it('keeps every intermediate pose spanning the box, on the interpolated line', () => {
    const startOrigin = new THREE.Vector3(0, 0, 0)
    const startDirection = new THREE.Vector3(1, 0, 0)
    const line = makeLine(new THREE.Vector3(6, 4, 0), new THREE.Vector3(0, 1, 1))
    bakeLineTransformAnimation(line, startOrigin.clone(), startDirection.clone(), ['pipe-1'])

    for (const p of [0.15, 0.4, 0.75, 0.9]) {
      line.userData.animate(p)
      const [a, b] = bakedEndpoints(line)
      // Both ends sit on a wall of the 40-unit room...
      for (const end of [a, b]) {
        const onWall = ['x', 'y', 'z'].some(
          (axis) => Math.abs(Math.abs(end[axis]) - BOX_HALF_EXTENT) < 1e-3,
        )
        expect(onWall).toBe(true)
      }
      // ...and the segment still runs along the interpolated direction, which
      // is between the two ends of the animation.
      const dir = b.clone().sub(a).normalize()
      const angleToStart = dir.angleTo(startDirection.clone().normalize())
      const angleToEnd = dir.angleTo(line.userData.direction.clone().normalize())
      const total = startDirection
        .clone()
        .normalize()
        .angleTo(line.userData.direction.clone().normalize())
      expect(angleToStart + angleToEnd).toBeCloseTo(total, 4)
    }
  })

  it('never changes the line thickness (the stretch is along the line only)', () => {
    const line = makeLine(new THREE.Vector3(6, 4, 0), new THREE.Vector3(0, 1, 1))
    bakeLineTransformAnimation(line, new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), [
      'pipe-1',
    ])

    const unit = line.userData.direction.clone().normalize()
    // Two directions across the tube's axis: its cross-section, i.e. how thick
    // the line looks.
    const across = [
      new THREE.Vector3(1, 0, 0).cross(unit).normalize(),
      new THREE.Vector3(0, 0, 1).cross(unit).normalize(),
    ]

    for (const p of [0, 0.3, 0.6, 0.95]) {
      line.userData.animate(p)
      const linear = new THREE.Matrix3().setFromMatrix4(line.matrix)
      for (const axis of across) {
        expect(axis.clone().applyMatrix3(linear).length()).toBeCloseTo(1, 5)
      }
    }
  })

  it('rides the t marker along the interpolated line and keeps it round', () => {
    const startOrigin = new THREE.Vector3(0, 0, 0)
    const startDirection = new THREE.Vector3(1, 0, 0)
    const line = makeLine(new THREE.Vector3(6, 4, 0), new THREE.Vector3(0, 1, 1), { t: 2 })
    const marker = line.userData.tMarker
    const restingMarkerPos = marker.position.clone()
    bakeLineTransformAnimation(line, startOrigin.clone(), startDirection.clone(), ['pipe-1'])

    line.userData.animate(0)
    const world = new THREE.Vector3().setFromMatrixPosition(marker.matrixWorld)
    // progress 0 == the untransformed line, so the marker is at its own t there.
    expectVectorClose(world, startOrigin.clone().addScaledVector(startDirection, 2))

    const scale = new THREE.Vector3().setFromMatrixScale(marker.matrixWorld)
    expect(scale.x).toBeCloseTo(1, 5)
    expect(scale.y).toBeCloseTo(1, 5)
    expect(scale.z).toBeCloseTo(1, 5)

    line.userData.animate(1)
    expect(marker.matrixAutoUpdate).toBe(true)
    expectVectorClose(marker.position, restingMarkerPos)
  })
})
