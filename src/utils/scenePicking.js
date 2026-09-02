// Framework-free helpers for routing pointer gestures on the 3D canvas. Kept
// out of Scene3D.jsx so they can be unit tested without a WebGL context.

// A press-release is treated as a "click" (select / toggle) only when the
// pointer barely moved and was down briefly. Anything longer or further is an
// OrbitControls drag (orbit / pan / zoom) and must not trigger picking --
// this is what keeps a drag that starts over a big plane from being swallowed.
export const CLICK_MAX_DIST = 4 // px
export const CLICK_MAX_MS = 400

export function classifyGesture(down, up) {
  if (!down || !up) return 'none'
  if (down.pointerId !== up.pointerId) return 'none'
  const dist = Math.hypot(up.clientX - down.clientX, up.clientY - down.clientY)
  const dt = up.time - down.time
  return dist <= CLICK_MAX_DIST && dt <= CLICK_MAX_MS ? 'click' : 'drag'
}

// Nearest ancestor (inclusive) whose userData carries the given geoType.
function findAncestorByGeoType(object, geoType) {
  let target = object
  while (target) {
    if (target.userData?.geoType === geoType) return target
    target = target.parent
  }
  return null
}

export function findSelectablePointMarker(object) {
  return findAncestorByGeoType(object, 'selectable_point_marker')
}

export function findSelectableLine(object) {
  return findAncestorByGeoType(object, 'geo_vector_line')
}

// getLabelsForObject is injected so this module stays free of label-format code.
export function findLabelOwner(object, getLabelsForObject) {
  let target = object
  while (target) {
    if (getLabelsForObject(target).length > 0) return target
    target = target.parent
  }
  return null
}

// Nearest ancestor (inclusive) tagged with a Blockly source-block id. Stops
// naturally at the <group key={i}> wrapper Scene renders, which has none.
export function resolveSrcBlockId(object) {
  let target = object
  while (target) {
    const id = target.userData?.srcBlockId
    if (id != null) return String(id)
    target = target.parent
  }
  return null
}

// First raycast hit (hits are sorted near -> far) that resolves to a block id.
export function resolveSelectedBlockId(hits) {
  for (const hit of hits || []) {
    const id = resolveSrcBlockId(hit.object)
    if (id != null) return id
  }
  return null
}
