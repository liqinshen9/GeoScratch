import * as THREE from 'three'

// Exact-math tolerance for "these two lines actually touch" -- floating
// point slop only, not a visual/tube-thickness margin. Two lines that are
// merely close in 3D (a legitimate depth-separated crossing) sit far
// outside this; two lines built to share a point (e.g. both passing
// through the same typed-in coordinate) land well within it.
const TOUCH_EPSILON = 1e-4

// Standard closest-point-between-two-lines solve (infinite lines, not
// segments) -- d1/d2 must be normalized. Returns the closest-approach
// distance and each line's own parametric distance (in world units, along
// its own normalized direction) from its own origin to that closest point.
// Parallel lines (denom ~ 0) have no unique closest point -- reported as
// non-intersecting, which is correct: this check is only ever used to
// suppress a halo gap at a genuine touch, and parallel/near-parallel pairs
// are already excluded from gapping some other way (they have no single
// crossing point for a gap to make sense at in the first place).
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

// True only if the two lines actually meet at a real 3D point -- not just
// appear to cross in screen-space projection while genuinely separated in
// depth (the normal haloed case).
export function linesIntersect(p1, d1, p2, d2) {
  const result = closestApproach(p1, d1, p2, d2)
  return !!result && result.distance < TOUCH_EPSILON
}
