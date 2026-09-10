// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getSolvedExerciseIds,
  isExerciseSolved,
  markExerciseSolved,
  unmarkExerciseSolved,
  clearSolvedExercises,
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
