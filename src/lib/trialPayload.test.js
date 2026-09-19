import { describe, it, expect } from 'vitest'
import { reactionTimeMs, gradeResponse, buildTrialRow } from './trialPayload'

describe('reactionTimeMs', () => {
  it('keeps sub-millisecond precision to 0.01 ms and never goes negative', () => {
    expect(reactionTimeMs(1000, 1523.4567)).toBe(523.46)
    expect(reactionTimeMs(2000, 1000)).toBe(0)
  })
  it('is null without two numbers', () => {
    expect(reactionTimeMs(null, 5)).toBeNull()
    expect(reactionTimeMs(5, undefined)).toBeNull()
  })
})

describe('gradeResponse', () => {
  it('is correct only for a matching non-empty response', () => {
    expect(gradeResponse('A', 'A')).toBe(true)
    expect(gradeResponse('B', 'A')).toBe(false)
    expect(gradeResponse(null, 'A')).toBe(false)
  })
})

describe('buildTrialRow', () => {
  it('flattens trial, stimulus and response into a phase1_trials row', () => {
    const row = buildTrialRow({
      profileId: 'u1',
      clientSessionId: 's1',
      buildCommit: 'abc',
      participantCode: 'P01',
      blockIndex: 3,
      technique: 'T5',
      trial: { trialIndex: 7, practice: false },
      stimulus: {
        id: 'm-low-01',
        seed: 'seed:m-low-01',
        clutter: 'low',
        difficulty: 'hard',
        pairType: 'line-point',
        question: { type: 'proximity', band: 'left' },
        nearer: 'B',
      },
      response: 'B',
      presentedPerf: 100,
      answeredPerf: 900.5,
      presentedAtIso: '2026-09-13T00:00:00.000Z',
      settingsSnapshot: { haloEnabled: true },
      viewport: { width: 960, height: 640 },
      devicePixelRatio: 2,
      labelToggles: 3,
    })
    expect(row).toEqual({
      profile_id: 'u1',
      client_session_id: 's1',
      build_commit: 'abc',
      participant_code: 'P01',
      block_index: 3,
      technique: 'T5',
      trial_index: 7,
      is_practice: false,
      clutter: 'low',
      difficulty: 'hard',
      pair_type: 'line-point',
      question_type: 'proximity',
      probe_band: 'left',
      stimulus_id: 'm-low-01',
      stimulus_seed: 'seed:m-low-01',
      correct_target: 'B',
      response: 'B',
      correct: true,
      rt_ms: 800.5,
      presented_at: '2026-09-13T00:00:00.000Z',
      settings_snapshot: { haloEnabled: true },
      viewport_w: 960,
      viewport_h: 640,
      device_pixel_ratio: 2,
      label_toggles: 3,
    })
  })
})
