import { useEffect, useMemo, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import THREE from '@/utils/three'
import { ZOOM_INVARIANT_REFERENCE_DISTANCE } from '@/utils/zoomInvariantScale'

// Clamp range for HeadLight's camera-relative offset scale (see below).
const HEADLIGHT_OFFSET_MIN_SCALE = 0.2
const HEADLIGHT_OFFSET_MAX_SCALE = 4

function CameraHandle({ onReady }) {
  const { camera } = useThree()
  useEffect(() => {
    onReady?.(camera)
  }, [camera, onReady])
  return null
}

// Camera-following headlamp; matches the fixed point light's shadow
// settings. far kept well past the room's scale so no face's corners fall
// outside the shadow radius. A cube-map seam can still appear at some
// angles -- fixing that needs a single-frustum light type.
const HEADLIGHT_SHADOW_MIN_FAR = 280
const HEADLIGHT_SHADOW_FAR_MARGIN = 1.5

function HeadLight({ controlsRef, castShadow = true }) {
  const lightRef = useRef()
  // Offset scales with camera-to-target distance (#57) so it stays a
  // small, consistent angle at any zoom instead of a fixed world vector.
  const offset = useMemo(() => new THREE.Vector3(1.5, 2.5, 0.5), [])
  const worldOffset = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ camera }) => {
    if (!lightRef.current) return

    const target = controlsRef?.current?.target
    const distance = target ? camera.position.distanceTo(target) : ZOOM_INVARIANT_REFERENCE_DISTANCE
    const scale = THREE.MathUtils.clamp(
      distance / ZOOM_INVARIANT_REFERENCE_DISTANCE,
      HEADLIGHT_OFFSET_MIN_SCALE,
      HEADLIGHT_OFFSET_MAX_SCALE,
    )
    worldOffset.copy(offset).multiplyScalar(scale).applyQuaternion(camera.quaternion)
    lightRef.current.position.copy(camera.position).add(worldOffset)

    const shadowCam = lightRef.current.shadow.camera
    shadowCam.far = Math.max(HEADLIGHT_SHADOW_MIN_FAR, distance * HEADLIGHT_SHADOW_FAR_MARGIN)
    shadowCam.updateProjectionMatrix()
  })

  return (
    <pointLight
      ref={lightRef}
      color="#fff4e0"
      intensity={2.5}
      decay={0}
      distance={0}
      castShadow={castShadow}
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-bias={-0.001}
      shadow-camera-far={HEADLIGHT_SHADOW_MIN_FAR}
    />
  )
}

export { CameraHandle, HeadLight }
