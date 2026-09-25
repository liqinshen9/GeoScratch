import { resolveTechniqueOrder } from '@/study/phase1/sequence'
import { resolveHolisticOrder } from './holistic'

// The whole study session as a flat list of steps, and the cursor that walks
// it. See docs/architecture/study-session.md.

export const SESSION_PLAN_VERSION = 1

export const STEP_KINDS = Object.freeze({
  PHASE1_BLOCK: 'phase1Block',
  HOLISTIC: 'holistic',
  SURVEY: 'survey',
  DONE: 'done',
})

// The embedded-data names each survey reads must match its Qualtrics survey
// flow exactly, or the value arrives blank.
export const SURVEYS = Object.freeze({
  perBlock: 'https://auckland.au1.qualtrics.com/jfe/form/SV_b41w0nx2tzLHiZw',
  holistic: 'https://auckland.au1.qualtrics.com/jfe/form/SV_eY9wZ7aNQQh8Kto',
  post: 'https://auckland.au1.qualtrics.com/jfe/form/SV_0SuRuKxECznsNG6',
})

/**
 * @param {{ researchId: string, slot: number }} identity
 */
export function buildSessionPlan({ researchId, slot }) {
  const { squareRow, techniqueOrder } = resolveTechniqueOrder(researchId, slot)
  const holistic = resolveHolisticOrder(slot)
  const steps = []

  techniqueOrder.forEach((technique, blockIndex) => {
    steps.push({ kind: STEP_KINDS.PHASE1_BLOCK, blockIndex, technique })
    steps.push({
      kind: STEP_KINDS.SURVEY,
      survey: 'perBlock',
      params: { participantID: researchId, blockOrder: blockIndex + 1, technique },
    })
  })

  holistic.conditions.forEach((condition, conditionIndex) => {
    steps.push({ kind: STEP_KINDS.HOLISTIC, conditionIndex, ...condition })
    steps.push({
      kind: STEP_KINDS.SURVEY,
      survey: 'holistic',
      params: {
        participantID: researchId,
        conditionOrder: conditionIndex + 1,
        combinationNum: condition.number,
        renderMode: condition.mode,
      },
    })
  })

  steps.push({
    kind: STEP_KINDS.SURVEY,
    survey: 'post',
    params: {
      participantID: researchId,
      phase1Order: techniqueOrder.join('-'),
      holisticOrder: holistic.conditions.map((c) => c.number).join('-'),
    },
  })
  steps.push({ kind: STEP_KINDS.DONE })

  return {
    version: SESSION_PLAN_VERSION,
    researchId,
    slot,
    squareRow,
    techniqueOrder,
    holisticGroup: holistic.group,
    holisticTaskRow: holistic.taskRow,
    steps: steps.map((step, stepIndex) => ({ ...step, stepIndex })),
  }
}

export function surveyUrl(step) {
  const url = new URL(SURVEYS[step.survey])
  for (const [key, value] of Object.entries(step.params)) url.searchParams.set(key, String(value))
  return url.toString()
}

export const initialCursor = () => ({ stepIndex: 0, awaiting: null, startedAt: {} })

/** Leave `stepIndex`. A stale completion (the cursor has moved on) is ignored. */
export function completeStep(cursor, stepIndex) {
  if (cursor.stepIndex !== stepIndex) return cursor
  return { ...cursor, stepIndex: stepIndex + 1, awaiting: null }
}

/** When a step first started, kept across reloads so a task's time cap survives one. */
export function markStarted(cursor, stepIndex, nowMs) {
  if (cursor.startedAt?.[stepIndex] != null) return cursor
  return { ...cursor, startedAt: { ...cursor.startedAt, [stepIndex]: nowMs } }
}

export function handOff(cursor, stepIndex, nowIso) {
  if (cursor.stepIndex !== stepIndex) return cursor
  return { ...cursor, awaiting: { stepIndex, at: nowIso } }
}

/**
 * A return from Qualtrics advances past the survey only if this browser handed
 * off to that very survey. Reloading the return URL, or landing on it twice,
 * must not skip the next survey (the last holistic survey is followed directly
 * by the post-study one).
 *
 * @returns {{ cursor: object, accepted: boolean, handedOffAt: string|null }}
 */
export function acceptReturn(cursor, plan) {
  const step = plan.steps[cursor.stepIndex]
  const awaiting = cursor.awaiting
  if (step?.kind !== STEP_KINDS.SURVEY || awaiting?.stepIndex !== cursor.stepIndex) {
    return { cursor, accepted: false, handedOffAt: null }
  }
  return {
    cursor: completeStep(cursor, cursor.stepIndex),
    accepted: true,
    handedOffAt: awaiting.at,
  }
}
