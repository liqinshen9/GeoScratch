import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import useAuthStore from '@/store/useAuthStore'
import { canTrack, CLIENT_SESSION_ID } from '@/store/useTrackingStore'
import { buildTrialRow } from '@/lib/trialPayload'
import { BUILD_COMMIT } from '@/lib/buildInfo'

// Writes `phase1_trials` and the profile's resolved sequence. Fire-and-forget
// like every backend write: nothing here may delay the next trial, because the
// reaction times being logged would absorb the wait.
// See docs/architecture/study-phase1.md#logging.

const usePhase1TrackingStore = create((set, get) => ({
  sequenceRecordedFor: null,

  recordSequence: (sequence) => {
    if (!canTrack()) return
    const { userId } = useAuthStore.getState()
    if (!userId || get().sequenceRecordedFor === sequence.participantCode) return
    set({ sequenceRecordedFor: sequence.participantCode })
    supabase
      .from('profiles')
      .update({ phase1_sequence: sequence })
      .eq('id', userId)
      .then(({ error }) => {
        if (error) console.error('[GeoScratch] Failed to record Phase 1 sequence:', error)
      })
  },

  recordTrial: (fields) => {
    if (!canTrack()) return
    const { userId, participantCode } = useAuthStore.getState()
    if (!userId) return
    const row = buildTrialRow({
      ...fields,
      profileId: userId,
      participantCode,
      clientSessionId: CLIENT_SESSION_ID,
      buildCommit: BUILD_COMMIT,
    })
    supabase
      .from('phase1_trials')
      .insert(row)
      .then(({ error }) => {
        if (error) console.error('[GeoScratch] Failed to record Phase 1 trial:', error)
      })
  },
}))

export default usePhase1TrackingStore
