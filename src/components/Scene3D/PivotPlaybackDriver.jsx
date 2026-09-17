import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import usePivotPlaybackStore from '@/store/usePivotPlaybackStore'
import { getEasingFn } from '@/store/animationConfig'

export default function PivotPlaybackDriver({ objects }) {
  const target = usePivotPlaybackStore((s) => s.target)
  const { invalidate } = useThree()
  useEffect(() => {
    if (target && !objects.includes(target)) usePivotPlaybackStore.getState().stop()
    else if (target) target.userData.animateSteps(0)
    invalidate()
  }, [target, objects, invalidate])
  useFrame((_, delta) => {
    const playback = usePivotPlaybackStore.getState()
    if (!playback.target) return
    const fn = playback.target.userData.animateSteps
    const next = Math.min(1, playback.progress + Math.min(delta, 0.05) / (2 * (fn.durationScale || 1)))
    fn(next, getEasingFn('easeInOut'))
    playback.advance(next)
    invalidate()
  })
  return null
}
