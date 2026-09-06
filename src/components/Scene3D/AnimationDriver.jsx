import { useCallback, useEffect, useMemo } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import useAnimationStore from '@/store/useAnimationStore'
import useSettingsStore from '@/store/useSettingsStore'
import { getEasingFn } from '@/store/animationConfig'

// Headless, mounted under <Scene>. Resolves the selected block's 3D object
// (by stable srcBlockId / animAliasBlockIds), calls its userData.animate(p,
// ease) each frame, invalidate()s. See docs/architecture/animation.md.

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

  // On selection change / unmount, snap the previous target back to progress 1.
  useEffect(() => {
    const restoreTarget = target
    return () => {
      if (restoreTarget) applyAnimation(restoreTarget, 1)
      invalidate()
    }
  }, [target, applyAnimation, invalidate])

  // Place the target at the scrub position (not while playing -- the loop does).
  useEffect(() => {
    if (target && !playing) applyAnimation(target, progress)
    invalidate()
  }, [target, progress, playing, applyAnimation, invalidate])

  useFrame((_, delta) => {
    if (!playing || !target) return
    // Cap the first-after-idle delta or the animation skips to the end.
    // See docs/architecture/animation.md#cap-the-first-delta.
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
