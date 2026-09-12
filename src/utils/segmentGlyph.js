// A plain cylinder drawn between two points has no length setter, so it cannot
// take part in a staged reveal -- stagedVectorReveal.js grows a part by calling
// `userData.setVectorLength(len)`, which only vector shaft glyphs expose. This
// attaches the same hook to a segment: the mesh keeps its full-length geometry
// and is scaled along its own axis, with the midpoint walked back so it grows
// out of `start` instead of out of its own centre.
// See docs/architecture/animation.md#staged-vector-reveal.

/**
 * @param {object} segment cylinder mesh centred between start and end, built
 *   with +Y along its axis (the shape `makeSegment` helpers produce).
 * @param {object} start THREE.Vector3 the segment grows from.
 * @param {object} end THREE.Vector3 the segment grows to.
 * @returns {object} the same mesh, with `userData.setVectorLength` attached.
 */
export function makeExtendableSegment(segment, start, end) {
  const full = start.distanceTo(end)

  // A degenerate segment has no axis to grow along. Give it an inert setter
  // rather than dividing by zero and writing NaN into the transform, which
  // would take the whole object out of the scene rather than just this part.
  if (full < 1e-8) {
    segment.userData.setVectorLength = () => {}
    return segment
  }

  const direction = end.clone().sub(start).divideScalar(full)

  segment.userData.setVectorLength = (newLength) => {
    const length = Math.max(0, Math.min(full, newLength))
    segment.scale.y = length / full
    segment.position.copy(start).addScaledVector(direction, length / 2)
  }

  return segment
}
