import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import useAnimationStore from '@/store/useAnimationStore'
import useSettingsStore from '@/store/useSettingsStore'
import { getEasingFn } from '@/store/animationConfig'
import { makeAnimationSequence } from '@/utils/animationSequence'
import { applyTubeCollisions } from '@/utils/tubeCollision'

// Headless, mounted under <Scene>. Resolves the selected block's 3D object
// (by stable srcBlockId / animAliasBlockIds), calls its userData.animate(p,
// ease) each frame, invalidate()s. See docs/architecture/animation.md.

const isAnimatable = (object) => typeof object?.userData?.animate === 'function'

function blockDepth(workspace, blockId) {
  let block = workspace?.getBlockById?.(String(blockId))
  if (!block) return Infinity
  let depth = 0
  while ((block = block.getParent?.())) depth++
  return depth
}

// With nothing animatable selected, the object nearest the top of its block
// stack: a pipeline's object, or the outermost block of a derivation, which
// plays every stage beneath it. The last such object wins a tie.
// See docs/architecture/animation.md#fallback-target.
function fallbackTarget(objects, workspace) {
  let best = null
  let bestDepth = Infinity
  for (const object of objects) {
    if (!isAnimatable(object)) continue
    const ids = [object.userData.srcBlockId, ...(object.userData.animAliasBlockIds ?? [])]
    const depth = Math.min(...ids.map((id) => blockDepth(workspace, id)))
    if (depth <= bestDepth) {
      best = object
      bestDepth = depth
    }
  }
  return best
}

// An exercise's own playing order for the fallback, when it names more than one
// object. See docs/architecture/animation.md#a-whole-task-in-sequence.
function sequenceTarget(sequence, objects, workspace) {
  const parts = (sequence?.(objects, workspace) ?? []).filter(isAnimatable)
  if (parts.length > 1) return makeAnimationSequence(parts)
  return parts[0] ?? null
}

export default function AnimationDriver({ objects = [], fallback = false, sequence }) {
  const { invalidate } = useThree()
  const selectedBlockId = useWorkspaceStore((s) => s.selectedBlockId)
  const workspace = useWorkspaceStore((s) => s.workspace)

  const playing = useAnimationStore((s) => s.playing)
  const progress = useAnimationStore((s) => s.progress)
  const tickProgress = useAnimationStore((s) => s.tickProgress)
  const pause = useAnimationStore((s) => s.pause)
  const setHasTarget = useAnimationStore((s) => s.setHasTarget)

  const durationMs = useSettingsStore((s) => s.settings.animationDurationMs)
  const loop = useSettingsStore((s) => s.settings.animationLoop)
  const easing = useSettingsStore((s) => s.settings.animationEasing)

  const target = useMemo(() => {
    const selected = selectedBlockId
      ? objects.find((o) => {
          if (!isAnimatable(o)) return false
          const ud = o.userData
          return (
            String(ud.srcBlockId) === selectedBlockId ||
            ud.animAliasBlockIds?.some((id) => String(id) === selectedBlockId)
          )
        })
      : null
    if (selected || !fallback) return selected ?? null
    return sequenceTarget(sequence, objects, workspace) ?? fallbackTarget(objects, workspace)
  }, [objects, selectedBlockId, fallback, sequence, workspace])

  // The block of the step playing, highlighted in the workspace
  // (userData.animActiveBlockId, set by a step-by-step pipeline).
  const highlightedRef = useRef(null)
  const highlightActiveBlock = useCallback(
    (obj) => {
      const blockId = obj?.userData?.animActiveBlockId ?? null
      if (highlightedRef.current === blockId) return
      highlightedRef.current = blockId
      workspace?.highlightBlock?.(blockId)
    },
    [workspace],
  )

  const applyAnimation = useCallback(
    (obj, p) => {
      const fn = obj?.userData?.animate
      if (typeof fn !== 'function') return
      fn(Math.max(0, Math.min(1, p)), getEasingFn(easing))
      // Accents are computed at build time, for the resting scene; a moving line
      // or solid needs them recomputed. See docs/architecture/collision.md#during-an-animation.
      applyTubeCollisions(window.threeObjStore)
      highlightActiveBlock(obj)
    },
    [easing, highlightActiveBlock],
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
    // An animation may ask for more time than the configured duration: a staged
    // reveal is a short build-up, while a sweep wanders a path and needs room to
    // be followed. The speed control still scales it, this just sets the ratio.
    const scale = Number(target.userData?.animate?.durationScale) || 1
    let next = progress + (dt * 1000) / (durationMs * scale)
    if (next >= 1) next = loop ? next % 1 : 1
    applyAnimation(target, next)
    tickProgress(next)
    if (next >= 1 && !loop) pause()
    invalidate()
  })

  return null
}
