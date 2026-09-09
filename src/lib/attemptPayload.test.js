import { describe, it, expect } from 'vitest'
import {
  durationMs,
  countSteps,
  nextAttemptNumber,
  gradeMcq,
  buildAttemptInsert,
  buildAttemptCompletion,
  buildAttemptProgress,
  buildMcqUpdate,
} from './attemptPayload'

describe('durationMs', () => {
  it('rounds the delta to whole ms and never goes negative', () => {
    expect(durationMs(1000, 1500.6)).toBe(501)
    expect(durationMs(2000, 1000)).toBe(0)
  })
  it('is null without two numbers', () => {
    expect(durationMs(null, 5)).toBeNull()
    expect(durationMs(5, undefined)).toBeNull()
  })
})

describe('countSteps', () => {
  it('splits a steps map into correct / incorrect counts', () => {
    expect(countSteps({ a: true, b: true, c: false })).toEqual({ correct: 2, incorrect: 1 })
  })
  it('treats missing / empty as zero', () => {
    expect(countSteps(undefined)).toEqual({ correct: 0, incorrect: 0 })
    expect(countSteps({})).toEqual({ correct: 0, incorrect: 0 })
  })
})

describe('nextAttemptNumber', () => {
  it('is existing + 1, defaulting a non-number to 0', () => {
    expect(nextAttemptNumber(0)).toBe(1)
    expect(nextAttemptNumber(3)).toBe(4)
    expect(nextAttemptNumber(null)).toBe(1)
    expect(nextAttemptNumber(undefined)).toBe(1)
  })
})

describe('gradeMcq', () => {
  it('is true only on an exact match to a truthy answer', () => {
    expect(gradeMcq('cube', 'cube')).toBe(true)
    expect(gradeMcq('sphere', 'cube')).toBe(false)
    expect(gradeMcq(null, 'cube')).toBe(false)
    expect(gradeMcq('', '')).toBe(false)
  })
})

describe('buildAttemptInsert', () => {
  it('produces a not-yet-passed row keyed to the profile and exercise', () => {
    const row = buildAttemptInsert({
      profileId: 'u1',
      exerciseNumber: 3,
      exerciseKind: 'transform',
      attemptNumber: 2,
      clientSessionId: 's1',
      nowIso: '2026-09-07T00:00:00.000Z',
    })
    expect(row).toEqual({
      profile_id: 'u1',
      exercise_number: 3,
      exercise_kind: 'transform',
      attempt_number: 2,
      client_session_id: 's1',
      started_at: '2026-09-07T00:00:00.000Z',
      passed: false,
    })
  })
})

describe('buildAttemptCompletion', () => {
  it('marks passed, derives counts, and snapshots the steps into meta', () => {
    const update = buildAttemptCompletion({
      result: { steps: { teapot: true, pipeline: true, scale: false } },
      startedPerf: 1000,
      nowPerf: 4200,
      nowIso: '2026-09-07T00:01:00.000Z',
    })
    expect(update).toEqual({
      completed_at: '2026-09-07T00:01:00.000Z',
      duration_ms: 3200,
      passed: true,
      correct_count: 2,
      incorrect_count: 1,
      meta: { steps: { teapot: true, pipeline: true, scale: false } },
    })
  })
})

describe('buildAttemptProgress', () => {
  it('records elapsed time and current pass state without completing', () => {
    const update = buildAttemptProgress({
      result: { passed: false, steps: { a: true } },
      startedPerf: 0,
      nowPerf: 1500,
    })
    expect(update).toEqual({
      duration_ms: 1500,
      passed: false,
      correct_count: 1,
      incorrect_count: 0,
    })
  })
})

describe('buildMcqUpdate', () => {
  it('completes the attempt on a correct pick', () => {
    const update = buildMcqUpdate({
      answer: 'cube',
      correctId: 'cube',
      startedPerf: 0,
      nowPerf: 900,
      nowIso: '2026-09-07T00:02:00.000Z',
    })
    expect(update).toMatchObject({
      mcq_answer: 'cube',
      mcq_correct: true,
      passed: true,
      completed_at: '2026-09-07T00:02:00.000Z',
      duration_ms: 900,
    })
  })

  it('records a wrong pick without completing', () => {
    const update = buildMcqUpdate({
      answer: 'sphere',
      correctId: 'cube',
      startedPerf: 0,
      nowPerf: 900,
      nowIso: '2026-09-07T00:02:00.000Z',
    })
    expect(update).toMatchObject({
      mcq_answer: 'sphere',
      mcq_correct: false,
      passed: false,
      completed_at: null,
    })
  })
})
