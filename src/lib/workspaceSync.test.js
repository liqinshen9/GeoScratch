import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {},
}))

const { chooseSnapshot, shouldSync } = await import('./workspaceSync')

describe('chooseSnapshot', () => {
  it('prefers a non-empty cloud snapshot', () => {
    expect(chooseSnapshot({ local: '<local/>', cloud: { xml: '<cloud/>' } })).toBe('<cloud/>')
  })

  it('falls back to local when there is no usable cloud row', () => {
    expect(chooseSnapshot({ local: '<local/>', cloud: null })).toBe('<local/>')
    expect(chooseSnapshot({ local: '<local/>', cloud: { xml: '' } })).toBe('<local/>')
  })

  it('returns null when neither side has anything', () => {
    expect(chooseSnapshot({ local: undefined, cloud: null })).toBeNull()
    expect(chooseSnapshot({ local: '', cloud: { xml: '' } })).toBeNull()
  })
})

describe('shouldSync', () => {
  it('is true only when configured and auth is ready', () => {
    expect(shouldSync('ready')).toBe(true)
    expect(shouldSync('signing-in')).toBe(false)
    expect(shouldSync('offline')).toBe(false)
    expect(shouldSync('error')).toBe(false)
  })
})
