import THREE from '@/utils/three'

/**
 * The patch of a point-normal plane that is actually drawn: a square centred on
 * the plane's point, cut off at the scene box's walls the way a line is. It is
 * never shrunk to fit. See docs/architecture/collision.md#plane-patch.
 */

// The room's half-width. Matches BOX_HALF_EXTENT in geoVectorLine.js and the
// size={40} BoundingBoxRoom in Scene3D.
export const SCENE_BOX_HALF_EXTENT = 20

// How far inside the walls the patch stops. An edge lying exactly on a wall is
// drawn at the wall's own depth and flickers against it; a few depth-buffer
// steps is enough, and 0.1 in a 40-unit room is invisible.
export const PLANE_PATCH_WALL_INSET = 0.1
const PATCH_LIMIT = SCENE_BOX_HALF_EXTENT - PLANE_PATCH_WALL_INSET

/**
 * Half-width of the square before clipping. Filling the box needs a square that
 * covers the plane's whole cross-section of it from wherever the centre is:
 * every box point is within boxHalf * sqrt(3) of the origin.
 */
export function planePatchHalfSize({
  fillBox,
  size,
  centre,
  boxHalfExtent = SCENE_BOX_HALF_EXTENT,
}) {
  if (fillBox) return boxHalfExtent * Math.sqrt(3) + centre.length() + 1
  const side = Number(size)
  return Number.isFinite(side) && side > 0 ? side / 2 : boxHalfExtent
}

// Sutherland-Hodgman against one wall: keeps sign * p[axis] <= limit.
function clipAgainstWall(polygon, axis, sign, limit) {
  const kept = []
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const outsideA = sign * a.getComponent(axis) - limit
    const outsideB = sign * b.getComponent(axis) - limit
    if (outsideA <= 0) kept.push(a)
    if (outsideA <= 0 !== outsideB <= 0) {
      kept.push(a.clone().lerp(b, outsideA / (outsideA - outsideB)))
    }
  }
  return kept
}

/**
 * The drawn outline, as [s, t] pairs relative to `centre` along `u` and `v`, in
 * order around the patch. Empty when the square misses the box entirely.
 */
export function planePatchPolygon({ centre, u, v, halfSize, boxHalfExtent = PATCH_LIMIT }) {
  let polygon = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([s, t]) =>
    centre
      .clone()
      .addScaledVector(u, s * halfSize)
      .addScaledVector(v, t * halfSize),
  )
  for (let axis = 0; axis < 3 && polygon.length; axis += 1) {
    polygon = clipAgainstWall(polygon, axis, 1, boxHalfExtent)
    polygon = clipAgainstWall(polygon, axis, -1, boxHalfExtent)
  }
  const offset = new THREE.Vector3()
  return polygon.map((p) => {
    offset.subVectors(p, centre)
    return [offset.dot(u), offset.dot(v)]
  })
}

function insidePolygon(polygon, s, t) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [si, ti] = polygon[i]
    const [sj, tj] = polygon[j]
    if (ti > t !== tj > t && s < ((sj - si) * (t - ti)) / (tj - ti) + si) inside = !inside
  }
  return inside
}

/**
 * A point inside the drawn patch for the "point on the plane" picker, from its
 * two cached ratios in [-1, 1]. Deterministic, so the same ratios give the same
 * point on every rebuild. Starts inside the patch's bounding rectangle and pulls
 * toward the centroid until it lands inside, since a clipped patch is not a
 * rectangle.
 */
export function planePatchPoint(polygon, sRatio, tRatio) {
  if (!polygon?.length) return [0, 0]
  let minS = Infinity
  let maxS = -Infinity
  let minT = Infinity
  let maxT = -Infinity
  let sumS = 0
  let sumT = 0
  for (const [s, t] of polygon) {
    minS = Math.min(minS, s)
    maxS = Math.max(maxS, s)
    minT = Math.min(minT, t)
    maxT = Math.max(maxT, t)
    sumS += s
    sumT += t
  }
  const cs = sumS / polygon.length
  const ct = sumT / polygon.length
  const clamp = (r) => Math.max(-1, Math.min(1, Number(r) || 0))
  // 0.8 keeps the point off the patch's very edge.
  let s = cs + clamp(sRatio) * 0.8 * (clamp(sRatio) > 0 ? maxS - cs : cs - minS)
  let t = ct + clamp(tRatio) * 0.8 * (clamp(tRatio) > 0 ? maxT - ct : ct - minT)
  for (let i = 0; i < 30 && !insidePolygon(polygon, s, t); i += 1) {
    s = cs + (s - cs) * 0.7
    t = ct + (t - ct) * 0.7
  }
  return [s, t]
}
