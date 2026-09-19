import { describe, it, expect } from 'vitest'
import { questionPrompt, choiceLabel, probeBandStyle } from './questionCopy'
import { PLACEMENT } from './stimulusConfig'

describe('question copy', () => {
  it('asks about the crossing for occlusion and the band for proximity', () => {
    expect(questionPrompt({ type: 'occlusion' })).toMatch(/cross/)
    expect(questionPrompt({ type: 'proximity', band: 'left' })).toMatch(/band/)
    expect(choiceLabel({ type: 'occlusion' }, 'A')).toMatch(/front/)
    expect(choiceLabel({ type: 'proximity' }, 'B')).toMatch(/closer/)
  })
})

describe('probeBandStyle', () => {
  it('is null unless the question names a band', () => {
    expect(probeBandStyle({ question: { type: 'occlusion' }, probeNdc: [0, 0] })).toBeNull()
  })

  it('centres the band on the probe column, in percentages of the stage', () => {
    const style = probeBandStyle({ question: { type: 'proximity' }, probeNdc: [0, 0.2] })
    expect(style.left).toBe(`${(1 - PLACEMENT.probeBandHalfWidthNdc) * 50}%`)
    expect(style.width).toBe(`${PLACEMENT.probeBandHalfWidthNdc * 100}%`)
  })

  it('clips a band that would run off the edge of the stage', () => {
    const style = probeBandStyle({ question: { type: 'proximity' }, probeNdc: [-1, 0] })
    expect(style.left).toBe('0%')
    expect(style.width).toBe(`${PLACEMENT.probeBandHalfWidthNdc * 50}%`)
  })
})
