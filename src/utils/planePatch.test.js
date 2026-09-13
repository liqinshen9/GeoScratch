import { describe, it, expect } from 'vitest'
import THREE from '@/utils/three'
import {
  PLANE_PATCH_WALL_INSET,
  SCENE_BOX_HALF_EXTENT,
  planePatchHalfSize,
  planePatchPoint,
  planePatchPolygon,
} from './planePatch'

function frame(normal) {
  const n = normal.clone().normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
  return {
    u: new THREE.Vector3(1, 0, 0).applyQuaternion(q),
    v: new THREE.Vector3(0, 1, 0).applyQuaternion(q),
  }
}

const toWorld = (centre, u, v, [s, t]) => centre.clone().addScaledVector(u, s).addScaledVector(v, t)

// Where the drawn patch stops: just inside the walls.
const LIMIT = SCENE_BOX_HALF_EXTENT - PLANE_PATCH_WALL_INSET

const insideBox = (p) => [p.x, p.y, p.z].every((c) => Math.abs(c) <= LIMIT + 1e-9)

function polygonArea(polygon) {
  let area = 0
  for (let i = 0; i < polygon.length; i += 1) {
    const [s1, t1] = polygon[i]
    const [s2, t2] = polygon[(i + 1) % polygon.length]
    area += s1 * t2 - s2 * t1
  }
  return Math.abs(area) / 2
}

describe('planePatchPolygon', () => {
  it('leaves a square that fits inside the box untouched', () => {
    const { u, v } = frame(new THREE.Vector3(0, 0, 1))
    const polygon = planePatchPolygon({ centre: new THREE.Vector3(), u, v, halfSize: 5 })
    expect(polygon).toHaveLength(4)
    expect(polygonArea(polygon)).toBeCloseTo(100, 9)
  })

  // The bug this replaces: a point near a wall shrank the whole square. It
  // should keep its size and lose only the part past the wall, like a line.
  it('cuts a square off at the wall instead of shrinking it', () => {
    const { u, v } = frame(new THREE.Vector3(0, 0, 1))
    const centre = new THREE.Vector3(17, 0, 0)
    const polygon = planePatchPolygon({ centre, u, v, halfSize: 5 })
    const xs = polygon.map((p) => toWorld(centre, u, v, p).x)
    expect(Math.max(...xs)).toBeCloseTo(LIMIT, 9)
    expect(Math.min(...xs)).toBeCloseTo(12, 9)
    expect(polygonArea(polygon)).toBeCloseTo((LIMIT - 12) * 10, 9)
  })

  // An edge exactly on a wall draws at the wall's depth and flickers against it.
  it('stops just inside the walls rather than on them', () => {
    const { u, v } = frame(new THREE.Vector3(0, 0, 1))
    const centre = new THREE.Vector3()
    const polygon = planePatchPolygon({ centre, u, v, halfSize: 100 })
    const xs = polygon.map((p) => toWorld(centre, u, v, p).x)
    expect(Math.max(...xs)).toBeCloseTo(SCENE_BOX_HALF_EXTENT - PLANE_PATCH_WALL_INSET, 9)
    expect(Math.max(...xs)).toBeLessThan(SCENE_BOX_HALF_EXTENT)
  })

  it('fills the whole cross-section of the box, and never draws past it', () => {
    const normal = new THREE.Vector3(0.5, 1, 0.5)
    const { u, v } = frame(normal)
    const centre = new THREE.Vector3(-5, 0, 2)
    const halfSize = planePatchHalfSize({ fillBox: true, centre })
    const polygon = planePatchPolygon({ centre, u, v, halfSize })

    // A tilted plane through a cube cuts a polygon with more than four sides,
    // every corner of which lies on a wall.
    expect(polygon.length).toBeGreaterThan(4)
    for (const p of polygon) {
      const world = toWorld(centre, u, v, p)
      expect(insideBox(world)).toBe(true)
      const onWall = [world.x, world.y, world.z].some((c) => Math.abs(Math.abs(c) - LIMIT) < 1e-6)
      expect(onWall).toBe(true)
    }
  })

  it('is empty when the square misses the box', () => {
    const { u, v } = frame(new THREE.Vector3(0, 0, 1))
    const polygon = planePatchPolygon({ centre: new THREE.Vector3(0, 0, 30), u, v, halfSize: 5 })
    expect(polygon).toEqual([])
  })
})

describe('planePatchHalfSize', () => {
  it('uses half the chosen side length when not filling the box', () => {
    expect(planePatchHalfSize({ fillBox: false, size: 12, centre: new THREE.Vector3() })).toBe(6)
  })

  it('falls back to the box when the size is not a positive number', () => {
    const centre = new THREE.Vector3()
    expect(planePatchHalfSize({ fillBox: false, size: 0, centre })).toBe(SCENE_BOX_HALF_EXTENT)
    expect(planePatchHalfSize({ fillBox: false, size: 'x', centre })).toBe(SCENE_BOX_HALF_EXTENT)
  })
})

describe('planePatchPoint', () => {
  it('lands inside a clipped patch for every ratio', () => {
    const { u, v } = frame(new THREE.Vector3(1, 1, 0))
    const centre = new THREE.Vector3(15, 15, 0)
    const polygon = planePatchPolygon({ centre, u, v, halfSize: 12 })
    for (const sRatio of [-1, -0.5, 0, 0.5, 1]) {
      for (const tRatio of [-1, -0.5, 0, 0.5, 1]) {
        const world = toWorld(centre, u, v, planePatchPoint(polygon, sRatio, tRatio))
        expect(insideBox(world)).toBe(true)
      }
    }
  })

  it('gives the same point for the same ratios', () => {
    const { u, v } = frame(new THREE.Vector3(0, 1, 0))
    const polygon = planePatchPolygon({ centre: new THREE.Vector3(), u, v, halfSize: 8 })
    expect(planePatchPoint(polygon, 0.3, -0.6)).toEqual(planePatchPoint(polygon, 0.3, -0.6))
  })
})
