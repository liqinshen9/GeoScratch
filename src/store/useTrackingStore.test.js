// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'

const calls = { inserts: [], updates: [] }
let authState = { status: 'ready', userId: 'u1' }

function query(table) {
  return {
    select: (_cols, opts) => {
      if (opts?.head) {
        return { eq: () => ({ eq: async () => ({ count: 1, error: null }) }) }
      }
      return { single: async () => ({ data: { id: 'attempt-1' }, error: null }) }
    },
    insert(row) {
      calls.inserts.push({ table, row })
      return {
        select: () => ({ single: async () => ({ data: { id: 'attempt-1' }, error: null }) }),
      }
    },
    update(values) {
      return {
        eq: (_col, id) => {
          calls.updates.push({ table, values, id })
          return Promise.resolve({ error: null })
        },
      }
    },
  }
}

vi.mock('@/lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { from: (t) => query(t) },
}))

vi.mock('@/store/useAuthStore', () => ({
  default: { getState: () => authState },
}))

async function freshStore() {
  vi.resetModules()
  const { default: useTrackingStore } = await import('./useTrackingStore')
  return useTrackingStore
}

describe('useTrackingStore', () => {
  beforeEach(() => {
    calls.inserts = []
    calls.updates = []
    authState = { status: 'ready', userId: 'u1' }
  })

  it('inserts one attempt row on open and keeps the returned id', async () => {
    const store = await freshStore()
    await store
      .getState()
      .startAttempt({ openId: 'o1', exerciseNumber: 3, exerciseKind: 'transform' })

    expect(calls.inserts).toHaveLength(1)
    expect(calls.inserts[0].row).toMatchObject({
      profile_id: 'u1',
      exercise_number: 3,
      attempt_number: 2, // existing count 1 + 1
      passed: false,
    })
    expect(store.getState().attemptId).toBe('attempt-1')
  })

  it('ignores a repeat startAttempt with the same openId (StrictMode double-fire)', async () => {
    const store = await freshStore()
    await store.getState().startAttempt({ openId: 'o1', exerciseNumber: 1 })
    await store.getState().startAttempt({ openId: 'o1', exerciseNumber: 1 })
    expect(calls.inserts).toHaveLength(1)
  })

  it('completes the attempt exactly once', async () => {
    const store = await freshStore()
    await store.getState().startAttempt({ openId: 'o1', exerciseNumber: 1 })

    const result = { passed: true, steps: { a: true, b: false } }
    store.getState().completeAttempt(result)
    store.getState().completeAttempt(result)

    const completions = calls.updates.filter((u) => u.values.passed === true)
    expect(completions).toHaveLength(1)
    expect(completions[0].values).toMatchObject({ correct_count: 1, incorrect_count: 1 })
  })

  it('does nothing when auth is not ready', async () => {
    authState = { status: 'signing-in', userId: null }
    const store = await freshStore()
    await store.getState().startAttempt({ openId: 'o1', exerciseNumber: 1 })
    expect(calls.inserts).toHaveLength(0)
  })

  it('records an MCQ answer against the attempt', async () => {
    const store = await freshStore()
    await store
      .getState()
      .startAttempt({ openId: 'o8', exerciseNumber: 8, exerciseKind: 'perceptual' })
    store.getState().recordMcq({ answer: 'cube', correctId: 'cube' })

    const mcqWrite = calls.updates.find((u) => 'mcq_answer' in u.values)
    expect(mcqWrite.values).toMatchObject({ mcq_answer: 'cube', mcq_correct: true, passed: true })
  })
})
