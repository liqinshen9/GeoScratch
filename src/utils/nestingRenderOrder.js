import THREE from '@/utils/three'

/**
 * Stable back-to-front renderOrder for nested transparent objects, from
 * bounding-box containment (a recurring flicker bug class, #29).
 * See docs/architecture/render-order.md.
 */

// Tolerant containsBox: inner centre inside, inner smaller, >= 60% volume overlap.
export function boxMostlyContains(outer, inner) {
  const s = new THREE.Vector3()
  const vol = (b) => (b.getSize(s), s.x * s.y * s.z)
  const innerVol = vol(inner)
  if (innerVol <= 0 || innerVol >= vol(outer)) return false
  if (!outer.containsPoint(inner.getCenter(new THREE.Vector3()))) return false
  return vol(inner.clone().intersect(outer)) / innerVol >= 0.6
}

// See docs/architecture/render-order.md#computenestingrenderorders.
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
    // More containers -> render earlier (further back).
    return -containedByCount
  })
}
