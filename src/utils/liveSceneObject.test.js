import { describe, it, expect } from 'vitest'
import { isLiveSceneObject } from './liveSceneObject'

const node = (parent = null) => {
  const n = { parent }
  if (parent) (parent.children ??= []).push(n)
  return n
}

describe('isLiveSceneObject', () => {
  it('accepts an object registered under its own block id', () => {
    const mesh = node()
    expect(isLiveSceneObject(mesh, { a: mesh })).toBe(true)
  })

  it('accepts an object whose wrapper group is what got registered', () => {
    const group = node()
    const mesh = node(group)
    expect(isLiveSceneObject(mesh, { wrapper: group })).toBe(true)
  })

  it('rejects an object left over from an earlier run', () => {
    const staleGroup = node()
    const stale = node(staleGroup)
    expect(isLiveSceneObject(stale, { wrapper: node() })).toBe(false)
  })

  it('rejects when there is nothing to check against', () => {
    expect(isLiveSceneObject(null, {})).toBe(false)
    expect(isLiveSceneObject(node(), undefined)).toBe(false)
  })
})
