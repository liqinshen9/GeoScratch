import { useCallback, useEffect, useMemo, useState } from 'react'
import useAuthStore from '@/store/useAuthStore'
import {
  buildSessionPlan,
  initialCursor,
  completeStep,
  markStarted,
  handOff,
  acceptReturn,
} from './sessionPlan'
import { logStudyEvent } from './studyEvents'

const cursorKey = (researchId) => `geoscratch:study-session:${researchId}`

function loadCursor(researchId) {
  try {
    const raw = window.localStorage.getItem(cursorKey(researchId))
    const parsed = raw ? JSON.parse(raw) : null
    return Number.isInteger(parsed?.stepIndex) ? { ...initialCursor(), ...parsed } : initialCursor()
  } catch {
    return initialCursor()
  }
}

function saveCursor(researchId, cursor) {
  try {
    window.localStorage.setItem(cursorKey(researchId), JSON.stringify(cursor))
  } catch (err) {
    console.error('[GeoScratch] Failed to save study progress:', err)
  }
}

/**
 * The study session on this device: its plan (from the research ID and slot)
 * and where the participant is in it. Every page under /study that takes part
 * in the session reads it; the cursor lives in localStorage so it survives the
 * round trip through Qualtrics. Null when no session has been started.
 */
export default function useStudySession() {
  const study = useAuthStore((s) => s.study)
  const researchId = study?.researchId ?? null
  const slot = study?.slot ?? null

  const plan = useMemo(
    () => (researchId && slot ? buildSessionPlan({ researchId, slot }) : null),
    [researchId, slot],
  )
  const [cursor, setCursorState] = useState(() =>
    researchId ? loadCursor(researchId) : initialCursor(),
  )

  // Questionnaires open in a second tab, and their return page advances the
  // cursor there. Pick that up here so the waiting tab moves on by itself.
  useEffect(() => {
    if (!researchId) return undefined
    const reload = () => setCursorState(loadCursor(researchId))
    const onStorage = (event) => {
      if (event.key === cursorKey(researchId)) reload()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', reload)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', reload)
    }
  }, [researchId])

  const update = useCallback(
    (next) => {
      if (!researchId) return
      saveCursor(researchId, next)
      setCursorState(next)
    },
    [researchId],
  )

  const step = plan ? (plan.steps[cursor.stepIndex] ?? null) : null

  const start = useCallback(
    (stepIndex) => {
      if (!plan || cursor.startedAt?.[stepIndex] != null) return
      update(markStarted(cursor, stepIndex, Date.now()))
      logStudyEvent('step_start', plan.steps[stepIndex])
    },
    [plan, cursor, update],
  )

  const complete = useCallback(
    (stepIndex, detail = {}) => {
      if (!plan || cursor.stepIndex !== stepIndex) return
      update(completeStep(cursor, stepIndex))
      logStudyEvent('step_complete', plan.steps[stepIndex], detail)
    },
    [plan, cursor, update],
  )

  const handOffToSurvey = useCallback(
    (stepIndex) => {
      if (!plan) return
      update(handOff(cursor, stepIndex, new Date().toISOString()))
    },
    [plan, cursor, update],
  )

  /** @returns {boolean} whether the return advanced the session */
  const receiveReturn = useCallback(
    (detail = {}) => {
      if (!plan) return false
      const step = plan.steps[cursor.stepIndex]
      const result = acceptReturn(cursor, plan)
      if (!result.accepted) return false
      update(result.cursor)
      logStudyEvent('survey_return', step, { ...detail, handed_off_at: result.handedOffAt })
      return true
    },
    [plan, cursor, update],
  )

  return { study, plan, cursor, step, start, complete, handOffToSurvey, receiveReturn }
}
