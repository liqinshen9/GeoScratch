/**
 * The Phase 1 session as a pure state machine over a resolved sequence:
 *
 *   intro -> blockIntro -> (fixation -> trial [-> feedback if practice])* -> blockEnd
 *         -> blockIntro ... -> done
 *
 * Timers (fixation, feedback) live in the page; this only says what comes next.
 */

export const FLOW = Object.freeze({
  INTRO: 'intro',
  BLOCK_INTRO: 'blockIntro',
  FIXATION: 'fixation',
  TRIAL: 'trial',
  FEEDBACK: 'feedback',
  BLOCK_END: 'blockEnd',
  DONE: 'done',
})

export const FLOW_ACTIONS = Object.freeze({
  START: 'start',
  BEGIN_BLOCK: 'beginBlock',
  FIXATION_DONE: 'fixationDone',
  ANSWER: 'answer',
  FEEDBACK_DONE: 'feedbackDone',
  CONTINUE: 'continue',
  // Dev only, from the buttons the trial page renders under import.meta.env.DEV.
  SKIP_BLOCK: 'skipBlock',
  SKIP_TO_LAST_BLOCK: 'skipToLastBlock',
  PREVIOUS_TRIAL: 'previousTrial',
  NEXT_TRIAL: 'nextTrial',
  RESTART: 'restart',
})

/**
 * Where a session starts. A saved cursor (from a reload) resumes at the start
 * screen of the block it was in, or at that block's end screen if every trial
 * had been answered.
 */
export function initialFlowState(sequence, saved) {
  const fresh = { status: FLOW.INTRO, blockIndex: 0, trialIndex: 0, lastResponse: null }
  if (!saved || !Number.isInteger(saved.blockIndex) || !Number.isInteger(saved.trialIndex)) {
    return fresh
  }
  if (saved.blockIndex >= sequence.blocks.length) return { ...fresh, status: FLOW.DONE }
  const block = sequence.blocks[saved.blockIndex]
  if (!block) return fresh
  const status = saved.trialIndex >= block.trials.length ? FLOW.BLOCK_END : FLOW.BLOCK_INTRO
  return { ...fresh, status, blockIndex: saved.blockIndex, trialIndex: saved.trialIndex }
}

export function currentTrial(sequence, state) {
  return sequence.blocks[state.blockIndex]?.trials[state.trialIndex] ?? null
}

function advanceTrial(sequence, state) {
  const block = sequence.blocks[state.blockIndex]
  const trialIndex = state.trialIndex + 1
  if (trialIndex >= block.trials.length) {
    return { ...state, status: FLOW.BLOCK_END, trialIndex, lastResponse: null }
  }
  return { ...state, status: FLOW.FIXATION, trialIndex, lastResponse: null }
}

/**
 * @param {{ feedbackAlways?: boolean }} [options]  `feedbackAlways` gives every
 *   trial practice-style feedback; the page turns it on in dev builds only.
 */
export function createFlowReducer(sequence, { feedbackAlways = false } = {}) {
  return function flowReducer(state, action) {
    switch (action.type) {
      case FLOW_ACTIONS.START:
        if (state.status !== FLOW.INTRO) return state
        return { ...state, status: FLOW.BLOCK_INTRO, blockIndex: 0, trialIndex: 0 }

      case FLOW_ACTIONS.BEGIN_BLOCK:
        if (state.status !== FLOW.BLOCK_INTRO) return state
        return { ...state, status: FLOW.FIXATION }

      case FLOW_ACTIONS.FIXATION_DONE:
        if (state.status !== FLOW.FIXATION) return state
        return { ...state, status: FLOW.TRIAL }

      case FLOW_ACTIONS.ANSWER: {
        if (state.status !== FLOW.TRIAL) return state
        const trial = currentTrial(sequence, state)
        if (trial?.practice || feedbackAlways) {
          return { ...state, status: FLOW.FEEDBACK, lastResponse: action.response ?? null }
        }
        return advanceTrial(sequence, state)
      }

      case FLOW_ACTIONS.FEEDBACK_DONE:
        if (state.status !== FLOW.FEEDBACK) return state
        return advanceTrial(sequence, state)

      case FLOW_ACTIONS.SKIP_BLOCK: {
        const blockIndex = state.blockIndex + 1
        const status = blockIndex >= sequence.blocks.length ? FLOW.DONE : FLOW.BLOCK_INTRO
        return { status, blockIndex, trialIndex: 0, lastResponse: null }
      }

      case FLOW_ACTIONS.SKIP_TO_LAST_BLOCK:
        return {
          status: FLOW.BLOCK_INTRO,
          blockIndex: sequence.blocks.length - 1,
          trialIndex: 0,
          lastResponse: null,
        }

      // Back one trial within the block, to look at it again. Not across blocks:
      // under /study a block is a session step, and the session has moved on.
      case FLOW_ACTIONS.PREVIOUS_TRIAL: {
        const replayable = [FLOW.FIXATION, FLOW.TRIAL, FLOW.FEEDBACK, FLOW.BLOCK_END]
        if (!replayable.includes(state.status) || state.trialIndex < 1) return state
        return {
          ...state,
          status: FLOW.FIXATION,
          trialIndex: state.trialIndex - 1,
          lastResponse: null,
        }
      }

      // On to the next trial without answering this one; nothing is logged.
      case FLOW_ACTIONS.NEXT_TRIAL: {
        const skippable = [FLOW.FIXATION, FLOW.TRIAL, FLOW.FEEDBACK]
        return skippable.includes(state.status) ? advanceTrial(sequence, state) : state
      }

      case FLOW_ACTIONS.RESTART:
        return { status: FLOW.INTRO, blockIndex: 0, trialIndex: 0, lastResponse: null }

      case FLOW_ACTIONS.CONTINUE: {
        if (state.status !== FLOW.BLOCK_END) return state
        const blockIndex = state.blockIndex + 1
        if (blockIndex >= sequence.blocks.length) {
          return { ...state, status: FLOW.DONE, blockIndex, trialIndex: 0 }
        }
        return { ...state, status: FLOW.BLOCK_INTRO, blockIndex, trialIndex: 0 }
      }

      default:
        return state
    }
  }
}

/** What to persist so a reload resumes: the next unanswered position. */
export function progressCursor(state) {
  return { blockIndex: state.blockIndex, trialIndex: state.trialIndex }
}
