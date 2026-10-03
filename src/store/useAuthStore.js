import { create } from 'zustand'
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient'
import { normalizeParticipantCode, normalizeCohort } from '@/lib/participantCode'
import { HOLISTIC_TASKS } from '@/study/session/holistic'
import useWorkspaceStore from '@/store/useWorkspaceStore'

// Anonymous-only auth: on first load we sign in an anonymous user (a real
// auth.users row with a normal auth.uid(), so RLS works) and attach a
// participant code to its profile. The code is the analysis join key, NOT a
// login -- a new browser/device is a new anonymous user. See
// docs/architecture/backend.md.

const CODE_STORAGE_KEY = 'geoscratch:participantCode'
const COHORT_STORAGE_KEY = 'geoscratch:cohort'
const STUDY_STORAGE_KEY = 'geoscratch:studyIdentity'
const COMPLETED_STORAGE_KEY = 'geoscratch:studyCompleted'

function loadStored(key, label) {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key) || null
  } catch (err) {
    console.error(`[GeoScratch] Failed to read ${label}:`, err)
    return null
  }
}

function persistStored(key, value, label) {
  if (typeof window === 'undefined') return
  try {
    if (value) window.localStorage.setItem(key, value)
    else window.localStorage.removeItem(key)
  } catch (err) {
    console.error(`[GeoScratch] Failed to persist ${label}:`, err)
  }
}

const loadStoredCode = () => loadStored(CODE_STORAGE_KEY, 'participant code')
const storeCode = (code) => persistStored(CODE_STORAGE_KEY, code, 'participant code')
const loadStoredCohort = () => loadStored(COHORT_STORAGE_KEY, 'cohort')
const storeCohort = (cohort) => persistStored(COHORT_STORAGE_KEY, cohort, 'cohort')

function loadStoredStudy() {
  try {
    const parsed = JSON.parse(loadStored(STUDY_STORAGE_KEY, 'study identity') || 'null')
    return Number.isInteger(parsed?.slot) ? parsed : null
  } catch {
    return null
  }
}
const storeStudy = (study) =>
  persistStored(STUDY_STORAGE_KEY, study ? JSON.stringify(study) : null, 'study identity')

/** The `?c=` link parameter, normalised. Falls back to the stored value. */
function resolveCohort() {
  let fromUrl = ''
  if (typeof window !== 'undefined') {
    fromUrl = normalizeCohort(new URLSearchParams(window.location.search).get('c') || '')
  }
  return fromUrl || normalizeCohort(loadStoredCohort() || '') || null
}

