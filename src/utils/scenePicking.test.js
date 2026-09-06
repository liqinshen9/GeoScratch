import { describe, it, expect } from 'vitest'
import {
  classifyGesture,
  findLabelOwner,
  resolveSelectedBlockId,
  resolveSrcBlockId,
  CLICK_MAX_DIST,
  CLICK_MAX_MS,
} from './scenePicking'

const down = (over = {}) => ({ clientX: 100, clientY: 100, time: 0, pointerId: 1, ...over })

describe('classifyGesture', () => {
  it('treats a small, quick press-release as a click', () => {
    expect(classifyGesture(down(), { clientX: 102, clientY: 101, time: 120, pointerId: 1 })).toBe(
      'click',
    )
  })

  it('treats a far-moving release as a drag', () => {
    expect(
      classifyGesture(down(), {
        clientX: 100 + CLICK_MAX_DIST + 1,
        clientY: 100,
        time: 50,
        pointerId: 1,
      }),
    ).toBe('drag')
  })

  it('treats a slow release as a drag', () => {
    expect(
      classifyGesture(down(), { clientX: 100, clientY: 100, time: CLICK_MAX_MS + 1, pointerId: 1 }),
    ).toBe('drag')
  })

  it('returns none for a pointer-id mismatch or a missing endpoint', () => {
    expect(classifyGesture(down(), { clientX: 100, clientY: 100, time: 10, pointerId: 2 })).toBe(
      'none',
    )
    expect(classifyGesture(null, { clientX: 100, clientY: 100, time: 10, pointerId: 1 })).toBe(
      'none',
    )
  })
})

// Minimal stand-in for a THREE.Object3D parent chain.
function node(userData, parent = null) {
  return { userData, parent }
}

describe('resolveSrcBlockId', () => {
  it('walks up to the nearest ancestor carrying srcBlockId', () => {
    const root = node({ srcBlockId: 'blk-1' })
    const wrapper = node({}, root)
    const leaf = node({ geoType: 'plane_mesh' }, wrapper)
    expect(resolveSrcBlockId(leaf)).toBe('blk-1')
  })

  it('coerces the id to a string and returns null when absent', () => {
    expect(resolveSrcBlockId(node({ srcBlockId: 42 }))).toBe('42')
    expect(resolveSrcBlockId(node({}, node({})))).toBeNull()
  })
})

describe('resolveSelectedBlockId', () => {
  it('returns the first hit that resolves to a block id', () => {
    const a = node({ geoType: 'grid' })
    const b = node({ srcBlockId: 'blk-2' })
    expect(resolveSelectedBlockId([{ object: a }, { object: b }])).toBe('blk-2')
  })

  it('returns null when nothing resolves', () => {
    expect(resolveSelectedBlockId([{ object: node({}) }])).toBeNull()
    expect(resolveSelectedBlockId([])).toBeNull()
  })
})

describe('findLabelOwner', () => {
  const getLabels = (o) => (Array.isArray(o.userData?.labels) ? o.userData.labels : [])

  it('finds the nearest ancestor with labels via the injected accessor', () => {
    const owner = node({ labels: [{ text: 'A' }] })
    const leaf = node({}, owner)
    expect(findLabelOwner(leaf, getLabels)).toBe(owner)
  })

  it('returns null when no ancestor has labels', () => {
    expect(findLabelOwner(node({}), getLabels)).toBeNull()
  })
})
