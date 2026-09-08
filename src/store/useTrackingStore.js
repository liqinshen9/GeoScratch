import { create } from 'zustand'
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient'
import useAuthStore from '@/store/useAuthStore'
import {
  buildAttemptInsert,
  buildAttemptCompletion,
  buildAttemptProgress,
  buildMcqUpdate,
  nextAttemptNumber,
} from '@/lib/attemptPayload'

// Drives the `exercise_attempts` table from ExercisePage via useExerciseTracking.
// One row per exercise open (so abandoned attempts are captured); updated on
// pass, on MCQ pick, and best-effort on unmount / tab hide. Every write is
// fire-and-forget and must never block render or navigation. No-op unless the
// backend is configured and auth status is 'ready'. See
// docs/architecture/backend.md.

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const CLIENT_SESSION_ID = newId()

function canTrack() {
  return isSupabaseConfigured && useAuthStore.getState().status === 'ready'
}

const useTrackingStore = create((set, get) => ({
  clientSessionId: CLIENT_SESSION_ID,
  attemptId: null,
  exerciseNumber: null,
  startedPerf: null,
  completed: false,
  // The id of the current logical "exercise open". The hook generates one per
  // open and passes it on every call; a repeat (React StrictMode double-invokes
  // effects in dev, and the effect also re-runs when auth settles) is ignored.
  openId: null,

  /** Insert a fresh attempt row for a newly opened exercise. */
  startAttempt: async ({ openId, exerciseNumber, exerciseKind }) => {
    if (get().openId === openId) return // already handled this open
    set({
      openId,
      attemptId: null,
      exerciseNumber,
      startedPerf: performance.now(),
      completed: false,
    })
    if (!canTrack()) return

    const profileId = useAuthStore.getState().userId
    if (!profileId) return

    try {
      const { count } = await supabase
        .from('exercise_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .eq('exercise_number', exerciseNumber)

      const row = buildAttemptInsert({
        profileId,
        exerciseNumber,
        exerciseKind,
        attemptNumber: nextAttemptNumber(count),
        clientSessionId: get().clientSessionId,
        nowIso: new Date().toISOString(),
      })

      const { data, error } = await supabase
        .from('exercise_attempts')
        .insert(row)
        .select('id')
        .single()
      if (error) throw error

      // Only attach the id if this open is still the current one.
      if (get().openId === openId) set({ attemptId: data.id })
    } catch (err) {
      console.error('[GeoScratch] Failed to start attempt:', err)
    }
  },

  /** Mark the current attempt passed. Runs once per attempt. */
  completeAttempt: (result) => {
    const { attemptId, startedPerf, completed } = get()
    if (completed) return
    set({ completed: true })
    if (!canTrack() || !attemptId) return

    const update = buildAttemptCompletion({
      result,
      startedPerf,
      nowPerf: performance.now(),
      nowIso: new Date().toISOString(),
    })
    supabase
      .from('exercise_attempts')
      .update(update)
      .eq('id', attemptId)
      .then(({ error }) => {
        if (error) console.error('[GeoScratch] Failed to complete attempt:', error)
      })
  },

  /** Best-effort duration/state write for an attempt that was never passed. */
  saveProgress: (result) => {
    const { attemptId, startedPerf, completed } = get()
    if (completed || !canTrack() || !attemptId) return

    const update = buildAttemptProgress({ result, startedPerf, nowPerf: performance.now() })
    supabase
      .from('exercise_attempts')
      .update(update)
      .eq('id', attemptId)
      .then(({ error }) => {
        if (error) console.error('[GeoScratch] Failed to save attempt progress:', error)
      })
  },

  /** Record a perceptual-exercise MCQ answer on the current attempt. */
  recordMcq: ({ answer, correctId }) => {
    const { attemptId, startedPerf } = get()
    const update = buildMcqUpdate({
      answer,
      correctId,
      startedPerf,
      nowPerf: performance.now(),
      nowIso: new Date().toISOString(),
    })
    if (update.passed) set({ completed: true })
    if (!canTrack() || !attemptId) return

    supabase
      .from('exercise_attempts')
      .update(update)
      .eq('id', attemptId)
      .then(({ error }) => {
        if (error) console.error('[GeoScratch] Failed to record MCQ answer:', error)
      })
  },
}))

export default useTrackingStore
