import { describe, it, expect } from 'vitest'
import { resolveSequence } from './sequence'
import { TECHNIQUE_IDS } from './conditions'
import { williamsSquare } from './williams'

const stimulusSet = {
  seed: 'fake',
  practice: ['p-01', 'p-02', 'p-03', 'p-04'].map((id) => ({ id })),
  measured: Array.from({ length: 16 }, (_, i) => ({ id: `m-${i}` })),
}

describe('resolveSequence', () => {
  it('orders techniques by the participant row of the Williams square', () => {
    const sequence = resolveSequence('P03', stimulusSet)
    expect(sequence.squareRow).toBe(2)
    expect(sequence.techniqueOrder).toEqual(williamsSquare(10)[2].map((i) => TECHNIQUE_IDS[i]))
    expect(new Set(sequence.techniqueOrder).size).toBe(10)
  })

  it('runs every practice stimulus first, then every measured stimulus once, in each block', () => {
    const sequence = resolveSequence('P01', stimulusSet)
    expect(sequence.blocks).toHaveLength(10)
    for (const block of sequence.blocks) {
      expect(block.trials).toHaveLength(20)
      expect(block.trials.slice(0, 4).every((t) => t.practice)).toBe(true)
      expect(block.trials.slice(4).every((t) => !t.practice)).toBe(true)
      expect(new Set(block.trials.slice(4).map((t) => t.stimulusId)).size).toBe(16)
      expect(block.trials.map((t) => t.trialIndex)).toEqual([...Array(20).keys()])
    }
  })

  it('is reproducible from the code alone and shuffles blocks independently', () => {
    const a = resolveSequence('P07', stimulusSet)
    expect(resolveSequence('P07', stimulusSet)).toEqual(a)
    const orders = a.blocks.map((b) => b.trials.map((t) => t.stimulusId).join())
    expect(new Set(orders).size).toBeGreaterThan(1)
  })
})
