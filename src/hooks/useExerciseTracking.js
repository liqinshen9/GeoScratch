import { useCallback, useEffect, useRef } from 'react'
import useTrackingStore from '@/store/useTrackingStore'
import useAuthStore from '@/store/useAuthStore'

/**
 * Wires ExercisePage into the attempt log. Starts a new attempt when the
 * exercise (or the auth status) changes, reports a pass when `result.passed`
 * first flips true, and best-effort saves elapsed time on unmount / tab hide.
 *
 * Everything degrades to a no-op when the backend is not configured.
 *
 * @param {number} exerciseNumber
 * @param {string} [exerciseKind]  the module's `kind`
 * @returns {{ reportResult: (result) => void, recordMcqAnswer: (answer, correctId) => void }}
 */
export function useExerciseTracking(exerciseNumber, exerciseKind) {
  const authStatus = useAuthStore((s) => s.status)
  const startAttempt = useTrackingStore((s) => s.startAttempt)
  const completeAttempt = useTrackingStore((s) => s.completeAttempt)
  const saveProgress = useTrackingStore((s) => s.saveProgress)
  const recordMcq = useTrackingStore((s) => s.recordMcq)

  // Latest evaluate() result, so unmount / visibility handlers can read it
  // without being in the effect's dependency list.
  const resultRef = useRef(null)
  const wasPassed = useRef(false)

  useEffect(() => {
    wasPassed.current = false
    startAttempt({ exerciseNumber, exerciseKind })

    const onHide = () => {
      if (document.visibilityState === 'hidden') saveProgress(resultRef.current)
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)

    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
      if (!wasPassed.current) saveProgress(resultRef.current)
    }
    // authStatus is included so an attempt row is created once auth becomes
    // ready, even if the exercise was opened before sign-in finished.
  }, [exerciseNumber, exerciseKind, authStatus, startAttempt, saveProgress])

  const reportResult = useCallback(
    (result) => {
      resultRef.current = result
      if (result?.passed && !wasPassed.current) {
        wasPassed.current = true
        completeAttempt(result)
      }
    },
    [completeAttempt],
  )

  const recordMcqAnswer = useCallback(
    (answer, correctId) => {
      if (answer && answer === correctId) wasPassed.current = true
      recordMcq({ answer, correctId })
    },
    [recordMcq],
  )

  return { reportResult, recordMcqAnswer }
}

export default useExerciseTracking
