import { describe, it, expect } from 'vitest'
import { ANIMATION_EASINGS, EASING_FNS, getEasingFn } from './animationConfig'

describe('animationConfig easing functions', () => {
  it('every easing pins 0 -> 0 and 1 -> 1', () => {
    for (const name of Object.values(ANIMATION_EASINGS)) {
      const fn = EASING_FNS[name]
      expect(fn(0)).toBeCloseTo(0)
      expect(fn(1)).toBeCloseTo(1)
    }
  })

  it('linear is the identity; ease-in starts slow, ease-out starts fast', () => {
    expect(EASING_FNS[ANIMATION_EASINGS.LINEAR](0.5)).toBeCloseTo(0.5)
    expect(EASING_FNS[ANIMATION_EASINGS.EASE_IN](0.5)).toBeLessThan(0.5)
    expect(EASING_FNS[ANIMATION_EASINGS.EASE_OUT](0.5)).toBeGreaterThan(0.5)
  })

  it('getEasingFn falls back to ease-in-out for an unknown name', () => {
    expect(getEasingFn('nope')).toBe(EASING_FNS[ANIMATION_EASINGS.EASE_IN_OUT])
  })
})
