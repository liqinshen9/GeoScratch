import { create } from 'zustand'
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient'
import { normalizeParticipantCode, normalizeCohort } from '@/lib/participantCode'

// Anonymous-only auth: on first load we sign in an anonymous user (a real
// auth.users row with a normal auth.uid(), so RLS works) and attach a
// participant code to its profile. The code is the analysis join key, NOT a
// login -- a new browser/device is a new anonymous user. See
// docs/architecture/backend.md.

const CODE_STORAGE_KEY = 'geoscratch:participantCode'
const COHORT_STORAGE_KEY = 'geoscratch:cohort'

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

/** The `?c=` link parameter, normalised. Falls back to the stored value. */
function resolveCohort() {
  let fromUrl = ''
  if (typeof window !== 'undefined') {
    fromUrl = normalizeCohort(new URLSearchParams(window.location.search).get('c') || '')
  }
  return fromUrl || normalizeCohort(loadStoredCohort() || '') || null
}

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, participant_code, cohort, user_agent')
    .eq('id', userId)
    .maybeSingle()
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
  cohort: loadStoredCohort(),

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
}))

export default useAuthStore
