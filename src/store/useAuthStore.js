import { create } from 'zustand'
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient'
import { normalizeParticipantCode } from '@/lib/participantCode'

// Anonymous-only auth: on first load we sign in an anonymous user (a real
// auth.users row with a normal auth.uid(), so RLS works) and attach a
// participant code to its profile. The code is the analysis join key, NOT a
// login -- a new browser/device is a new anonymous user. See
// docs/architecture/backend.md.

const CODE_STORAGE_KEY = 'geoscratch:participantCode'

function loadStoredCode() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(CODE_STORAGE_KEY) || null
  } catch (err) {
    console.error('[GeoScratch] Failed to read participant code:', err)
    return null
  }
}

function storeCode(code) {
  if (typeof window === 'undefined') return
  try {
    if (code) window.localStorage.setItem(CODE_STORAGE_KEY, code)
    else window.localStorage.removeItem(CODE_STORAGE_KEY)
  } catch (err) {
    console.error('[GeoScratch] Failed to persist participant code:', err)
  }
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

      // Record the browser once, for study bookkeeping.
      if (profile && !profile.user_agent && typeof navigator !== 'undefined') {
        await supabase.from('profiles').update({ user_agent: navigator.userAgent }).eq('id', userId)
      }

      set({
        session,
        userId,
        profile,
        participantCode: profile?.participant_code ?? get().participantCode,
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
