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

// Skips invisible subtrees (geo_vector_line builds every settings version and
// shows one). See docs/architecture/vector-line-glyphs.md.
function traverseVisible(object3D, callback) {
  if (object3D.visible === false) return
  callback(object3D)
  object3D.children.forEach((child) => traverseVisible(child, callback))
}

// Zoom-invariant scaling + a per-glyph-kind size multiplier for meshes tagged
// userData.zoomInvariantRadius. See docs/architecture/glyph-sizing.md#zoominvariantscaler.
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

      // ONE distance per top-level object (via userData.segmentMid for lines),
      // not per child. See docs/architecture/glyph-sizing.md#one-distance-per-object.
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

// Keeps each geo_vector_line's dash/ring pattern in sync with camera distance
// (via userData.updateZoomRatio), passing the raw unclamped ratio.
// See docs/architecture/glyph-sizing.md#dashzoomsync.
function DashZoomSync({ objects, zoomEnabled }) {
  const worldMid = useMemo(() => new THREE.Vector3(), [])

  // Priority -1 so this runs BEFORE ZoomInvariantScaler, else new dash
  // segments flicker at raw radius.
  // See docs/architecture/glyph-sizing.md#dash-sync-priority.
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

// Syncs Line2/LineMaterial glyphs with canvas resolution + the extra-thick
// multiplier (neither available at construction time).
// See docs/architecture/glyph-sizing.md#fatlinesync.
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
