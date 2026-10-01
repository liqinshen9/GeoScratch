import { describe, it, expect } from 'vitest'
import { questionPrompt, choiceLabel, probeBandStyle, targetNames } from './questionCopy'
import { PLACEMENT } from './stimulusConfig'

describe('question copy', () => {
  const stimulus = (type) => ({
    question: { type },
    objects: [
      { key: 'B', role: 'target', kind: 'vector' },
      { key: 'A', role: 'target', kind: 'line' },
      { key: 'd1', role: 'distractor', kind: 'sphere' },
    ],
  })

  it('names each target with its kind', () => {
    expect(targetNames(stimulus('occlusion'))).toEqual({ A: 'Line A', B: 'Vector B', C: 'C' })
  })

  it('asks about the crossing for occlusion and the band for proximity', () => {
    expect(questionPrompt(stimulus('occlusion'))).toBe(
      'Line A and Vector B do not touch. Where they overlap on screen, which one is in front?',
    )
    expect(questionPrompt(stimulus('proximity'))).toMatch(/band/)
    expect(choiceLabel(stimulus('occlusion'), 'B')).toBe('Vector B in front of Line A')
    expect(choiceLabel(stimulus('proximity'), 'A')).toBe('Line A is closer')
  })

  it("asks a distance question about a vector's tip", () => {
    const distance = {
      question: { type: 'distance' },
      objects: [
        { key: 'A', role: 'target', kind: 'vector' },
        { key: 'B', role: 'target', kind: 'point' },
        { key: 'C', role: 'reference', kind: 'point' },
      ],
    }
    expect(questionPrompt(distance)).toBe(
      'Point C sits on a line. Which of these two is closer to Point C?\n\nThe tip of Vector A or Point B?',
    )
    expect(choiceLabel(distance, 'A')).toBe('The tip of Vector A')
    expect(choiceLabel(distance, 'B')).toBe('Point B')
  })

  it('names a line and a sphere by the points a distance question judges', () => {
    const distance = {
      question: { type: 'distance' },
      objects: [
        { key: 'A', role: 'target', kind: 'sphere' },
        { key: 'B', role: 'target', kind: 'line' },
        { key: 'C', role: 'reference', kind: 'point' },
      ],
    }
    expect(choiceLabel(distance, 'A')).toBe('The closest point on the surface of Sphere A')
    expect(choiceLabel(distance, 'B')).toBe('Any point on Line B')
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
