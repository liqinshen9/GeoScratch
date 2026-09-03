import { useCallback, useEffect, useMemo } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import useAnimationStore from '@/store/useAnimationStore'
import useSettingsStore from '@/store/useSettingsStore'
import { getEasingFn } from '@/store/animationConfig'

// Headless, mounted under <Scene> alongside <SelectionHighlight>. Same pattern:
// resolve the selected block's 3D object, mutate it each frame, and call
// invalidate() (the canvas is frameloop="demand").
//
// An object opts into animation by exposing `userData.animate(progress, ease)`
// -- a closure baked at scene-build time that renders progress 0..1 of whatever
// that object's blocks describe (a transform pipeline interpolating pose, a
// vector-arithmetic group revealing its arrows in sequence, ...). It gets the
// RAW linear progress plus the configured easing function and applies the ease
// where it makes sense: a single motion eases the whole 0..1, a staged reveal
// eases each stage's own local progress. A scene rebuild re-bakes the closure;
// this re-resolves the target by the stable srcBlockId, so a scrub position
// survives edits. `userData.animAliasBlockIds` lets a helper block (e.g. a
// transform_pipeline, which renders no object of its own) stand in as the
// selection that drives another object.

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

  const target = useMemo(() => {
    if (!selectedBlockId) return null
    return (
      objects.find((o) => {
        if (typeof o?.userData?.animate !== 'function') return false
        const ud = o.userData
        return (
          String(ud.srcBlockId) === selectedBlockId ||
          ud.animAliasBlockIds?.some((id) => String(id) === selectedBlockId)
        )
      }) || null
    )
  }, [objects, selectedBlockId])

  const applyAnimation = useCallback(
    (obj, p) => {
      const fn = obj?.userData?.animate
      if (typeof fn !== 'function') return
      fn(Math.max(0, Math.min(1, p)), getEasingFn(easing))
    },
    [easing],
  )

  useEffect(() => {
    setHasTarget(!!target)
  }, [target, setHasTarget])

  // When the selection moves to a different object (or this unmounts), snap the
  // one we were animating back to its resting (progress 1) state.
  useEffect(() => {
    const restoreTarget = target
    return () => {
      if (restoreTarget) applyAnimation(restoreTarget, 1)
      invalidate()
    }
  }, [target, applyAnimation, invalidate])

  // Place the target at the current scrub position -- on selection, on a manual
  // scrub, and after a scene rebuild re-bakes the closure. The play loop below
  // drives it directly while playing, so skip it here then.
  useEffect(() => {
    if (target && !playing) applyAnimation(target, progress)
    invalidate()
  }, [target, progress, playing, applyAnimation, invalidate])

  useFrame((_, delta) => {
    if (!playing || !target) return
    // frameloop="demand": the first frame after the canvas has been idle
    // reports the whole elapsed idle time as `delta`. Uncapped, that skips the
    // animation straight to the end the moment you press play (esp. on replay
    // after it settled). Cap it, same as LabelDeclutter's MAX_DT.
    const dt = Math.min(delta, 0.05)
    let next = progress + (dt * 1000) / durationMs
    if (next >= 1) next = loop ? next % 1 : 1
    applyAnimation(target, next)
    tickProgress(next)
    if (next >= 1 && !loop) pause()
    invalidate()
  })

  return null
}
