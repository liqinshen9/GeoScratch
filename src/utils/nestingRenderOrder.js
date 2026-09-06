import THREE from '@/utils/three'

/**
 * Stable back-to-front ordering for nested transparent objects.
 *
 * Three.js sorts the transparent queue by distance to bounding-sphere centre.
 * Nested objects (a teapot inside a cube) have near-coincident centres, so that
 * sort flips with the smallest camera jitter and the pair visibly flickers.
 * This is a recurring bug class here -- see issue #29.
 */

// Like Box3.containsBox, but tolerant of a spout / handle / gridline poking a
// little way outside (a teapot's bounding box is actually wider than the cube
// it sits in): the inner box's centre must be inside, it must be the smaller
// box, and most of its volume must overlap.
export function boxMostlyContains(outer, inner) {
  const s = new THREE.Vector3()
  const vol = (b) => (b.getSize(s), s.x * s.y * s.z)
  const innerVol = vol(inner)
  if (innerVol <= 0 || innerVol >= vol(outer)) return false
  if (!outer.containsPoint(inner.getCenter(new THREE.Vector3()))) return false
  return vol(inner.clone().intersect(outer)) / innerVol >= 0.6
}

// Nested transparent objects have near-coincident bounding centers, so
// per-frame distance-sort order flickers with camera jitter. Derive a
// stable renderOrder from bounding-box containment instead: an object nested
// inside another renders earlier, so the container consistently blends over
// it regardless of viewing angle.
export function computeNestingRenderOrders(objects) {
  const boxes = objects.map((o) => {
    if (!o?.isObject3D) return null
    o.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(o)
    return box.isEmpty() ? null : box
  })

  return objects.map((_, i) => {
    if (!boxes[i]) return 0
    let containedByCount = 0
    boxes.forEach((box, j) => {
      if (j === i || !box) return
      if (boxMostlyContains(box, boxes[i])) {
        containedByCount += 1
      }
    })
    // More containers wrapping this object -> render earlier (further back).
    return -containedByCount
  })
}
