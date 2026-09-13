import { describe, it, expect } from 'vitest'
import { targetLabelKeys, toggleLabelKeys } from './labelToggle'
import { blockIdFor } from './stimulusToXml'

const stimulus = { id: 'm-low-01', colourSalt: 'abc123' }
const objectFor = (key) => ({
  uuid: `uuid-${key}`,
  userData: { srcBlockId: blockIdFor(stimulus, key), labels: [{ anchor: 'line', name: key }] },
})

describe('targetLabelKeys', () => {
  it('returns the label keys of targets A and B', () => {
    expect(targetLabelKeys(stimulus, objectFor('A'))).toHaveLength(1)
    expect(targetLabelKeys(stimulus, objectFor('B'))).toHaveLength(1)
  })

  it('ignores distractors and missing input', () => {
    expect(targetLabelKeys(stimulus, objectFor('d3'))).toEqual([])
    expect(targetLabelKeys(null, objectFor('A'))).toEqual([])
    expect(targetLabelKeys(stimulus, null)).toEqual([])
  })
})

describe('toggleLabelKeys', () => {
  it('hides showing labels, then shows them again', () => {
    const keys = ['k1', 'k2']
    const hidden = toggleLabelKeys(new Set(), keys)
    expect([...hidden].sort()).toEqual(keys)
    expect(toggleLabelKeys(hidden, keys).size).toBe(0)
  })

  it('never mutates the set it is given', () => {
    const original = new Set(['other'])
    toggleLabelKeys(original, ['k1'])
    expect([...original]).toEqual(['other'])
  })
})
