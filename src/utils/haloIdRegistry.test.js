import { describe, it, expect, beforeEach, vi } from 'vitest'

// The module keeps a single module-scoped Map/counter, so each test resets
// the module registry to get an isolated id sequence.
async function freshRegistry() {
  vi.resetModules()
  return import('./haloIdRegistry')
}

describe('getHaloId', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('assigns sequential ids starting at 1', async () => {
    const { getHaloId } = await freshRegistry()
    expect(getHaloId('a')).toBe(1)
    expect(getHaloId('b')).toBe(2)
    expect(getHaloId('c')).toBe(3)
  })

  it('returns the same id for the same block id on repeat calls', async () => {
    const { getHaloId } = await freshRegistry()
    const first = getHaloId('same-block')
    getHaloId('other-block')
    expect(getHaloId('same-block')).toBe(first)
  })

  it('coerces non-string block ids to their string form consistently', async () => {
    const { getHaloId } = await freshRegistry()
    expect(getHaloId(42)).toBe(getHaloId('42'))
  })

  it('wraps back to 1 after MAX_ID (254) without reusing 0 or colliding within a wrap', async () => {
    const { getHaloId } = await freshRegistry()
    const ids = []
    for (let i = 0; i < 255; i += 1) {
      ids.push(getHaloId(`block-${i}`))
    }
    expect(ids[0]).toBe(1)
    expect(ids[253]).toBe(254)
    expect(ids[254]).toBe(1) // wrapped
    expect(ids.slice(0, 254).every((id) => id >= 1 && id <= 254)).toBe(true)
  })
})