function loadCompleted() {
  try {
    const list = JSON.parse(loadStored(COMPLETED_STORAGE_KEY, 'completed studies') || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** Whether this browser has already finished the study under `researchId`. */
export function hasCompletedStudy(researchId) {
  return Boolean(researchId) && loadCompleted().includes(researchId)
}

function initialCohort() {
  const cohort = resolveCohort()
  if (cohort) storeCohort(cohort)
  return cohort
}

async function fetchProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) {
    console.error('[GeoScratch] Failed to load profile:', error)
    return null
  }
  return data
}

const useAuthStore = create((set, get) => ({
  // 'idle' -> 'signing-in' -> 'ready', or 'offline' when unconfigured, or 'error'
  status: isSupabaseConfigured ? 'idle' : 'offline',
  session: null,
  userId: null,
  profile: null,
  participantCode: loadStoredCode(),
  // From the link straight away, not only after sign-in: the study's dev tools
  // key off it (study/session/devTools.js).
  cohort: initialCohort(),
  // { slot, researchId } of the /study session on this device. Local
  // only: a session resumes on the device it started on, never by lookup.
  study: loadStoredStudy(),
  /** Set by finishStudy for the rest of this page's life, so the end screen stays up. */
  finishedResearchId: null,

  /** Idempotent. Safe to call from Layout's mount effect. */
  bootstrap: async () => {
    if (!isSupabaseConfigured) {
      set({ status: 'offline' })
      return
    }
    if (get().status !== 'idle') return
    set({ status: 'signing-in' })

    try {
      let {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (error) throw error
        session = data.session
      }

      supabase.auth.onAuthStateChange((_event, nextSession) => {
        set({ session: nextSession, userId: nextSession?.user?.id ?? null })
      })

      const userId = session?.user?.id ?? null
      const profile = userId ? await fetchProfile(userId) : null

      // Cohort comes from the `?c=` link param (or a prior visit's stored value).
      // A plain dev URL leaves it null, which is how test data stays separable.
      const cohort = resolveCohort()
      if (cohort) storeCohort(cohort)

      // One-time / drift writes back to the profile row.
      const patch = {}
      if (profile && !profile.user_agent && typeof navigator !== 'undefined') {
        patch.user_agent = navigator.userAgent
      }
      if (profile && cohort && profile.cohort !== cohort) {
        patch.cohort = cohort
      }
      if (userId && Object.keys(patch).length > 0) {
        await supabase.from('profiles').update(patch).eq('id', userId)
      }

      set({
        session,
        userId,
        profile: profile ? { ...profile, ...patch } : profile,
        participantCode: profile?.participant_code ?? get().participantCode,
        cohort: cohort ?? profile?.cohort ?? get().cohort,
        status: 'ready',
      })
    } catch (err) {
      console.error('[GeoScratch] Auth bootstrap failed:', err)
      set({ status: 'error' })
    }
  },

  /**
   * Attach / change the participant code on the current profile. The code is
   * deliberately NOT globally unique: the same person on a second device is a
   * new anonymous user that legitimately carries the same code (it groups their
   * rows at analysis time).
   */
  setParticipantCode: async (raw) => {
    const code = normalizeParticipantCode(raw)
    if (!code) return { ok: false, reason: 'empty' }

    const { userId } = get()
    if (!isSupabaseConfigured || !userId) {
      set({ participantCode: code })
      storeCode(code)
      return { ok: true, offline: true }
    }

    const { error } = await supabase
      .from('profiles')
      .update({ participant_code: code })
      .eq('id', userId)

    if (error) {
      console.error('[GeoScratch] Failed to set participant code:', error)
      return { ok: false, reason: 'network' }
    }

    set((state) => ({
      participantCode: code,
      profile: state.profile ? { ...state.profile, participant_code: code } : state.profile,
    }))
    storeCode(code)
    return { ok: true }
  },

  /**
   * Start a study session: attach the research ID and counterbalancing slot
   * from the study link to the profile. The ID becomes the participant code,
   * so every existing row joins on it.
   */
  startStudySession: async ({ slot, researchId }) => {
    // Every session is a fresh anonymous user with no saved work on the task
    // exercises. Otherwise a previous participant on a lab machine (or a dev
    // who opened those exercises) leaks a profile, cloud snapshots or local
    // autosaves into this participant's holistic tasks.
    await get().resetIdentity()
    useWorkspaceStore.getState().clearSavedWorkspaces(HOLISTIC_TASKS.map((id) => `exercise-${id}`))

    const res = await get().setParticipantCode(researchId)
    if (!res.ok) return res

    const study = { slot, researchId }
    storeStudy(study)
    set({ study })

    const { userId } = get()
    if (isSupabaseConfigured && userId) {
      supabase
        .from('profiles')
        .update({ study_slot: slot })
        .eq('id', userId)
        .then(({ error }) => {
          if (error) console.error('[GeoScratch] Failed to record study slot:', error)
        })
    }
    return { ok: true, researchId }
  },

  /**
   * End the study on this browser at its last step: remember the research ID as
   * completed, so reopening the link does not start a second session, then
   * forget the ID, cohort and anonymous login, so using GeoScratch afterwards
   * is not logged under that ID. See docs/architecture/study-session.md#finishing.
   */
  finishStudy: async () => {
    const researchId = get().study?.researchId
    if (!researchId) return
    persistStored(
      COMPLETED_STORAGE_KEY,
      JSON.stringify([...new Set([...loadCompleted(), researchId])]),
      'completed studies',
    )
    storeCode(null)
    storeStudy(null)
    storeCohort(null)
    set({ participantCode: null, study: null, cohort: null, finishedResearchId: researchId })
    if (!isSupabaseConfigured) return
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('[GeoScratch] Sign-out failed:', err)
    }
    set({ status: 'idle', session: null, userId: null, profile: null })
  },

  /** Forget this device's participant: a new anonymous user, no code, no study. */
  resetIdentity: async () => {
    storeCode(null)
    storeStudy(null)
    if (!isSupabaseConfigured) {
      set({ participantCode: null, study: null })
      return
    }
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('[GeoScratch] Sign-out failed:', err)
    }
    set({
      status: 'idle',
      session: null,
      userId: null,
      profile: null,
      participantCode: null,
      study: null,
    })
    await get().bootstrap()
  },
}))

export default useAuthStore
