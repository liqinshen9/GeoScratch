import { useCallback, useEffect, useMemo } from 'react'
import { create } from 'zustand'
import useAuthStore from '@/store/useAuthStore'
import {
  buildSessionPlan,
  initialCursor,
  completeStep,
  markStarted,
  handOff,
  acceptReturn,
  STEP_KINDS,
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

// One cursor for every component, so the layout's lock, the exercise page and
// the /study screens can never disagree about where the session is.
const useCursorStore = create((set) => ({
  researchId: null,
  cursor: initialCursor(),
  load: (researchId) =>
    set({ researchId, cursor: researchId ? loadCursor(researchId) : initialCursor() }),
  write: (researchId, cursor) => {
    saveCursor(researchId, cursor)
    set({ researchId, cursor })
  },
}))

// Questionnaires open in a second tab, and their return page advances the
// cursor there. Pick that up here so the waiting tab moves on by itself.
if (typeof window !== 'undefined') {
  const reload = () => {
    const { researchId, load } = useCursorStore.getState()
    if (researchId) load(researchId)
  }
  window.addEventListener('storage', (event) => {
    const { researchId } = useCursorStore.getState()
    if (researchId && event.key === cursorKey(researchId)) reload()
  })
  window.addEventListener('focus', reload)
}

// The live cursor for `researchId`, even before this component's load effect
// has run (a child's effects run before its parent's).
function currentCursor(researchId) {
  const { researchId: loaded, cursor } = useCursorStore.getState()
  return loaded === researchId ? cursor : loadCursor(researchId)
}

/**
 * The study session on this device: its plan (from the research ID and slot)
 * and where the participant is in it. The cursor lives in localStorage so it
 * survives the round trip through Qualtrics. `plan` is null when no session
 * has been started. See docs/architecture/study-session.md.
 */
export default function useStudySession() {
  const study = useAuthStore((s) => s.study)
  const researchId = study?.researchId ?? null
  const slot = study?.slot ?? null

  const plan = useMemo(
    () => (researchId && slot ? buildSessionPlan({ researchId, slot }) : null),
    [researchId, slot],
  )

  const loadedFor = useCursorStore((s) => s.researchId)
  const storedCursor = useCursorStore((s) => s.cursor)
  useEffect(() => {
    if (useCursorStore.getState().researchId !== researchId) {
      useCursorStore.getState().load(researchId)
    }
  }, [researchId])
  // Before the effect above has run for this ID, the store may still hold
  // another session's cursor (or none): read it straight from storage.
  const cursor =
    loadedFor === researchId ? storedCursor : researchId ? loadCursor(researchId) : initialCursor()

  const update = useCallback(
    (next) => {
      if (researchId) useCursorStore.getState().write(researchId, next)
    },
    [researchId],
  )

  const start = useCallback(
    (stepIndex) => {
      if (!plan || currentCursor(researchId).startedAt?.[stepIndex] != null) return
      update(markStarted(currentCursor(researchId), stepIndex, Date.now()))
      logStudyEvent('step_start', plan.steps[stepIndex])
    },
    [plan, researchId, update],
  )

  const complete = useCallback(
    (stepIndex, detail = {}) => {
      if (!plan || currentCursor(researchId).stepIndex !== stepIndex) return
      update(completeStep(currentCursor(researchId), stepIndex))
      logStudyEvent('step_complete', plan.steps[stepIndex], detail)
    },
    [plan, researchId, update],
  )

  const handOffToSurvey = useCallback(
    (stepIndex) => {
      if (plan) update(handOff(currentCursor(researchId), stepIndex, new Date().toISOString()))
    },
    [plan, researchId, update],
  )

  /** @returns {boolean} whether the return advanced the session */
  const receiveReturn = useCallback(
    (detail = {}) => {
      if (!plan) return false
      const step = plan.steps[currentCursor(researchId).stepIndex]
      const result = acceptReturn(currentCursor(researchId), plan)
      if (!result.accepted) return false
      update(result.cursor)
      logStudyEvent('survey_return', step, { ...detail, handed_off_at: result.handedOffAt })
      return true
    },
    [plan, researchId, update],
  )

  /** Dev only: move the session to `stepIndex`, skipping everything between. */
  const jumpTo = useCallback(
    (stepIndex) => {
      if (plan) update({ ...currentCursor(researchId), stepIndex, awaiting: null })
    },
    [plan, researchId, update],
  )

  const step = plan ? (plan.steps[cursor.stepIndex] ?? null) : null
  return { study, plan, cursor, step, start, complete, handOffToSurvey, receiveReturn, jumpTo }
}

/** The holistic task the session is on, or null outside one. */
export function useCurrentStudyTask() {
  const { step } = useStudySession()
  return step?.kind === STEP_KINDS.HOLISTIC ? step : null
}
