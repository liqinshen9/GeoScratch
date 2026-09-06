import { useEffect, useMemo } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import THREE from '@/utils/three'
import {
  ZOOM_INVARIANT_REFERENCE_DISTANCE,
  ZOOM_INVARIANT_MIN_SCALE,
  ZOOM_INVARIANT_MAX_SCALE,
} from '@/utils/zoomInvariantScale'
import {
  EXTRA_LARGE_POINT_MAX_SCALE,
  EXTRA_LARGE_POINT_MULTIPLIER,
  EXTRA_THICK_LINE_MULTIPLIER,
  MIN_LINE_WORLD_RADIUS,
  POINT_ZOOM_MAX_SCALE,
  VECTOR_ZOOM_MAX_SCALE,
} from '../sceneConstants'

// Skips invisible subtrees (e.g. geo_vector_line's hidden glyph-style
// siblings) so they don't get a scale computation every frame for nothing.
function traverseVisible(object3D, callback) {
  if (object3D.visible === false) return
  callback(object3D)
  object3D.children.forEach((child) => traverseVisible(child, callback))
}

// Applies zoom-invariant scaling and/or a size multiplier to meshes tagged
// with userData.zoomInvariantRadius. The multiplier applies regardless of
// whether zoom-invariant sizing is on, and is picked by glyph kind: a child
// tagged userData.thickenGroup = 'vector' (a vector's shaft OR its
// arrowhead cone) always uses extraThickVectors, whichever way it scales;
// otherwise extraThick for line/tube glyphs (cross-section-only scaling) or
// extraLargePoints for point markers (uniform scaling).
function ZoomInvariantScaler({
  objects,
  zoomEnabled,
  extraThick,
  extraThickVectors,
  extraLargePoints,
}) {
  const worldPos = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ camera }) => {
    objects.forEach((o) => {
      if (!o) return

      // ONE distance -- and so one zoomScale -- per TOP-LEVEL object, not
      // one independently computed per zoom-invariant child. A multi-piece
      // glyph (a dashed/ringed line's many small tube/ring segments) needs
      // to scale as a single uniform unit, the way a texture moves with its
      // surface; letting each piece compute its own correction from its own
      // world position made segments at different camera distances end up
      // visibly different sizes -- a bulging/tapering artifact on any line
      // long enough (or viewed end-on enough) that its pieces sit at
      // meaningfully different distances from the camera. Lines expose
      // userData.segmentMid (their own local-space centre) as a stable
      // single reference point for this; anything else just uses its own
      // world position, which is what already happened per-child before.
      let zoomScale = 1
      if (zoomEnabled) {
        if (o.userData?.segmentMid) {
          o.updateMatrixWorld()
          worldPos.copy(o.userData.segmentMid).applyMatrix4(o.matrixWorld)
        } else {
          o.getWorldPosition(worldPos)
        }
        const distance = camera.position.distanceTo(worldPos)
        zoomScale = THREE.MathUtils.clamp(
          distance / ZOOM_INVARIANT_REFERENCE_DISTANCE,
          ZOOM_INVARIANT_MIN_SCALE,
          ZOOM_INVARIANT_MAX_SCALE,
        )
      }

      traverseVisible(o, (child) => {
        const baseRadius = child.userData?.zoomInvariantRadius
        if (!baseRadius) return
        const isUniform = !!child.userData.zoomInvariantUniform
        const isVector = child.userData.thickenGroup === 'vector'

        let thickMultiplier = 1
        if (isVector) {
          thickMultiplier = extraThickVectors ? EXTRA_THICK_LINE_MULTIPLIER : 1
        } else if (isUniform) {
          thickMultiplier = extraLargePoints ? EXTRA_LARGE_POINT_MULTIPLIER : 1
        } else {
          thickMultiplier = extraThick ? EXTRA_THICK_LINE_MULTIPLIER : 1
        }
        let finalScale = zoomScale * thickMultiplier
        if (isVector) {
          finalScale = Math.min(finalScale, VECTOR_ZOOM_MAX_SCALE * thickMultiplier)
        } else if (isUniform) {
          finalScale = Math.min(
            finalScale,
            extraLargePoints ? EXTRA_LARGE_POINT_MAX_SCALE : POINT_ZOOM_MAX_SCALE,
          )
        }
        if (!isUniform) {
          finalScale = Math.max(finalScale, MIN_LINE_WORLD_RADIUS / baseRadius)
        }

        if (isUniform) {
          child.scale.setScalar(finalScale)
        } else {
          child.scale.set(finalScale, 1, finalScale)
        }
      })
    })
  })

  return null
}

