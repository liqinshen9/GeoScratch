import { describe, it, expect } from 'vitest'
import { resolveSequence } from './sequence'
import { TECHNIQUE_IDS } from './conditions'
import { williamsSquare } from './williams'
import { STIMULUS_SET_COUNT } from './stimulusConfig'

const stimulusSet = {
  seed: 'fake',
  practice: ['p-01', 'p-02', 'p-03', 'p-04'].map((id) => ({ id })),
  measured: Array.from({ length: 16 }, (_, i) => ({ id: `m-${i}` })),
}

describe('resolveSequence', () => {
  it('orders techniques by the participant row of the Williams square', () => {
    const sequence = resolveSequence('P03', stimulusSet)
    expect(sequence.squareRow).toBe(2)
    expect(sequence.techniqueOrder).toEqual(williamsSquare(9)[2].map((i) => TECHNIQUE_IDS[i]))
    expect(new Set(sequence.techniqueOrder).size).toBe(9)
  })

  it('runs every practice stimulus first, then every measured stimulus once, in each block', () => {
    const sequence = resolveSequence('P01', stimulusSet)
    expect(sequence.blocks).toHaveLength(9)
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

describe('resolveSequence with a slot', () => {
  it('takes the Williams row from the slot, not the code', () => {
    const sequence = resolveSequence('K7QX3M', stimulusSet, 21)
    expect(sequence.squareRow).toBe(2)
    expect(sequence.slot).toBe(21)
    expect(sequence.techniqueOrder).toEqual(williamsSquare(9)[2].map((i) => TECHNIQUE_IDS[i]))
  })
})

describe('resolveSequence with one set per block position', () => {
  const sets = Array.from({ length: STIMULUS_SET_COUNT }, (_, k) => ({
    seed: `set${k + 1}`,
    practice: [{ id: `s${k + 1}-p-01` }],
    measured: [{ id: `s${k + 1}-m-01` }, { id: `s${k + 1}-m-02` }],
  }))

  it('has one set per condition', () => {
    expect(STIMULUS_SET_COUNT).toBe(TECHNIQUE_IDS.length)
  })

  it('draws block k from set k, so no scene repeats', () => {
    const sequence = resolveSequence('K7QX3M', sets, 4)
    sequence.blocks.forEach((block, k) => {
      expect(block.stimulusSetSeed).toBe(`set${k + 1}`)
      expect(block.trials.every((t) => t.stimulusId.startsWith(`s${k + 1}-`))).toBe(true)
    })
    const ids = sequence.blocks.flatMap((b) => b.trials.map((t) => t.stimulusId))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('pairs every set with every technique equally often over a full rotation', () => {
    const rows = williamsSquare(TECHNIQUE_IDS.length).length
    const pairs = {}
    for (let slot = 1; slot <= rows; slot++) {
      const sequence = resolveSequence(`P${slot}`, sets, slot)
      for (const block of sequence.blocks) {
        const key = `${block.stimulusSetSeed}/${block.technique}`
        pairs[key] = (pairs[key] ?? 0) + 1
      }
    }
    const counts = Object.values(pairs)
    expect(counts).toHaveLength(STIMULUS_SET_COUNT * TECHNIQUE_IDS.length)
    expect(new Set(counts)).toEqual(new Set([rows / TECHNIQUE_IDS.length]))
  })
})
