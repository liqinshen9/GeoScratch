// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'

const STORAGE_KEY = 'geoscratch:userBlocks'

async function freshStore() {
  vi.resetModules()
  const { default: useWorkspaceStore } = await import('./useWorkspaceStore')
  return useWorkspaceStore
}

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('starts with an empty userBlocks list when localStorage is empty', async () => {
    const store = await freshStore()
    expect(store.getState().userBlocks).toEqual([])
  })

  it('loads previously persisted user blocks on creation', async () => {
    const saved = [
      {
        id: 'my-block-1',
        name: 'Saved Block',
        xmlText: '<xml/>',
        source: 'workspace',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))

    const store = await freshStore()
    expect(store.getState().userBlocks).toEqual(saved)
  })

  it('falls back to an empty list when localStorage holds malformed JSON', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{not valid json')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const store = await freshStore()
    expect(store.getState().userBlocks).toEqual([])

    consoleError.mockRestore()
  })

  it('adds a user block to state and persists it to localStorage', async () => {
    const store = await freshStore()
    const added = store
      .getState()
      .addUserBlock({ name: '  My Vector Block  ', xmlText: '<xml>...</xml>' })

    expect(added).toMatchObject({
      name: 'My Vector Block',
      xmlText: '<xml>...</xml>',
      source: 'workspace',
    })
    expect(store.getState().userBlocks).toHaveLength(1)
    expect(store.getState().userBlocks[0]).toBe(added)

    const persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEY))
    expect(persisted).toEqual([added])
  })

  it('refuses to add a block with a blank name or missing xml', async () => {
    const store = await freshStore()
    expect(store.getState().addUserBlock({ name: '   ', xmlText: '<xml/>' })).toBeNull()
    expect(store.getState().addUserBlock({ name: 'Fine Name', xmlText: '' })).toBeNull()
    expect(store.getState().userBlocks).toEqual([])
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('deletes a user block from state and localStorage', async () => {
    const store = await freshStore()
    const first = store.getState().addUserBlock({ name: 'Block One', xmlText: '<xml/>' })
    const second = store.getState().addUserBlock({ name: 'Block Two', xmlText: '<xml/>' })

    store.getState().deleteUserBlock(first.id)

    expect(store.getState().userBlocks).toEqual([second])
    const persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEY))
    expect(persisted).toEqual([second])
  })
})