// Keeps each geo_vector_line's dash/ring collision-accent patterns
// (userData.updateZoomRatio, see geoVectorLine.js) in sync with camera
// distance -- geoVectorLineDefinition builds the glyph once, up front, with
// no access to the camera, so re-deriving the dash/ring count as the user
// zooms has to happen here instead. Passes the raw (unclamped) distance
// ratio rather than a pre-clamped scale -- dashes and rings each want their
// own clamp range (dashes read fine over a narrow range; a fine "ring
// texture" needs to grow much more at extreme zoom-out to stay legible), so
// that tuning lives entirely in geoVectorLine.js instead of being split
// across two files.
function DashZoomSync({ objects, zoomEnabled }) {
  const worldMid = useMemo(() => new THREE.Vector3(), [])

  // Explicit priority -1 (lower runs earlier) so this always runs BEFORE
  // ZoomInvariantScaler in the same frame, not just by JSX/mount-order
  // coincidence. It matters here specifically: rebuilding the dash pattern
  // creates brand-new Mesh children with an unset (1,1,1) scale, and
  // ZoomInvariantScaler is what corrects that to the right zoom-invariant
  // cross-section radius. If it ran first (or in an unspecified order),
  // those new segments would render at their raw, un-scaled radius for one
  // frame every time the pattern rebuilds -- a visible thickness flicker
  // during a continuous zoom, since rebuilds happen repeatedly as the scale
  // crosses each threshold.
  useFrame(({ camera }) => {
    if (!zoomEnabled) return
    objects.forEach((o) => {
      if (!o?.userData?.updateZoomRatio || !o.userData.segmentMid) return
      o.updateMatrixWorld()
      worldMid.copy(o.userData.segmentMid).applyMatrix4(o.matrixWorld)
      const distance = camera.position.distanceTo(worldMid)
      o.userData.updateZoomRatio(distance / ZOOM_INVARIANT_REFERENCE_DISTANCE)
    })
  }, -1)

  return null
}

// Syncs Line2/LineMaterial glyphs with canvas resolution (for correct pixel
// linewidth) and the extra-thick multiplier -- neither is available to
// geoVectorLine.js/vectorShaftGlyph.js at construction time. A child tagged
// userData.thickenGroup = 'vector' (vectorShaftGlyph.js's fat-line shaft)
// keys off extraThickVectors instead of extraThick, so the two toggles stay
// independent.
function FatLineSync({ objects, extraThick, extraThickVectors }) {
  const { size } = useThree()

  useEffect(() => {
    objects.forEach((o) => {
      if (!o) return
      o.traverse((child) => {
        if (!child.userData?.isFatLine || !child.material) return
        child.material.resolution.set(size.width, size.height)
        const baseWidth = child.userData.fatLineBaseWidth || 1
        const isThick = child.userData.thickenGroup === 'vector' ? extraThickVectors : extraThick
        child.material.linewidth = baseWidth * (isThick ? EXTRA_THICK_LINE_MULTIPLIER : 1)
      })
    })
  }, [objects, size.width, size.height, extraThick, extraThickVectors])

  return null
}

export { ZoomInvariantScaler, DashZoomSync, FatLineSync }
