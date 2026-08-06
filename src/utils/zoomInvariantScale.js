import * as THREE from 'three'

// Camera distance at which zoom-invariant meshes (points, lines, labels)
// render at their authored (base) radius/scale; scale grows or shrinks
// linearly from there as the camera moves away/closer, clamped by
// MIN/MAX_SCALE (see ZoomInvariantScaler, Scene3D.jsx). Pulled out to a
// shared module because the halo discard shader also needs it: a tube's
// real WORLD-SPACE radius grows at this same rate when zoomed out, so a
// fixed world-unit tolerance for "is this really the same touching point"
// (haloDiscardShader.js) only holds near this reference distance.
export const ZOOM_INVARIANT_REFERENCE_DISTANCE = new THREE.Vector3(0, 25, 50).length()
export const ZOOM_INVARIANT_MIN_SCALE = 0.3
export const ZOOM_INVARIANT_MAX_SCALE = 5
