import { supabase } from '@/lib/supabaseClient'
import useAuthStore from '@/store/useAuthStore'
import { canTrack, CLIENT_SESSION_ID } from '@/store/useTrackingStore'
import { BUILD_COMMIT } from '@/lib/buildInfo'

// Fire-and-forget like every backend write (docs/architecture/backend.md).

export function logStudyEvent(event, step = null, detail = {}) {
  if (!canTrack()) return
  const { userId, participantCode } = useAuthStore.getState()
  if (!userId) return
  supabase
    .from('study_events')
    .insert({
      profile_id: userId,
      client_session_id: CLIENT_SESSION_ID,
      build_commit: BUILD_COMMIT,
      participant_code: participantCode,
      step_index: step?.stepIndex ?? null,
      step_kind: step?.kind ?? null,
      event,
      detail,
    })
    .then(({ error }) => {
      if (error) console.error(`[GeoScratch] Failed to record study event ${event}:`, error)
    })
}

export function recordSessionPlan(plan) {
  if (!canTrack()) return
  const { userId } = useAuthStore.getState()
  if (!userId) return
  supabase
    .from('profiles')
    .update({ study_plan: plan })
    .eq('id', userId)
    .then(({ error }) => {
      if (error) console.error('[GeoScratch] Failed to record study plan:', error)
    })
}

/** Session-level context the Method asks for, logged once when a session starts. */
export function sessionContext(setting) {
  return {
    setting,
    viewport_w: window.innerWidth,
    viewport_h: window.innerHeight,
    device_pixel_ratio: window.devicePixelRatio,
    user_agent: navigator.userAgent,
  }
}
