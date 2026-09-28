import { describe, it, expect } from 'vitest'
import {
  buildSessionPlan,
  surveyUrl,
  initialCursor,
  completeStep,
  handOff,
  acceptReturn,
  markStarted,
  STEP_KINDS,
} from './sessionPlan'
import { williamsSquare } from '@/study/phase1/williams'
import { TECHNIQUE_IDS } from '@/study/phase1/conditions'

const plan = buildSessionPlan({ researchId: 'K7QX3M', slot: 3 })
const kinds = (steps) => steps.map((s) => s.kind)

describe('buildSessionPlan', () => {
  it('runs 10 blocks, 4 holistic conditions and the post survey', () => {
    const { steps } = plan
    expect(steps).toHaveLength(10 * 2 + 4 * 2 + 2)
    for (let i = 0; i < 20; i += 2) {
      expect(kinds(steps.slice(i, i + 2))).toEqual([STEP_KINDS.PHASE1_BLOCK, STEP_KINDS.SURVEY])
      expect(steps[i + 1].survey).toBe('perBlock')
    }
    for (let i = 20; i < 28; i += 2) {
      expect(kinds(steps.slice(i, i + 2))).toEqual([STEP_KINDS.HOLISTIC, STEP_KINDS.SURVEY])
      expect(steps[i + 1].survey).toBe('holistic')
    }
    expect(steps[28].survey).toBe('post')
    expect(steps[29].kind).toBe(STEP_KINDS.DONE)
    expect(steps.map((s) => s.stepIndex)).toEqual([...steps.keys()])
  })

  it('takes the Phase 1 order from the slot', () => {
    expect(plan.techniqueOrder).toEqual(williamsSquare(10)[2].map((i) => TECHNIQUE_IDS[i]))
    const blocks = plan.steps.filter((s) => s.kind === STEP_KINDS.PHASE1_BLOCK)
    expect(blocks.map((b) => b.technique)).toEqual(plan.techniqueOrder)
    expect(blocks.map((b) => b.blockIndex)).toEqual([...Array(10).keys()])
  })

  it('sends each survey the fields its header pipes in', () => {
    const surveys = plan.steps.filter((s) => s.kind === STEP_KINDS.SURVEY)
    expect(surveys[2].params).toEqual({
      participantID: 'K7QX3M',
      blockOrder: 3,
      technique: plan.techniqueOrder[2],
    })
    const holistic = plan.steps.find((s) => s.kind === STEP_KINDS.HOLISTIC)
    expect(surveys[10].params).toEqual({
      participantID: 'K7QX3M',
      conditionOrder: 1,
      combinationNum: holistic.number,
      renderMode: holistic.mode,
    })
    expect(Object.keys(surveys[14].params)).toEqual([
      'participantID',
      'phase1Order',
      'holisticOrder',
    ])
    expect(surveys[14].params.phase1Order.split('-')).toEqual(plan.techniqueOrder)
  })
})

describe('surveyUrl', () => {
  it('appends the embedded data as query parameters', () => {
    const step = plan.steps[1]
    const url = new URL(surveyUrl(step))
    expect(url.origin + url.pathname).toBe(
      'https://auckland.au1.qualtrics.com/jfe/form/SV_b41w0nx2tzLHiZw',
    )
    expect(url.searchParams.get('participantID')).toBe('K7QX3M')
    expect(url.searchParams.get('blockOrder')).toBe('1')
    expect(url.searchParams.get('technique')).toBe(plan.techniqueOrder[0])
  })
})

describe('session cursor', () => {
  it('ignores a completion for a step it has already left', () => {
    const cursor = completeStep(initialCursor(), 0)
    expect(cursor.stepIndex).toBe(1)
    expect(completeStep(cursor, 0)).toBe(cursor)
  })

  it('accepts a return only for the survey it handed off to', () => {
    let cursor = completeStep(initialCursor(), 0)
    expect(acceptReturn(cursor, plan).accepted).toBe(false)

    cursor = handOff(cursor, 1, '2026-09-25T00:00:00Z')
    const result = acceptReturn(cursor, plan)
    expect(result.accepted).toBe(true)
    expect(result.handedOffAt).toBe('2026-09-25T00:00:00Z')
    expect(result.cursor.stepIndex).toBe(2)
    expect(result.cursor.awaiting).toBeNull()

    // Reloading the return URL does nothing more.
    expect(acceptReturn(result.cursor, plan).accepted).toBe(false)
  })

  it('does not skip the post survey when the holistic survey return is replayed', () => {
    let cursor = { ...initialCursor(), stepIndex: 27 }
    cursor = handOff(cursor, 27, 'now')
    cursor = acceptReturn(cursor, plan).cursor
    expect(plan.steps[cursor.stepIndex].survey).toBe('post')
    expect(acceptReturn(cursor, plan).cursor.stepIndex).toBe(28)
  })

  it('keeps the first start time of a step', () => {
    const cursor = markStarted(initialCursor(), 20, 1000)
    expect(markStarted(cursor, 20, 5000).startedAt[20]).toBe(1000)
  })
})
