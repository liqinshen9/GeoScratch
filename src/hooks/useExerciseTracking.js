import { useCallback, useEffect, useMemo, useRef } from 'react'
import useTrackingStore from '@/store/useTrackingStore'
import useAuthStore from '@/store/useAuthStore'

function newOpenId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `open-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

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

  // One id per logical "exercise open". Regenerated when the exercise changes or
  // auth settles; stable across a StrictMode double-mount, so the store can
  // ignore the duplicate startAttempt call.
  const authSettled = authStatus === 'ready' || authStatus === 'offline' || authStatus === 'error'
  const openId = useMemo(newOpenId, [exerciseNumber, exerciseKind, authSettled])

  useEffect(() => {
    wasPassed.current = false
    if (!authSettled) return // wait for sign-in; a new openId fires this again
    startAttempt({ openId, exerciseNumber, exerciseKind })

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
  }, [openId, authSettled, exerciseNumber, exerciseKind, startAttempt, saveProgress])

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
