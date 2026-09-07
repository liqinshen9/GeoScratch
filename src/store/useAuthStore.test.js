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
    state.session = null
    state.profile = { id: 'anon-1', participant_code: null, user_agent: null }
    state.updateError = null
    state.supabase = makeSupabase()
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
