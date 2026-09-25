import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import ExercisePage from '@/pages/ExercisePage'
import { Button } from '@/components/ui/button'
import useStudySession from '@/study/session/useStudySession'
import { STEP_KINDS } from '@/study/session/sessionPlan'
import { configurationSettings, HOLISTIC_TASK_CAP_MS, RENDER_MODES } from '@/study/session/holistic'

// /study/task: one holistic authoring condition (Phases 2 and 3), run in the
// real exercise page. The participant works until the checker passes or the
// cap runs out. See docs/architecture/study-session.md#holistic-tasks.

const formatClock = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export default function StudyTaskPage() {
  const { study, cursor, step, start, complete } = useStudySession()
  const navigate = useNavigate()
  const isTask = step?.kind === STEP_KINDS.HOLISTIC
  const stepIndex = isTask ? step.stepIndex : null

  useEffect(() => {
    if (stepIndex != null) start(stepIndex)
  }, [stepIndex, start])

  // Wall clock, not performance.now(): the start time has to survive a reload.
  const startedAt = (stepIndex != null && cursor.startedAt?.[stepIndex]) || null
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const firstPassRef = useRef(null)
  const [hasPassed, setHasPassed] = useState(false)
  const handlePassedChange = useCallback(
    (passed) => {
      if (!passed || firstPassRef.current != null) return
      firstPassRef.current = Date.now() - (startedAt ?? Date.now())
      setHasPassed(true)
    },
    [startedAt],
  )

  const settings = useMemo(
    () => (isTask ? configurationSettings(step.configuration) : null),
    [isTask, step?.configuration],
  )

  if (!isTask) return <Navigate to="/study" replace />

  const elapsed = startedAt ? now - startedAt : 0
  const timeUp = elapsed >= HOLISTIC_TASK_CAP_MS
  const canContinue = hasPassed || timeUp

  const finish = () => {
    complete(stepIndex, {
      exercise_id: step.exerciseId,
      combination: step.number,
      configuration: step.configuration,
      mode: step.mode,
      passed: hasPassed,
      time_to_pass_ms: firstPassRef.current,
      elapsed_ms: Date.now() - (startedAt ?? Date.now()),
      timed_out: !hasPassed && timeUp,
    })
    navigate('/study')
  }

  const footer = (
    <div className="flex flex-col gap-2 border-t pt-3">
      <p className="text-sm text-muted-foreground">
        {hasPassed
          ? 'Solved. Continue when you are ready.'
          : timeUp
            ? 'Time is up for this task.'
            : `Time left: ${formatClock(HOLISTIC_TASK_CAP_MS - elapsed)}`}
      </p>
      <Button className="h-10 text-base" disabled={!canContinue} onClick={finish}>
        Continue
      </Button>
      {import.meta.env.DEV && (
        <button type="button" className="text-left text-xs underline" onClick={finish}>
          Skip task (dev)
        </button>
      )}
    </div>
  )

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <ExercisePage
        key={step.stepIndex}
        study={{
          exerciseId: step.exerciseId,
          settings,
          animated: step.mode === RENDER_MODES.ANIMATED,
          workspaceId: `study-${study.researchId}-${step.exerciseId}`,
          onPassedChange: handlePassedChange,
          footer,
        }}
      />
    </div>
  )
}
