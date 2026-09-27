import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import useStudySession from '@/study/session/useStudySession'
import { HOLISTIC_TASK_CAP_MS } from '@/study/session/holistic'

const formatClock = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * The study-mode footer of an exercise's task panel: time left, and Continue
 * once the checker has passed or the cap has run out. Continue completes the
 * session step and goes to /study, which hands off to the questionnaire.
 * See docs/architecture/study-session.md#holistic-tasks.
 */
export default function StudyTaskBar({ task, passed }) {
  const { cursor, start, complete } = useStudySession()
  const navigate = useNavigate()
  const { stepIndex } = task

  useEffect(() => {
    start(stepIndex)
  }, [stepIndex, start])

  // Wall clock, not performance.now(): the start time has to survive a reload.
  const startedAt = cursor.startedAt?.[stepIndex] ?? null
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const firstPassMs = useRef(null)
  const [hasPassed, setHasPassed] = useState(false)
  useEffect(() => {
    if (!passed || firstPassMs.current != null) return
    firstPassMs.current = Date.now() - (startedAt ?? Date.now())
    setHasPassed(true)
  }, [passed, startedAt])

  const elapsed = startedAt ? now - startedAt : 0
  const timeUp = elapsed >= HOLISTIC_TASK_CAP_MS

  const finish = () => {
    complete(stepIndex, {
      exercise_id: task.exerciseId,
      combination: task.number,
      configuration: task.configuration,
      mode: task.mode,
      passed: hasPassed,
      time_to_pass_ms: firstPassMs.current,
      elapsed_ms: Date.now() - (startedAt ?? Date.now()),
      timed_out: !hasPassed && timeUp,
    })
    navigate('/study')
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <p className="text-sm text-muted-foreground">
        {hasPassed
          ? 'Solved. Continue when you are ready.'
          : timeUp
            ? 'Time is up for this task.'
            : `Time left: ${formatClock(HOLISTIC_TASK_CAP_MS - elapsed)}`}
      </p>
      <Button className="h-10 text-base" disabled={!hasPassed && !timeUp} onClick={finish}>
        Continue
      </Button>
      {import.meta.env.DEV && (
        <button type="button" className="text-left text-xs underline" onClick={finish}>
          Skip task (dev)
        </button>
      )}
    </div>
  )
}
