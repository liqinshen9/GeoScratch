import * as THREE from 'three'

// See docs/architecture/collision.md.
const PLAIN_TUBE_RADIUS = 0.051
const SOLID_INFLATE = PLAIN_TUBE_RADIUS

// |direction . normal| below which a line counts as running along the plane.
// See docs/architecture/collision.md.
const PLANE_PARALLEL_DOT_TOLERANCE = 0.02

// Line-vs-line is intentionally excluded (halo treatment instead).
const SOLID_GEO_TYPES = new Set([
  'geo_cube',
  'geo_sphere',
  'geo_teapot',
  'point_normal_plane_group',
  'annotated_object',
])

function worldSegment(group) {
  const { segmentMid, direction, segmentHalfLength } = group.userData
  if (!segmentMid?.isVector3 || !direction?.isVector3) return null

  const unitDirection = direction.clone().normalize()
  if (!Number.isFinite(unitDirection.lengthSq()) || unitDirection.lengthSq() === 0) return null

  // Local-space build-time data -> world space. segmentMid, not the equation
  // origin. See docs/architecture/collision.md#world-space-transforms.
  group.updateMatrixWorld(true)
  const worldOrigin = segmentMid.clone().applyMatrix4(group.matrixWorld)
  const worldDirection = unitDirection.clone().transformDirection(group.matrixWorld).normalize()

  return { origin: worldOrigin, direction: worldDirection, halfExtent: segmentHalfLength ?? 20 }
}

// worldSegment's counterpart for a point_normal_plane_group. basisU/basisV
// reconstruct parametricPlane.js's own +Z -> normal rotation.
// See docs/architecture/collision.md#world-space-transforms.
function worldPlaneFrame(obj) {
  const { point, normalUnit, planeSize } = obj.userData
  if (!point?.isVector3 || !normalUnit?.isVector3 || !Number.isFinite(planeSize)) return null

  obj.updateMatrixWorld(true)
  const worldPoint = point.clone().applyMatrix4(obj.matrixWorld)
  const worldNormal = normalUnit.clone().transformDirection(obj.matrixWorld).normalize()
  const worldScale = obj.getWorldScale(new THREE.Vector3())
  const halfSize = (planeSize / 2) * ((worldScale.x + worldScale.y + worldScale.z) / 3)

  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normalUnit)
  const basisU = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(quat)
    .transformDirection(obj.matrixWorld)
    .normalize()
  const basisV = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(quat)
    .transformDirection(obj.matrixWorld)
    .normalize()

  return { point: worldPoint, normal: worldNormal, halfSize, basisU, basisV }
}

// Analytic ray/segment vs sphere, clamped to [tMin, tMax]. Exact with the
// tube radius baked into `radius`. See docs/architecture/collision.md.
function raySegmentSphereIntersection(origin, direction, tMin, tMax, center, radius) {
  const oc = origin.clone().sub(center)
  const b = oc.dot(direction)
  const c = oc.lengthSq() - radius * radius
  const discriminant = b * b - c
  if (discriminant < 0) return null

  const sqrtDisc = Math.sqrt(discriminant)
  const tEntry = Math.max(tMin, -b - sqrtDisc)
  const tExit = Math.min(tMax, -b + sqrtDisc)
  if (tEntry > tExit) return null

  return { tEntry, tExit }
}

