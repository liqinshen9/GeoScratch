import * as THREE from 'three'

// Reference camera distance for zoom-invariant meshes. Shared module because
// the halo discard shader needs it too. See docs/architecture/glyph-sizing.md.
export const ZOOM_INVARIANT_REFERENCE_DISTANCE = new THREE.Vector3(0, 25, 50).length()
export const ZOOM_INVARIANT_MIN_SCALE = 0.3
export const ZOOM_INVARIANT_MAX_SCALE = 5

// Glyph sizes are fixed screen pixels, not a fraction of the view: without
// this a glyph's width tracked the canvas height, so the study's 640px stage
// drew lines about three quarters as wide as the editor's 3D view.
// See docs/architecture/glyph-sizing.md#view-height.
export const VIEW_HEIGHT_REFERENCE = 820

export function viewHeightFactor(viewHeight) {
  return VIEW_HEIGHT_REFERENCE / Math.max(Number(viewHeight) || 0, 1)
}

// A tube's on-screen width, in CSS px, at scale 1 and the reference height.
export function tubeWidthPx(baseRadius, fovDeg) {
  const halfFov = THREE.MathUtils.degToRad(fovDeg / 2)
  return (
    (baseRadius * VIEW_HEIGHT_REFERENCE) / (ZOOM_INVARIANT_REFERENCE_DISTANCE * Math.tan(halfFov))
  )
}

// The cross-section scale that draws a tube of `baseRadius` `targetPx` wide.
export function tubeWidthScale(baseRadius, fovDeg, targetPx) {
  return targetPx / tubeWidthPx(baseRadius, fovDeg)
}
