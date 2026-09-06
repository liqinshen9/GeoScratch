import * as THREE from 'three'

// Float slop for "these two lines actually touch", not a tube-thickness
// margin. See docs/architecture/halos.md.
const TOUCH_EPSILON = 1e-4

// Closest point between two infinite lines (d1/d2 normalized). Parallel
// pairs (denom ~ 0) report null -> non-intersecting, which is what the
// halo check wants.
function closestApproach(p1, d1, p2, d2) {
  const r = new THREE.Vector3().subVectors(p1, p2)
  const b = d1.dot(d2)
  const d = d1.dot(r)
  const e = d2.dot(r)
  const denom = 1 - b * b
  if (Math.abs(denom) < 1e-9) return null

  const t1 = (b * e - d) / denom
  const t2 = (e - b * d) / denom
  const c1 = new THREE.Vector3().copy(p1).addScaledVector(d1, t1)
  const c2 = new THREE.Vector3().copy(p2).addScaledVector(d2, t2)
  return { distance: c1.distanceTo(c2), t1, t2 }
}

// True only if the two lines meet at a real 3D point, not just cross in
// screen projection while depth-separated (the normal haloed case).
export function linesIntersect(p1, d1, p2, d2) {
  const result = closestApproach(p1, d1, p2, d2)
  return !!result && result.distance < TOUCH_EPSILON
}