function pointToBoxDistance(point, box) {
  const dx = Math.max(box.min.x - point.x, 0, point.x - box.max.x)
  const dy = Math.max(box.min.y - point.y, 0, point.y - box.max.y)
  const dz = Math.max(box.min.z - point.z, 0, point.z - box.max.z)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

// Where the point-to-box distance drops to <= radius along the ray. Exact at
// any approach angle (rounded Minkowski corners) via ternary search for the
// minimum + bisection outward. See docs/architecture/collision.md.
function findBoxTubeCollisionZone(origin, direction, tMin, tMax, box, radius) {
  const distAt = (t) => pointToBoxDistance(origin.clone().addScaledVector(direction, t), box)

  let lo = tMin
  let hi = tMax
  for (let i = 0; i < 60; i += 1) {
    const m1 = lo + (hi - lo) / 3
    const m2 = hi - (hi - lo) / 3
    if (distAt(m1) < distAt(m2)) hi = m2
    else lo = m1
  }
  const tClosest = (lo + hi) / 2
  if (distAt(tClosest) > radius) return null

  const findBoundary = (sign) => {
    let inside = tClosest
    let step = Math.max(radius, 1e-4)
    let outside = THREE.MathUtils.clamp(tClosest + sign * step, tMin, tMax)
    let guard = 0
    while (distAt(outside) <= radius && guard < 60) {
      if (outside === tMin || outside === tMax) return outside // ray segment itself ends still inside radius
      inside = outside
      step *= 1.7
      outside = THREE.MathUtils.clamp(tClosest + sign * step, tMin, tMax)
      guard += 1
    }
    let a = inside
    let b = outside
    for (let i = 0; i < 40; i += 1) {
      const mid = (a + b) / 2
      if (distAt(mid) <= radius) a = mid
      else b = mid
    }
    return a
  }

  return { tEntry: findBoundary(-1), tExit: findBoundary(1) }
}

// A line gets a plane collision zone only if parallel to AND lying in the
// plane, clipped to its finite square. See docs/architecture/collision.md.
function findLinePlaneCollisionZone(origin, direction, tMin, tMax, planeCollider, radius) {
  const { point, normal, halfSize, basisU, basisV } = planeCollider

  if (Math.abs(direction.dot(normal)) > PLANE_PARALLEL_DOT_TOLERANCE) return null

  const toPoint = origin.clone().sub(point)
  if (Math.abs(toPoint.dot(normal)) > radius) return null

  const u0 = toPoint.dot(basisU)
  const v0 = toPoint.dot(basisV)
  const du = direction.dot(basisU)
  const dv = direction.dot(basisV)

  // Liang-Barsky-style clip of the [tMin, tMax] interval against
  // |offset + t*delta| <= half, one axis (U, then V) at a time.
  const clipAxis = (interval, offset, delta, half) => {
    if (!interval) return null
    if (Math.abs(delta) < 1e-9) {
      return Math.abs(offset) <= half ? interval : null
    }
    const a = (-half - offset) / delta
    const b = (half - offset) / delta
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const start = Math.max(interval[0], lo)
    const end = Math.min(interval[1], hi)
    return start <= end ? [start, end] : null
  }

  let interval = [tMin, tMax]
  interval = clipAxis(interval, u0, du, halfSize + radius)
  interval = clipAxis(interval, v0, dv, halfSize + radius)
  if (!interval) return null

  return { tEntry: interval[0], tExit: interval[1] }
}

function mergeZones(zones) {
  if (zones.length === 0) return []
  const sorted = [...zones].sort((a, b) => a.start - b.start)
  const merged = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i += 1) {
    const last = merged[merged.length - 1]
    const current = sorted[i]
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end)
    } else {
      merged.push({ ...current })
    }
  }
  return merged
}

/**
 * Finds where each geo_vector_line's visible tube passes into a solid
 * object's bounds, and tells each line the exact local zone(s) to ring, via
 * its userData.setCollisionZones(zones) hook. Call once after (re)generating
 * the scene into threeObjStore.
 */
export function applyTubeCollisions(threeObjStore) {
  const allObjects = Object.values(threeObjStore || {})
  const lines = allObjects.filter((obj) => obj?.userData?.geoType === 'geo_vector_line')
  const solids = allObjects.filter((obj) => SOLID_GEO_TYPES.has(obj?.userData?.geoType))

  const lineEntries = lines
    .map((group) => ({ group, segment: worldSegment(group) }))
    .filter((entry) => entry.segment)

  // Per-collider strategy: see docs/architecture/collision.md#per-collider-strategy.
  const colliders = solids
    .map((obj) => {
      obj.updateMatrixWorld(true)
      if (
        obj.userData?.geoType === 'geo_sphere' &&
        obj.userData.centre?.isVector3 &&
        Number.isFinite(obj.userData.radius)
      ) {
        // userData.centre is already baked into obj.position -- don't apply
        // matrixWorld to it. See docs/architecture/collision.md#sphere-double-translate.
        const worldCenter = obj.getWorldPosition(new THREE.Vector3())
        const worldScale = obj.getWorldScale(new THREE.Vector3())
        const worldRadius = (obj.userData.radius * (worldScale.x + worldScale.y + worldScale.z)) / 3
        return { type: 'sphere', center: worldCenter, radius: worldRadius }
      }
      if (obj.userData?.geoType === 'point_normal_plane_group') {
        const frame = worldPlaneFrame(obj)
        return frame ? { type: 'plane', ...frame } : null
      }
      const box = new THREE.Box3().setFromObject(obj)
      return box.isEmpty() ? null : { type: 'box', box }
    })
    .filter(Boolean)

  const zonesByLine = new Map(lineEntries.map((entry) => [entry.group, []]))

  for (const { group, segment } of lineEntries) {
    for (const collider of colliders) {
      const hit =
        collider.type === 'sphere'
          ? raySegmentSphereIntersection(
              segment.origin,
              segment.direction,
              -segment.halfExtent,
              segment.halfExtent,
              collider.center,
              collider.radius + SOLID_INFLATE,
            )
          : collider.type === 'plane'
            ? findLinePlaneCollisionZone(
                segment.origin,
                segment.direction,
                -segment.halfExtent,
                segment.halfExtent,
                collider,
                SOLID_INFLATE,
              )
            : findBoxTubeCollisionZone(
                segment.origin,
                segment.direction,
                -segment.halfExtent,
                segment.halfExtent,
                collider.box,
                SOLID_INFLATE,
              )
      if (hit) {
        zonesByLine.get(group).push({
          start: Math.max(-segment.halfExtent, hit.tEntry),
          end: Math.min(segment.halfExtent, hit.tExit),
        })
      }
    }
  }

  lines.forEach((group) => {
    const zones = mergeZones(zonesByLine.get(group) || [])
    group.userData.setCollisionZones?.(zones)
  })
}
