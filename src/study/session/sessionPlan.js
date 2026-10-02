import { resolveTechniqueOrder } from '@/study/phase1/sequence'
import { resolveHolisticOrder } from './holistic'

// The whole study session as a flat list of steps, and the cursor that walks
// it. See docs/architecture/study-session.md.

export const SESSION_PLAN_VERSION = 6

export const STEP_KINDS = Object.freeze({
  PHASE1_BLOCK: 'phase1Block',
  HOLISTIC: 'holistic',
  SURVEY: 'survey',
  DONE: 'done',
})

// The embedded-data names each survey reads must match its Qualtrics survey
// flow exactly, or the value arrives blank. A dev build uses the test copies,
// whose redirects go to localhost; the deployed build uses the live surveys,
// which redirect to geoscratch.xyz. See docs/architecture/study-session.md.
const QUALTRICS = 'https://auckland.au1.qualtrics.com/jfe/form/'

export const TEST_SURVEYS = Object.freeze({
  demographic: `${QUALTRICS}SV_9uhAiSCmJdY5ULI`,
  perBlock: `${QUALTRICS}SV_b41w0nx2tzLHiZw`,
  holistic: `${QUALTRICS}SV_eY9wZ7aNQQh8Kto`,
  post: `${QUALTRICS}SV_0SuRuKxECznsNG6`,
})

export const LIVE_SURVEYS = Object.freeze({
  demographic: `${QUALTRICS}SV_57vWxUbe7NdY6ZU`,
  perBlock: `${QUALTRICS}SV_3BME83p2WJ4DeqW`,
  holistic: `${QUALTRICS}SV_bHnb61GWy1NsRGm`,
  post: `${QUALTRICS}SV_3duwiGRdcjSAj42`,
})

export const SURVEYS = import.meta.env.DEV ? TEST_SURVEYS : LIVE_SURVEYS

/**
 * @param {{ researchId: string, slot: number }} identity
 */
export function buildSessionPlan({ researchId, slot }) {
  const { squareRow, techniqueOrder } = resolveTechniqueOrder(researchId, slot)
  const holistic = resolveHolisticOrder(slot)
  const steps = [
    { kind: STEP_KINDS.SURVEY, survey: 'demographic', params: { participantID: researchId } },
  ]

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

/**
 * Every survey also gets the link's `cohort`, so test responses can be filtered
 * out in Qualtrics; each survey flow declares it as embedded data.
 *
 * @returns {string|null} null while that survey's link is not set
 */
export function surveyUrl(step, { cohort } = {}) {
  if (!SURVEYS[step.survey]) return null
  const url = new URL(SURVEYS[step.survey])
  for (const [key, value] of Object.entries(step.params)) url.searchParams.set(key, String(value))
  if (cohort) url.searchParams.set('cohort', cohort)
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
