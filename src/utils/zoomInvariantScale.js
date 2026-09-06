import * as THREE from 'three'

// Reference camera distance for zoom-invariant meshes. Shared module because
// the halo discard shader needs it too. See docs/architecture/glyph-sizing.md.
export const ZOOM_INVARIANT_REFERENCE_DISTANCE = new THREE.Vector3(0, 25, 50).length()
export const ZOOM_INVARIANT_MIN_SCALE = 0.3
export const ZOOM_INVARIANT_MAX_SCALE = 5
