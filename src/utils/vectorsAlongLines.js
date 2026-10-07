import * as THREE from 'three'

// A vector drawn along a line (a cross product's result along the line built
// from it) shares the line's space in every style, so the two z-fight. The
// vector matters more, so the line leaves that stretch out and the vector is
// drawn whole. Runs after scene builds and animation updates.
// See docs/architecture/vector-line-glyphs.md#vector-along-a-line.

// Loose enough for each glyph's own z-fight jitter (0.0015), tight enough that
// a vector merely near a line keeps the line whole.
const ON_LINE = 0.01

function vectorGlyphs(roots) {
  const glyphs = new Set()
  roots.forEach((root) =>
    root?.traverse?.((node) => {
      const ud = node.userData
      if (typeof ud?.setVectorLength === 'function' && ud.vectorOrigin?.isVector3) glyphs.add(node)
    }),
  )
  return [...glyphs]
}

// A glyph's origin and direction are in its parent's frame; its own position
// is only the jitter.
function glyphSegment(glyph) {
  for (let node = glyph; node; node = node.parent) {
    if (node.visible === false) return null
  }
  glyph.updateWorldMatrix(true, false)
  const frame = glyph.parent?.matrixWorld ?? new THREE.Matrix4()
  const { vectorOrigin, vectorDirection, vectorLength } = glyph.userData
  if (!vectorDirection?.isVector3 || !(vectorLength > 0)) return null
  const start = vectorOrigin.clone().applyMatrix4(frame)
  const end = vectorOrigin
    .clone()
    .addScaledVector(vectorDirection, vectorLength)
    .applyMatrix4(frame)
  return { start, end }
}

// The stretch of `line` (in its own coordinates, measured from its segment
// midpoint, as its collision zones are) that the vector covers, or null.
// Build-time line coordinates must follow its current animated matrix.
function coveredStretch(line, vector, inverse) {
  const { segmentMid, direction } = line.userData
  const unit = direction.clone().normalize()
  const start = vector.start.clone().applyMatrix4(inverse).sub(segmentMid)
  const end = vector.end.clone().applyMatrix4(inverse).sub(segmentMid)
  const onLine =
    start.clone().cross(unit).length() <= ON_LINE && end.clone().cross(unit).length() <= ON_LINE
  if (!onLine) return null
  const a = start.dot(unit)
  const b = end.dot(unit)
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
    line.updateWorldMatrix(true, false)
    const inverse = line.matrixWorld.clone().invert()
    const stretches = vectors.map((vector) => coveredStretch(line, vector, inverse)).filter(Boolean)
    const zones = merge(stretches)
    const previous = line.userData.vectorGapZones
    if (
      previous?.length === zones.length &&
      zones.every(
        (zone, i) =>
          Math.abs(zone.start - previous[i].start) < 1e-4 &&
          Math.abs(zone.end - previous[i].end) < 1e-4,
      )
    )
      return
    line.userData.vectorGapZones = zones
    line.userData.setGapZones(zones)
  })
}
