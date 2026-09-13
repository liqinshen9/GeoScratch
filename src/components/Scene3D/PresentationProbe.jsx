import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

// Reports the performance.now() of the first frame that draws a new, non-empty
// `objects` array: the reaction-time onset for a study trial. Draws nothing.
// See docs/architecture/study-phase1.md#onset-timing.
export default function PresentationProbe({ objects, onPresented }) {
  const invalidate = useThree((state) => state.invalidate)
  const pendingRef = useRef(false)
  const callbackRef = useRef(onPresented)

  useEffect(() => {
    callbackRef.current = onPresented
  }, [onPresented])

  useEffect(() => {
    if (!objects?.length) return
    pendingRef.current = true
    invalidate()
  }, [objects, invalidate])

  useFrame(() => {
    if (!pendingRef.current) return
    pendingRef.current = false
    callbackRef.current?.(performance.now())
  })

  return null
}
