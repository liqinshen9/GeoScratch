import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import usePivotPlaybackStore from '@/store/usePivotPlaybackStore'
import { getEasingFn } from '@/store/animationConfig'
import useSceneHighlightStore from '@/store/useSceneHighlightStore'

// The rotate step's axis is highlighted through SelectionHighlight (user's
// highlight style), never drawn here.
const setHighlightedAxis = (axis) => {
  const store = useSceneHighlightStore.getState()
  if (store.highlightedAxis !== (axis ? axis.toLowerCase() : null)) store.setHighlightedAxis(axis)
}

export default function PivotPlaybackDriver({ objects }) {
  const target = usePivotPlaybackStore((s) => s.target)
  const { invalidate } = useThree()
  useEffect(() => {
    if (target && !objects.includes(target)) {
      usePivotPlaybackStore.getState().stop()
      setHighlightedAxis(null)
    } else if (target) {
      target.userData.animateSteps(0)
      setHighlightedAxis(target.userData.pivotHighlightAxis ?? null)
    } else {
      setHighlightedAxis(null)
    }
    invalidate()
  }, [target, objects, invalidate])
  useEffect(() => () => setHighlightedAxis(null), [])
  useFrame((_, delta) => {
    const playback = usePivotPlaybackStore.getState()
    if (!playback.target) return
    const fn = playback.target.userData.animateSteps
    const next = Math.min(1, playback.progress + Math.min(delta, 0.05) / (2 * (fn.durationScale || 1)))
    fn(next, getEasingFn('easeInOut'))
    setHighlightedAxis(playback.target.userData.pivotHighlightAxis ?? null)
    playback.advance(next)
    invalidate()
  })
  return null
}
