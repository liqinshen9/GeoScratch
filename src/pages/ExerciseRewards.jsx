import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Rocket, X } from 'lucide-react'
import { getSolvedExerciseIds, markExerciseSolved } from '@/utils/exerciseProgress'

export default function ExerciseRewards({ unit, activeExercise, passed }) {
  const [solved, setSolved] = useState(getSolvedExerciseIds)
  const [celebration, setCelebration] = useState(false)
  const celebrated = useRef(false)
  const ids = unit.sections.flatMap((section) => section.exerciseIds)
  const completed = ids.filter((id) => solved.has(id)).length

  useEffect(() => {
    if (!passed || celebrated.current) return
    celebrated.current = true
    const next = new Set(getSolvedExerciseIds())
    const firstPass = !next.has(activeExercise)
    next.add(activeExercise)
    markExerciseSolved(activeExercise)
    setSolved(next)
    if (firstPass) setCelebration(true)
  }, [passed, activeExercise])

  useEffect(() => {
    if (!celebration) return
    const timer = window.setTimeout(() => setCelebration(false), 3800)
    return () => window.clearTimeout(timer)
  }, [celebration])

  useEffect(() => {
    const sync = () => setSolved(getSolvedExerciseIds())
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  return (
    <>
      <section className="exercise-journey" aria-label="Learning progress">
        <div className="exercise-journey__summary">
          <strong>
            {completed} / {ids.length}
          </strong>
          <span>completed</span>
        </div>
        <div className="exercise-journey__meter">
          <progress aria-label={`${unit.title} progress`} value={completed} max={ids.length} />
        </div>
      </section>
      {celebration &&
        createPortal(
          <div className="exercise-victory" role="status" aria-live="polite">
            <div className="exercise-victory__wash" />
            <div className="exercise-victory__flight" aria-hidden="true">
              <Rocket />
            </div>
            <div className="exercise-victory__message">
              <strong>Correct.<br />Well done!</strong>
            </div>
            <button
              type="button"
              className="exercise-victory__close"
              onClick={() => setCelebration(false)}
              aria-label="Dismiss celebration"
              title="Dismiss celebration"
            >
              <X size={22} />
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}
