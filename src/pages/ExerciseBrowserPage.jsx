import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, LockKeyhole } from 'lucide-react'
import { UNITS, exercisesInUnit, DIFFICULTY_LABELS } from '@/data/exercises'
import { getSolvedExerciseIds, isExerciseUnlocked } from '@/utils/exerciseProgress'
import './ExerciseBrowserPage.css'

function UnitCards({ solved }) {
  return (
    <nav className="unit-cards" aria-label="Exercise units">
      {UNITS.map((unit) => {
        const exercises = exercisesInUnit(unit)
        const done = exercises.filter((exercise) => solved.has(exercise.id)).length
        const unitComplete = done === exercises.length
        return (
          <article key={unit.id} className={`unit-choice${unitComplete ? ' unit-choice--complete' : ''}`}>
            <header className="unit-choice__header">
              <span className="unit-choice__meta">
                {exercises.length} challenges
              </span>
              <h2>{unit.title}</h2>
              {unitComplete && <div className="unit-choice__completed-banner">Unit completed</div>}
            </header>
            <div className="unit-choice__body">
              <p className="unit-choice__description">{unit.description}</p>
              <progress
                aria-label={`${unit.title} completion`}
                value={done}
                max={exercises.length}
              />
              <div className="unit-choice__footer">
                <span>
                  {done} / {exercises.length} complete
                </span>
              </div>
              <ol className="unit-choice__challenges">
                {exercises.map((exercise, number) => {
                  const unlocked = isExerciseUnlocked(exercise.id, solved)
                  const complete = solved.has(exercise.id)
                  const content = (
                    <>
                      <span className={`challenge-number${complete ? ' is-complete' : ''}`}>
                        {complete ? <Check size={16} aria-label="Completed" /> : number + 1}
                      </span>
                      <span className="challenge-copy">
                        <span className="challenge-title-row">
                          <strong>{exercise.title}</strong>
                          <span className={`challenge-difficulty challenge-difficulty--${exercise.difficulty}`}>
                            {DIFFICULTY_LABELS[exercise.difficulty]}
                          </span>
                        </span>
                        {!complete && <small>{unlocked ? 'Ready to start' : 'Complete earlier challenges to unlock'}</small>}
                      </span>
                      {unlocked ? <ArrowRight size={18} /> : <LockKeyhole size={18} />}
                    </>
                  )
                  return (
                    <li key={exercise.id}>
                      {unlocked ? (
                        <Link className="challenge-row" to={`/exercise/${exercise.id}`}>
                          {content}
                        </Link>
                      ) : (
                        <div className="challenge-row is-locked" aria-disabled="true">
                          {content}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            </div>
          </article>
        )
      })}
    </nav>
  )
}

export default function ExerciseBrowserPage() {
  const [solved, setSolved] = useState(getSolvedExerciseIds)
  useEffect(() => {
    const refresh = () => setSolved(getSolvedExerciseIds())
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])
  return (
    <main className="exercise-browser">
      <div className="exercise-browser__content">
        <h1 className="exercise-browser__title">Exercises <span>({UNITS.length} units)</span></h1>
        <UnitCards solved={solved} />
      </div>
    </main>
  )
}
