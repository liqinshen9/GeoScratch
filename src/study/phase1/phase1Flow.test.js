import { describe, it, expect } from 'vitest'
import {
  FLOW,
  FLOW_ACTIONS,
  createFlowReducer,
  initialFlowState,
  currentTrial,
  progressCursor,
} from './phase1Flow'

const sequence = {
  blocks: [
    {
      technique: 'T1',
      trials: [
        { trialIndex: 0, stimulusId: 'p', practice: true },
        { trialIndex: 1, stimulusId: 'm', practice: false },
      ],
    },
    { technique: 'T2', trials: [{ trialIndex: 0, stimulusId: 'm', practice: false }] },
  ],
}
const reduce = createFlowReducer(sequence)
const run = (state, ...types) =>
  types.reduce((s, type) => reduce(s, typeof type === 'string' ? { type } : type), state)

describe('phase1Flow', () => {
  it('walks practice (with feedback), measured (without), block end, next block, done', () => {
    let state = initialFlowState(sequence, null)
    expect(state.status).toBe(FLOW.INTRO)

    state = run(state, FLOW_ACTIONS.START, FLOW_ACTIONS.BEGIN_BLOCK)
    expect(state.status).toBe(FLOW.FIXATION)

    state = run(state, FLOW_ACTIONS.FIXATION_DONE)
    expect(state.status).toBe(FLOW.TRIAL)
    expect(currentTrial(sequence, state).practice).toBe(true)

    state = reduce(state, { type: FLOW_ACTIONS.ANSWER, response: 'A' })
    expect(state.status).toBe(FLOW.FEEDBACK)
    expect(state.lastResponse).toBe('A')

    state = run(state, FLOW_ACTIONS.FEEDBACK_DONE, FLOW_ACTIONS.FIXATION_DONE)
    expect(state).toMatchObject({ status: FLOW.TRIAL, trialIndex: 1 })

    state = reduce(state, { type: FLOW_ACTIONS.ANSWER, response: 'B' })
    expect(state.status).toBe(FLOW.BLOCK_END)

    state = run(state, FLOW_ACTIONS.CONTINUE)
    expect(state).toMatchObject({ status: FLOW.BLOCK_INTRO, blockIndex: 1, trialIndex: 0 })

    state = run(
      state,
      FLOW_ACTIONS.BEGIN_BLOCK,
      FLOW_ACTIONS.FIXATION_DONE,
      FLOW_ACTIONS.ANSWER,
      FLOW_ACTIONS.CONTINUE,
    )
    expect(state.status).toBe(FLOW.DONE)
  })

  it('ignores actions that do not belong to the current screen', () => {
    const intro = initialFlowState(sequence, null)
    expect(reduce(intro, { type: FLOW_ACTIONS.ANSWER, response: 'A' })).toBe(intro)
    const fixation = run(intro, FLOW_ACTIONS.START, FLOW_ACTIONS.BEGIN_BLOCK)
    expect(reduce(fixation, { type: FLOW_ACTIONS.ANSWER, response: 'A' })).toBe(fixation)
  })

  it('resumes a saved cursor at its block intro, block end, or done', () => {
    expect(initialFlowState(sequence, { blockIndex: 0, trialIndex: 1 })).toMatchObject({
      status: FLOW.BLOCK_INTRO,
      blockIndex: 0,
      trialIndex: 1,
    })
    expect(initialFlowState(sequence, { blockIndex: 0, trialIndex: 2 }).status).toBe(FLOW.BLOCK_END)
    expect(initialFlowState(sequence, { blockIndex: 2, trialIndex: 0 }).status).toBe(FLOW.DONE)
    expect(initialFlowState(sequence, { bogus: true }).status).toBe(FLOW.INTRO)
  })

  it('a resumed block continues from the saved trial, not trial 0', () => {
    const resumed = initialFlowState(sequence, { blockIndex: 0, trialIndex: 1 })
    const state = run(resumed, FLOW_ACTIONS.BEGIN_BLOCK, FLOW_ACTIONS.FIXATION_DONE)
    expect(currentTrial(sequence, state).trialIndex).toBe(1)
    expect(progressCursor(state)).toEqual({ blockIndex: 0, trialIndex: 1 })
  })
})

describe('dev controls', () => {
  it('skips to the next block from anywhere, and to done past the last one', () => {
    let state = run(initialFlowState(sequence, null), FLOW_ACTIONS.START, FLOW_ACTIONS.BEGIN_BLOCK)
    state = reduce(state, { type: FLOW_ACTIONS.SKIP_BLOCK })
    expect(state).toMatchObject({ status: FLOW.BLOCK_INTRO, blockIndex: 1, trialIndex: 0 })

    state = reduce(state, { type: FLOW_ACTIONS.SKIP_BLOCK })
    expect(state).toMatchObject({ status: FLOW.DONE, blockIndex: 2 })
  })

  it('restarts to the intro from anywhere', () => {
    const mid = run(
      initialFlowState(sequence, null),
      FLOW_ACTIONS.START,
      FLOW_ACTIONS.BEGIN_BLOCK,
      FLOW_ACTIONS.FIXATION_DONE,
    )
    expect(reduce(mid, { type: FLOW_ACTIONS.RESTART })).toEqual(initialFlowState(sequence, null))
  })
})
