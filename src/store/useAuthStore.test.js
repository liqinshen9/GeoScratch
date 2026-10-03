// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'

// A minimal stand-in for the supabase-js client: records the calls the store
// makes and returns canned data.
const state = {}

function makeSupabase() {
  const profileUpdates = []
  state.profileUpdates = profileUpdates
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: state.session ?? null } })),
      signInAnonymously: vi.fn(async () => {
        state.session = { user: { id: 'anon-1' } }
        return { data: { session: state.session }, error: null }
      }),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(async () => {
        state.session = null
        return { error: null }
      }),
    },
    from(table) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: table === 'profiles' ? (state.profile ?? { id: 'anon-1' }) : null,
              error: null,
            }),
          }),
        }),
        update(values) {
          return {
            eq: async (_col, id) => {
              profileUpdates.push({ table, values, id })
              return { error: state.updateError ?? null }
            },
          }
        },
      }
    },
  }
}

vi.mock('@/lib/supabaseClient', () => ({
  get isSupabaseConfigured() {
    return true
  },
  get supabase() {
    return state.supabase
  },
}))

async function freshStore() {
  vi.resetModules()
  const { default: useAuthStore } = await import('./useAuthStore')
  return useAuthStore
}

describe('useAuthStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.replaceState({}, '', '/')
    state.session = null
    state.profile = { id: 'anon-1', participant_code: null, user_agent: null, cohort: null }
    state.updateError = null
    state.supabase = makeSupabase()
  })

  it('leaves the normal app untracked outside a study session', async () => {
    const store = await freshStore()
    await store.getState().bootstrap({ studyOnly: true })

    expect(state.supabase.auth.signInAnonymously).not.toHaveBeenCalled()
    expect(store.getState().status).toBe('untracked')
  })

  it('signs the normal app in while a study session is active', async () => {
    window.localStorage.setItem(
      'geoscratch:studyIdentity',
      JSON.stringify({ slot: 1, researchId: 'K7QX3M' }),
    )
    const store = await freshStore()
    await store.getState().bootstrap({ studyOnly: true })

    expect(state.supabase.auth.signInAnonymously).toHaveBeenCalledOnce()
    expect(store.getState().status).toBe('ready')
  })

  it('still signs in for a study link after the normal app went untracked', async () => {
    const store = await freshStore()
    await store.getState().bootstrap({ studyOnly: true })
    await store.getState().bootstrap()

    expect(state.supabase.auth.signInAnonymously).toHaveBeenCalledOnce()
    expect(store.getState().status).toBe('ready')
  })

  it('starts a study session on the fresh login, leaving no empty profile', async () => {
    const store = await freshStore()
    await store.getState().bootstrap()
    await store.getState().startStudySession({ slot: 2, researchId: 'K7QX3M' })

    expect(state.supabase.auth.signOut).not.toHaveBeenCalled()
    expect(state.supabase.auth.signInAnonymously).toHaveBeenCalledOnce()
    expect(store.getState().participantCode).toBe('K7QX3M')
  })

  it("replaces a previous participant's login before starting a session", async () => {
    state.profile = { id: 'anon-1', participant_code: 'OLD123', user_agent: 'x', cohort: null }
    const store = await freshStore()
    await store.getState().bootstrap()
    await store.getState().startStudySession({ slot: 2, researchId: 'K7QX3M' })

    expect(state.supabase.auth.signOut).toHaveBeenCalledOnce()
  })

  it('signs in anonymously and becomes ready', async () => {
    const store = await freshStore()
    await store.getState().bootstrap()

    expect(state.supabase.auth.signInAnonymously).toHaveBeenCalledOnce()
    expect(store.getState().status).toBe('ready')
    expect(store.getState().userId).toBe('anon-1')
  })

  it('records the user agent once on first bootstrap', async () => {
    const store = await freshStore()
    await store.getState().bootstrap()
    const uaWrite = state.profileUpdates.find((u) => 'user_agent' in u.values)
    expect(uaWrite).toBeTruthy()
  })

  it('captures a ?c= cohort param onto the profile and localStorage', async () => {
    window.history.replaceState({}, '', '/?c=Study-1')
    const store = await freshStore()
    await store.getState().bootstrap()

    expect(store.getState().cohort).toBe('study-1')
    expect(window.localStorage.getItem('geoscratch:cohort')).toBe('study-1')
    expect(state.profileUpdates.some((u) => u.values.cohort === 'study-1')).toBe(true)
  })

  it('writes no cohort when there is no param and none stored', async () => {
    const store = await freshStore()
    await store.getState().bootstrap()

    expect(store.getState().cohort).toBeNull()
    expect(state.profileUpdates.some((u) => 'cohort' in u.values)).toBe(false)
  })

  it('is idempotent', async () => {
    const store = await freshStore()
    await store.getState().bootstrap()
    await store.getState().bootstrap()
    expect(state.supabase.auth.signInAnonymously).toHaveBeenCalledOnce()
  })

  it('persists a participant code to the profile and localStorage', async () => {
    const store = await freshStore()
    await store.getState().bootstrap()

    const res = await store.getState().setParticipantCode('  p-07 ')
    expect(res.ok).toBe(true)
    expect(store.getState().participantCode).toBe('P-07')
    expect(window.localStorage.getItem('geoscratch:participantCode')).toBe('P-07')
    expect(state.profileUpdates.some((u) => u.values.participant_code === 'P-07')).toBe(true)
  })

  it('reports failure when the code write errors', async () => {
    const store = await freshStore()
    await store.getState().bootstrap()
    state.updateError = { message: 'network' }

    const res = await store.getState().setParticipantCode('P-08')
    expect(res.ok).toBe(false)
  })
})
