// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getSolvedExerciseIds,
  isExerciseSolved,
  markExerciseSolved,
  unmarkExerciseSolved,
  clearSolvedExercises,
  isExerciseUnlocked,
} from './exerciseProgress'

const STORAGE_KEY = 'geoscratch:solved-exercises'

describe('exerciseProgress', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('starts empty', () => {
    expect(getSolvedExerciseIds().size).toBe(0)
    expect(isExerciseSolved('scale-object')).toBe(false)
  })

  it('opens the first challenge of every unit independently', () => {
    for (const id of ['scale-object', 'point-plane-distance', 'closer-object']) {
      expect(isExerciseUnlocked(id)).toBe(true)
    }
    expect(isExerciseUnlocked('rotate-object')).toBe(false)
    expect(isExerciseUnlocked('skew-lines-distance')).toBe(false)
    expect(isExerciseUnlocked('line-in-front')).toBe(false)
    expect(isExerciseUnlocked('unknown')).toBe(false)
  })

  it('requires all earlier challenges, including across section boundaries', () => {
    markExerciseSolved('scale-object')
    expect(isExerciseUnlocked('rotate-object')).toBe(true)
    expect(isExerciseUnlocked('transform-object')).toBe(false)
    markExerciseSolved('rotate-object')
    expect(isExerciseUnlocked('translate-object')).toBe(true)
    markExerciseSolved('translate-object')
    expect(isExerciseUnlocked('transform-object')).toBe(true)
    expect(isExerciseUnlocked('skew-lines-distance')).toBe(false)
  })

  it('keeps previously solved challenges accessible without bypassing other prerequisites', () => {
    markExerciseSolved('rotate-object')
    expect(isExerciseUnlocked('rotate-object')).toBe(true)
    expect(isExerciseUnlocked('translate-object')).toBe(false)
  })

  it('records a solve and persists it', () => {
    expect(markExerciseSolved('scale-object')).toBe(true)
    expect(isExerciseSolved('scale-object')).toBe(true)
    expect([...getSolvedExerciseIds()]).toEqual(['scale-object'])
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual(['scale-object'])
  })

  it('is idempotent -- a repeat solve is not a new solve', () => {
    expect(markExerciseSolved('rotate-object')).toBe(true)
    expect(markExerciseSolved('rotate-object')).toBe(false)
    expect([...getSolvedExerciseIds()]).toEqual(['rotate-object'])
  })

  it('un-marks a solve and reports whether it did anything', () => {
    markExerciseSolved('scale-object')
    markExerciseSolved('rotate-object')
    expect(unmarkExerciseSolved('scale-object')).toBe(true)
    expect(isExerciseSolved('scale-object')).toBe(false)
    expect([...getSolvedExerciseIds()]).toEqual(['rotate-object'])
    // Nothing to remove -> false, and the rest is untouched.
    expect(unmarkExerciseSolved('scale-object')).toBe(false)
    expect([...getSolvedExerciseIds()]).toEqual(['rotate-object'])
  })

  it('ignores malformed stored data', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json')
    expect(getSolvedExerciseIds().size).toBe(0)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ nope: true }))
    expect(getSolvedExerciseIds().size).toBe(0)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['a', 2, null, 'b']))
    expect([...getSolvedExerciseIds()]).toEqual(['a', 'b'])
  })

  it('clears all progress', () => {
    markExerciseSolved('scale-object')
    markExerciseSolved('rotate-object')
    clearSolvedExercises()
    expect(getSolvedExerciseIds().size).toBe(0)
  })
})
