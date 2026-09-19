import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import THREE from '@/utils/three'
import usePivotPlaybackStore from '@/store/usePivotPlaybackStore'
import { getEasingFn } from '@/store/animationConfig'
import { SELECTION_HIGHLIGHT_COLOR } from '@/store/highlightStyles'
import { AXIS_SHAFT_RADIUS } from './sceneConstants'

const AXIS_ROTATIONS = {
  X: [0, 0, -Math.PI / 2],
  Y: [0, 0, 0],
  Z: [Math.PI / 2, 0, 0],
}

const CENTER_LABEL_SCALE_REF_DISTANCE = 56
const CENTER_LABEL_SCALE_MIN = 0.6
const CENTER_LABEL_SCALE_MAX = 1

function PivotAxisHighlight({ axis, length = 20 }) {
  const rotation = useMemo(() => AXIS_ROTATIONS[String(axis).toUpperCase()] ?? null, [axis])
  if (!rotation) return null

  const radius = AXIS_SHAFT_RADIUS * 3.4
  return (
    <mesh rotation={rotation} renderOrder={-900}>
      <cylinderGeometry args={[radius, radius, length * 2, 18]} />
      <meshBasicMaterial
        color={SELECTION_HIGHLIGHT_COLOR}
        transparent
        opacity={0.96}
        depthTest
        depthWrite={false}
      />
    </mesh>
  )
}

function PivotCenterLabel({ marker }) {
  const groupRef = useRef(null)
  const labelRef = useRef(null)
  const appliedScaleRef = useRef(1)
  const position = useMemo(() => marker.getWorldPosition(new THREE.Vector3()), [marker])

  useFrame(({ camera }) => {
    marker.getWorldPosition(position)
    groupRef.current?.position.copy(position)
    const distance = position.distanceTo(camera.position)
    const rawScale = CENTER_LABEL_SCALE_REF_DISTANCE / Math.max(distance, 1e-3)
    const targetScale = Math.max(
      CENTER_LABEL_SCALE_MIN,
      Math.min(CENTER_LABEL_SCALE_MAX, rawScale),
    )
    appliedScaleRef.current += (targetScale - appliedScaleRef.current) * 0.25
    if (labelRef.current) {
      labelRef.current.style.transform =
        `translate3d(8px, -14px, 0) scale(${appliedScaleRef.current.toFixed(3)})`
    }
  })

  return (
    <group ref={groupRef} position={position}>
      <Html style={{ pointerEvents: 'none' }}>
        <div
          ref={labelRef}
          className="label"
          style={{
            backgroundColor: 'rgba(17, 17, 17, 0.65)',
            transform: 'translate3d(8px, -14px, 0)',
          }}
        >
          C
        </div>
      </Html>
    </group>
  )
}

export default function PivotPlaybackDriver({ objects }) {
  const target = usePivotPlaybackStore((s) => s.target)
  const [activeAxis, setActiveAxis] = useState(null)
  const { invalidate } = useThree()
  useEffect(() => {
    if (target && !objects.includes(target)) {
      usePivotPlaybackStore.getState().stop()
      setActiveAxis(null)
    } else if (target) {
      target.userData.animateSteps(0)
      setActiveAxis(target.userData.pivotHighlightAxis ?? null)
    } else {
      setActiveAxis(null)
    }
    invalidate()
  }, [target, objects, invalidate])
  useFrame((_, delta) => {
    const playback = usePivotPlaybackStore.getState()
    if (!playback.target) return
    const fn = playback.target.userData.animateSteps
    const next = Math.min(1, playback.progress + Math.min(delta, 0.05) / (2 * (fn.durationScale || 1)))
    fn(next, getEasingFn('easeInOut'))
    const nextAxis = playback.target.userData.pivotHighlightAxis ?? null
    setActiveAxis((current) => (current === nextAxis ? current : nextAxis))
    playback.advance(next)
    invalidate()
  })
  return (
    <>
      <PivotAxisHighlight axis={activeAxis} />
      {target?.userData?.pivotCenterMarker && (
        <PivotCenterLabel marker={target.userData.pivotCenterMarker} />
      )}
    </>
  )
}
