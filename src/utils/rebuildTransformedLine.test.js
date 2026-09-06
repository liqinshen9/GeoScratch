// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest'

// The real colorSystem pulls in @material/material-color-utilities, which has an
// ESM subpath that doesn't resolve under vitest. geoVectorLineDefinition reads
// colors from window.GeoScratchColors (stubbed below), not this import.
vi.mock('@/store/colorSystem', () => ({
  forInstance: () => '#3366cc',
  forInstanceVariant: () => '#3366cc',
  forRole: () => '#ff8800',
  subscribeToPreset: () => () => {},
}))

import * as THREEBase from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { createVectorNotationRuntime } from '@/utils/vectorNotation'
import { geoVectorLineDefinition } from '@/components/BlocksCanvas/blocks/geometric/geoVectorLine'
import { rebuildTransformedLine } from '@/utils/generateAndRun'

const THREE = {
  ...THREEBase,
  Line2,
  LineGeometry,
  LineMaterial,
  LineSegments2,
  LineSegmentsGeometry,
}

beforeAll(() => {
  window.THREE = THREE
  window.threeObjStore = {}
  window.vectorNotation = createVectorNotationRuntime()
  window.GeoScratchColors = {
    forInstance: () => '#3366cc',
    forInstanceVariant: () => '#3366cc',
    forRole: () => '#ff8800',
  }
  // jsdom has no 2D canvas context; the line's ring-texture builder only needs
  // fillStyle/fillRect to run.
  const noop = () => {}
  const fakeCtx = new Proxy(
    { fillStyle: '', canvas: null },
    {
      get: (target, key) => (key in target ? target[key] : noop),
      set: (target, key, value) => ((target[key] = value), true),
    },
  )
  HTMLCanvasElement.prototype.getContext = () => fakeCtx
})

function buildLine(origin, direction, blockId, t) {
  window.threeObjStore[blockId] = undefined
  return geoVectorLineDefinition(origin.clone(), direction.clone(), t, blockId)
}

describe('rebuildTransformedLine', () => {
  it('re-extends a rotated line to the bounding box instead of spinning the baked segment', () => {
    // A line through the origin along (1,1,1): its half-length is the distance
    // from the origin to a box wall along that diagonal.
    const line = buildLine(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1), 'line-a')
    const halfBefore = line.userData.segmentHalfLength

    // 90 deg about X: (1,1,1) -> (1,-1,1) (still a body diagonal, same length),
    // so the re-extended half-length should match, NOT stay the frozen value
    // (which is what applyMatrix4 would give -- identical here by luck) ...
    // use 45 deg about Z instead: (1,1,1) -> (0, sqrt2, 1), a shorter ray to
    // the wall, so the correct half-length is strictly smaller.
    const rot = new THREE.Matrix4().makeRotationZ(Math.PI / 4)
    const rebuilt = rebuildTransformedLine(line, rot)

    expect(rebuilt).not.toBe(line)
    expect(window.threeObjStore['line-a']).toBe(rebuilt)

    // direction rotated
    const dir = rebuilt.userData.direction.clone().normalize()
    const expectedDir = new THREE.Vector3(1, 1, 1).normalize().applyMatrix4(rot)
    expect(dir.x).toBeCloseTo(expectedDir.x, 5)
    expect(dir.y).toBeCloseTo(expectedDir.y, 5)
    expect(dir.z).toBeCloseTo(expectedDir.z, 5)

    // extent recomputed for the new direction (shorter ray to the wall)
    expect(rebuilt.userData.segmentHalfLength).toBeLessThan(halfBefore - 1e-6)

    // still spans wall-to-wall: endpoints on the 20-unit box faces
    const maxCoord = Math.max(
      ...['x', 'y', 'z'].map((a) =>
        Math.abs(rebuilt.userData.segmentMid[a] + dir[a] * rebuilt.userData.segmentHalfLength),
      ),
    )
    expect(maxCoord).toBeCloseTo(20, 4)
  })

  it('translates the origin (point), ignoring the translation for the direction', () => {
    const line = buildLine(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 'line-b')
    const move = new THREE.Matrix4().makeTranslation(3, 4, 0)
    const rebuilt = rebuildTransformedLine(line, move)

    expect(rebuilt.userData.origin.x).toBeCloseTo(4, 5)
    expect(rebuilt.userData.origin.y).toBeCloseTo(4, 5)
    const dir = rebuilt.userData.direction.clone().normalize()
    expect(dir.z).toBeCloseTo(1, 5)
    expect(dir.x).toBeCloseTo(0, 5)
  })

  it('clips to the box when a large translation moves the origin outside it', () => {
    // Line through the world origin along (1,1,1), then translated to (30,0,0):
    // it now only clips the box near a corner. The old per-axis exit heuristic
    // (origin-inside assumption) drew a segment out to x=50; the slab test
    // should keep both endpoints on the 20-unit faces.
    const line = buildLine(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1), 'line-d')
    const move = new THREE.Matrix4().makeTranslation(30, 0, 0)
    const rebuilt = rebuildTransformedLine(line, move)

    const dir = rebuilt.userData.direction.clone().normalize()
    const end = (sign) =>
      rebuilt.userData.segmentMid
        .clone()
        .addScaledVector(dir, sign * rebuilt.userData.segmentHalfLength)
    for (const p of [end(1), end(-1)]) {
      expect(Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z))).toBeLessThanOrEqual(20 + 1e-6)
    }
  })

  it('leaves non-line objects and non-matrices untouched', () => {
    const plain = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    expect(rebuildTransformedLine(plain, new THREE.Matrix4())).toBe(plain)

    const line = buildLine(new THREE.Vector3(), new THREE.Vector3(1, 1, 1), 'line-c')
    expect(rebuildTransformedLine(line, null)).toBe(line)
    expect(rebuildTransformedLine(line, {})).toBe(line)
  })
})
