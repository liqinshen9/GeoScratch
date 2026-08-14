import * as THREE from 'three'

// The collision accent overlays the plain tube (radius 0.051, see
// geoVectorLine.js), so accuracy is measured against that radius.
const PLAIN_TUBE_RADIUS = 0.051

// How far the tube's own surface reaches past its centerline -- the ring
// accent should start where the tube's SURFACE meets a solid's surface, not
// where its centerline does. Exactly the tube's radius, no extra buffer.
const SOLID_INFLATE = PLAIN_TUBE_RADIUS

// A plane has no inside -- a line crossing through it does so at a single
// point, which isn't a meaningful "passing through solid geometry" collision
// the way a sphere/cube/teapot crossing is. Only a line that actually runs
// ALONG the plane's surface (parallel to it, and close enough to lie in it)
// gets a collision zone at all; see findLinePlaneCollisionZone. Expressed as
// |direction . normal| (both unit vectors), so 0 is exactly parallel --
// small enough to exclude any real crossing angle, generous enough to
// tolerate a user-typed direction that isn't exactly perpendicular to the
// normal by floating-point rounding.
const PLANE_PARALLEL_DOT_TOLERANCE = 0.02

// srcBlockId-tagged top-level geoTypes that represent solid/blocking geometry
// a line's tube can visibly collide with. Line-vs-line collisions are
// intentionally not handled here -- those will get a halo treatment instead
// of a ringed-tube accent.
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

  // Transform pipelines mutate the group's local matrix after creation, so
  // segmentMid/direction (stored in local space at build time) must be
  // pushed through matrixWorld to compare against solids that live under
  // different transforms. segmentMid (not the vector equation's origin) is
  // the point the tube's own local geometry is centred on -- the line can
  // now extend a different distance in each direction (to reach the scene's
  // bounding box), so that's the only point a single symmetric half-extent
  // is still valid around.
  group.updateMatrixWorld(true)
  const worldOrigin = segmentMid.clone().applyMatrix4(group.matrixWorld)
  const worldDirection = unitDirection.clone().transformDirection(group.matrixWorld).normalize()

  return { origin: worldOrigin, direction: worldDirection, halfExtent: segmentHalfLength ?? 20 }
}

// Mirrors worldSegment() above, for a point_normal_plane_group -- the
// plane's own defining point/normal/size are stored in local space at build
// time (see parametricPlane.js), so they need matrixWorld applied to compare
// against a line's already-world-space segment. basisU/basisV reconstruct
// the exact same local rotation parametricPlane.js uses to orient its mesh
// from its default +Z facing to the normal, so they line up with the
// rendered square's own edges, not just some arbitrary perpendicular pair.
function worldPlaneFrame(obj) {
  const { point, normalUnit, planeSize } = obj.userData
  if (!point?.isVector3 || !normalUnit?.isVector3 || !Number.isFinite(planeSize)) return null

  obj.updateMatrixWorld(true)
  const worldPoint = point.clone().applyMatrix4(obj.matrixWorld)
  const worldNormal = normalUnit.clone().transformDirection(obj.matrixWorld).normalize()
  const worldScale = obj.getWorldScale(new THREE.Vector3())
  const halfSize = (planeSize / 2) * ((worldScale.x + worldScale.y + worldScale.z) / 3)

  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normalUnit)
  const basisU = new THREE.Vector3(1, 0, 0).applyQuaternion(quat).transformDirection(obj.matrixWorld).normalize()
  const basisV = new THREE.Vector3(0, 1, 0).applyQuaternion(quat).transformDirection(obj.matrixWorld).normalize()

  return { point: worldPoint, normal: worldNormal, halfSize, basisU, basisV }
}

// Analytic ray/segment vs sphere intersection, clamped to [tMin, tMax].
// A sphere's Minkowski sum with another sphere (the tube's radius) is just a
// bigger sphere -- no angle dependence -- so baking `radius` up front (see
// the caller, which passes sphereRadius + SOLID_INFLATE) is already exact,
// unlike a box.
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

// Finds where a tube of the given radius (i.e. the true point-to-box
// distance drops to <= radius) enters/exits along the ray, clamped to
// [tMin, tMax]. Unlike padding a flat-face intersection along the ray or
// inflating the box's AABB, this is exact at any approach angle: near an
// edge or corner, a box's Minkowski sum with a sphere has ROUNDED
// edges/corners, which neither of those shortcuts reproduces (an inflated
// AABB has sharp corners that stick out too far; padding along the ray
// under/over-shoots depending on the incidence angle). Distance-to-a-convex-
// set composed with a line is a convex, therefore unimodal, function of t,
// so its minimum can be found by ternary search and its radius-crossings by
// bisection outward from that minimum -- exact to numerical precision,
// with no per-case geometry (face vs. edge vs. corner) needed.
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

// A plane has no inside, so a line crossing through it at an angle only
// ever touches it at a single point -- not the kind of "passing through
// solid geometry" a collision zone is meant to flag. Only a line that's
// both parallel to the plane AND close enough to lie in its surface gets a
// zone at all, clipped to the plane's own finite square (via basisU/basisV,
// see worldPlaneFrame) rather than an unbounded plane.
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

  // Spheres get an exact analytic test (radius padding baked straight in);
  // a point-normal plane gets its own parallel-and-coincident test (see
  // findLinePlaneCollisionZone -- a plane has no inside, so an ordinary
  // crossing angle isn't a collision at all); everything else falls back to
  // its world AABB, tested via the numerical distance search above (exact
  // for a cube, an approximation of the true shape for less box-like solids
  // like the teapot or a composed object).
  const colliders = solids
    .map((obj) => {
      obj.updateMatrixWorld(true)
      if (obj.userData?.geoType === 'geo_sphere' && obj.userData.centre?.isVector3 && Number.isFinite(obj.userData.radius)) {
        // obj.userData.centre is the SAME local offset already baked into
        // obj.position (see geoSphere.js) -- it's already part of
        // matrixWorld's translation, so applying matrixWorld to it again
        // would double-translate. getWorldPosition reads the translation
        // matrixWorld already carries, once.
        const worldCenter = obj.getWorldPosition(new THREE.Vector3())
        const worldScale = obj.getWorldScale(new THREE.Vector3())
        const worldRadius = obj.userData.radius * (worldScale.x + worldScale.y + worldScale.z) / 3
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
      const hit = collider.type === 'sphere'
        ? raySegmentSphereIntersection(segment.origin, segment.direction, -segment.halfExtent, segment.halfExtent, collider.center, collider.radius + SOLID_INFLATE)
        : collider.type === 'plane'
          ? findLinePlaneCollisionZone(segment.origin, segment.direction, -segment.halfExtent, segment.halfExtent, collider, SOLID_INFLATE)
          : findBoxTubeCollisionZone(segment.origin, segment.direction, -segment.halfExtent, segment.halfExtent, collider.box, SOLID_INFLATE)
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
