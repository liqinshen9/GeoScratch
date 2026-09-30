import * as THREE from 'three'

// A vector drawn along a line (a cross product's result along the line built
// from it) shares the line's space in every style, so the two z-fight. The
// vector matters more, so the line leaves that stretch out and the vector is
// drawn whole. Runs after each scene build, like applyTubeCollisions.
// See docs/architecture/vector-line-glyphs.md#vector-along-a-line.

// Loose enough for each glyph's own z-fight jitter (0.0015), tight enough that
// a vector merely near a line keeps the line whole.
const ON_LINE = 0.01

function vectorGlyphs(roots) {
  const glyphs = []
  roots.forEach((root) =>
    root?.traverse?.((node) => {
      const ud = node.userData
      if (typeof ud?.setVectorLength === 'function' && ud.vectorOrigin?.isVector3) glyphs.push(node)
    }),
  )
  return glyphs
}

// A glyph's origin and direction are in its parent's frame; its own position
// is only the jitter.
function glyphSegment(glyph) {
  glyph.parent?.updateMatrixWorld(true)
  const frame = glyph.parent?.matrixWorld ?? new THREE.Matrix4()
  const { vectorOrigin, vectorDirection, vectorLength } = glyph.userData
  if (!vectorDirection?.isVector3 || !(vectorLength > 0)) return null
  return {
    start: vectorOrigin.clone().applyMatrix4(frame),
    direction: vectorDirection.clone().transformDirection(frame),
    length: vectorLength,
  }
}

// The stretch of `line` (in its own coordinates, measured from its segment
// midpoint, as its collision zones are) that the vector covers, or null.
// A line's userData is already in world space: a transformed line is rebuilt.
function coveredStretch(line, vector) {
  const { segmentMid, direction } = line.userData
  const unit = direction.clone().normalize()
  const offset = vector.start.clone().sub(segmentMid)
  const onLine =
    offset.clone().cross(unit).length() <= ON_LINE &&
    vector.direction.clone().cross(unit).length() <= ON_LINE
  if (!onLine) return null
  const a = offset.dot(unit)
  const b = a + vector.direction.dot(unit) * vector.length
  return { start: Math.min(a, b), end: Math.max(a, b) }
}

function merge(stretches) {
  const sorted = [...stretches].sort((p, q) => p.start - q.start)
  return sorted.reduce((merged, stretch) => {
    const last = merged[merged.length - 1]
    if (last && stretch.start <= last.end) last.end = Math.max(last.end, stretch.end)
    else merged.push({ ...stretch })
    return merged
  }, [])
}

export function hideLinesUnderVectors(threeObjStore) {
  const objects = Object.values(threeObjStore || {})
  const lines = objects.filter(
    (obj) =>
      obj?.userData?.geoType === 'geo_vector_line' &&
      typeof obj.userData.setGapZones === 'function' &&
      obj.userData.segmentMid?.isVector3 &&
      obj.userData.direction?.isVector3,
  )
  if (!lines.length) return
  const vectors = vectorGlyphs(objects).map(glyphSegment).filter(Boolean)
  lines.forEach((line) => {
    const stretches = vectors.map((vector) => coveredStretch(line, vector)).filter(Boolean)
    line.userData.setGapZones(merge(stretches))
  })
}
