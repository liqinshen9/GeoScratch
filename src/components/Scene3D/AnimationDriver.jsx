import { useCallback, useEffect, useMemo } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import useAnimationStore from '@/store/useAnimationStore'
import useSettingsStore from '@/store/useSettingsStore'
import { getEasingFn } from '@/store/animationConfig'

// Headless, mounted under <Scene> alongside <SelectionHighlight>. Same pattern:
// resolve the selected block's 3D object, mutate it each frame, and call
// invalidate() (the canvas is frameloop="demand"). A scene rebuild re-bakes
// userData.transformAnim (generateAndRun.js) and this re-resolves the target by
// the stable srcBlockId, so a scrub position survives edits.

export default function AnimationDriver({ objects = [] }) {
  const { invalidate } = useThree()
  const selectedBlockId = useWorkspaceStore((s) => s.selectedBlockId)

  const playing = useAnimationStore((s) => s.playing)
  const progress = useAnimationStore((s) => s.progress)
  const tickProgress = useAnimationStore((s) => s.tickProgress)
  const pause = useAnimationStore((s) => s.pause)
  const setHasTarget = useAnimationStore((s) => s.setHasTarget)

  const durationMs = useSettingsStore((s) => s.settings.animationDurationMs)
  const loop = useSettingsStore((s) => s.settings.animationLoop)
  const easing = useSettingsStore((s) => s.settings.animationEasing)

  // The selected object OR the object driven by the selected transform pipeline.
  const target = useMemo(() => {
    if (!selectedBlockId) return null
    return (
      objects.find((o) => {
        const anim = o?.userData?.transformAnim
        if (!anim) return false
        return (
          String(o.userData.srcBlockId) === selectedBlockId ||
          anim.pipelineBlockIds?.some((id) => String(id) === selectedBlockId)
        )
      }) || null
    )
  }, [objects, selectedBlockId])

  // Pose lerp: position/scale linear, rotation via shortest-path quaternion
  // slerp, both remapped through the configured easing (Settings > Animation &
  // Highlighting). All pipeline steps play together over one 0..1 sweep
  // (matching the issue's "identity -> target matrix" brief). Limitation: a
  // single rotation step past 180 degrees animates the short way round -- the
  // matrix decompose at bake time already collapses it to a <=180 quaternion.
  // Per-step staging that preserves large rotations is a later slice.
  const applyPose = useCallback((obj, p) => {
    const anim = obj?.userData?.transformAnim
    if (!anim) return
    const e = getEasingFn(easing)(Math.max(0, Math.min(1, p)))
    obj.position.lerpVectors(anim.startPos, anim.endPos, e)
    obj.quaternion.slerpQuaternions(anim.startQuat, anim.endQuat, e)
    obj.scale.lerpVectors(anim.startScale, anim.endScale, e)
    obj.updateMatrixWorld(true)
  }, [easing])

  useEffect(() => {
    setHasTarget(!!target)
  }, [target, setHasTarget])

  // When the selection moves to a different object (or this unmounts), snap the
  // one we were animating back to its resting, fully-transformed pose.
  useEffect(() => {
    const restoreTarget = target
    return () => {
      if (restoreTarget) applyPose(restoreTarget, 1)
      invalidate()
    }
  }, [target, applyPose, invalidate])

  // Place the target at the current scrub position -- on selection, on a manual
  // scrub, and after a scene rebuild re-bakes the pose. The play loop below
  // drives the pose directly while playing, so skip it here then.
  useEffect(() => {
    if (target && !playing) applyPose(target, progress)
    invalidate()
  }, [target, progress, playing, applyPose, invalidate])

  useFrame((_, delta) => {
    if (!playing || !target) return
    // frameloop="demand": the first frame after the canvas has been idle
    // reports the whole elapsed idle time as `delta`. Uncapped, that skips the
    // animation straight to the end the moment you press play (esp. on replay
    // after it settled). Cap it, same as LabelDeclutter's MAX_DT.
    const dt = Math.min(delta, 0.05)
    let next = progress + (dt * 1000) / durationMs
    if (next >= 1) next = loop ? next % 1 : 1
    applyPose(target, next)
    tickProgress(next)
    if (next >= 1 && !loop) pause()
    invalidate()
  })

  return null
}
