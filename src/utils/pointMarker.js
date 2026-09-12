import THREE from '@/utils/three'
import useSettingsStore from '@/store/useSettingsStore'

// The one place a point marker is built. Radius varies by context (a standalone
// Point reads large, an operator's foot dot small), the finish and the
// zoom-invariant tagging do not.
// See docs/architecture/glyph-sizing.md#point-markers.

export const POINT_MARKER_RADIUS = 0.24

const MATTE_FINISH = { roughness: 1, metalness: 0 }
const SHEEN_FINISH = { roughness: 0.35, metalness: 0.05 }

// Nothing re-runs the generated code when a setting changes, so Settings >
// Geometry > "Matte Points" has to repaint in place. One subscription over a
// registry, rather than a self-unsubscribing closure per marker: most markers
// are nested parts with no threeObjStore key of their own to anchor to.
let liveMaterials = []
let subscribed = false

export function applyPointFinish(material, settings) {
  const finish = settings?.mattePoints ? MATTE_FINISH : SHEEN_FINISH
  material.roughness = finish.roughness
  material.metalness = finish.metalness
}

// Called per run by installSceneRuntime, matching the full-scene-rebuild model:
// the previous run's materials are gone, and exercise decorateObjects markers
// re-register after it.
export function resetPointMarkerRegistry() {
  liveMaterials = []
}

function ensurePointFinishSubscription() {
  if (subscribed) return
  subscribed = true
  useSettingsStore.subscribe((state) => {
    liveMaterials.forEach((material) => applyPointFinish(material, state.settings))
  })
}

export function createPointMaterial(color) {
  const material = new THREE.MeshStandardMaterial(color === undefined ? {} : { color })
  applyPointFinish(material, useSettingsStore.getState().settings)
  ensurePointFinishSubscription()
  liveMaterials.push(material)
  return material
}

export function createPointMarker({
  color,
  radius = POINT_MARKER_RADIUS,
  widthSegments = 16,
  heightSegments = 12,
  geoType,
  srcBlockId,
} = {}) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(radius, widthSegments, heightSegments),
    createPointMaterial(color),
  )
  marker.userData.zoomInvariantRadius = radius
  marker.userData.zoomInvariantUniform = true
  if (geoType !== undefined) marker.userData.geoType = geoType
  if (srcBlockId !== undefined) marker.userData.srcBlockId = srcBlockId
  return marker
}
