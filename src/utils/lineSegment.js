import THREE from '@/utils/three'
import { geoVectorLineDefinition } from '@/components/BlocksCanvas/blocks/geometric/geoVectorLine'

/**
 * A finite piece of a line, part of another object (a distance bar). It is
 * drawn by the line builder, so it follows every line setting: style,
 * thickness, halo, zoom-invariant sizing.
 *
 * `userData.setSegment(from, to)` re-spans it along the same line, and
 * `userData.setVectorLength(length)` grows it out of `start` for a staged
 * reveal. The line is built at its resting span and nested so that one group's
 * Y scale runs along it, which re-spans without rebuilding.
 * See docs/architecture/vector-line-glyphs.md#finite-segments.
 *
 * @returns {THREE.Group | null} null for a zero-length segment
 */
export function buildLineSegment(start, end, id, color) {
  const direction = end.clone().sub(start)
  const length = direction.length()
  if (!(length > 1e-8)) return null
  direction.normalize()

  const line = geoVectorLineDefinition(start.clone(), direction.clone(), undefined, id, {
    extent: [0, length],
    color,
    part: true,
  })
  if (!line) return null

  // outer: at `from`, turning +Y onto the line. stretch: Y scale = span.
  // frame: undoes both, so the line's own world coordinates map `start` to the
  // origin and the line onto +Y.
  const toLine = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
  const outer = new THREE.Group()
  const stretch = new THREE.Group()
  const frame = new THREE.Group()
  outer.quaternion.copy(toLine)
  frame.quaternion.copy(toLine).invert()
  frame.position.copy(start).applyQuaternion(frame.quaternion).negate()
  outer.add(stretch)
  stretch.add(frame)
  frame.add(line)

  // AnswerTint's halo follows the stretch, since it is parented under it.
  stretch.userData.glowLine = { start: new THREE.Vector3(), end: new THREE.Vector3(0, length, 0) }

  const setSegment = (from, to) => {
    outer.position.copy(from)
    stretch.scale.set(1, Math.max(1e-4, from.distanceTo(to) / length), 1)
    outer.updateMatrixWorld(true)
  }
  setSegment(start, end)
  outer.userData.setSegment = setSegment
  outer.userData.setVectorLength = (grown) =>
    setSegment(start, start.clone().addScaledVector(direction, grown))
  return outer
}
