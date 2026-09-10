import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, useParams } from 'react-router-dom'
import { Components, CheckOne } from '@icon-park/react'
import {
  UNITS,
  getUnit,
  getExercise,
  exercisesInUnit,
  countExercises,
  DIFFICULTY_LABELS,
} from '@/data/exercises'
import { getSolvedExerciseIds } from '@/utils/exerciseProgress'
import './ExerciseBrowserPage.css'

/** Solved-exercise ids, refreshed when another tab records a solve. */
function useSolvedExercises() {
  const [solved, setSolved] = useState(getSolvedExerciseIds)
  useEffect(() => {
    const refresh = () => setSolved(getSolvedExerciseIds())
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])
  return solved
}

function UnitRail({ activeUnitId, solved }) {
  return (
    <aside className="unit-page__rail">
      <div className="unit-page__rail-head">
        <span className="unit-page__rail-title">Exercises</span>
        <span className="unit-page__rail-count">{UNITS.length} units</span>
      </div>
      <nav className="unit-page__rail-list">
        {UNITS.map((unit, index) => {
          const complete = exercisesInUnit(unit).every((e) => solved.has(e.id))
          return (
            <NavLink
              key={unit.id}
              to={`/exercises/${unit.id}`}
              className={({ isActive }) =>
                `unit-page__rail-item${
                  isActive || unit.id === activeUnitId ? ' unit-page__rail-item--active' : ''
                }`
              }
            >
              <span className="unit-page__rail-item-label">Unit {index + 1}</span>
              <span className="unit-page__rail-item-name">
                {unit.title}
                {complete && (
                  <CheckOne
                    className="unit-page__rail-item-check"
                    theme="filled"
                    size="14"
                    aria-label="unit complete"
                  />
                )}
              </span>
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}

export default function UnitPage() {
  const { unitId } = useParams()
  const solved = useSolvedExercises()
  const unit = getUnit(unitId)

  if (!unit) return <Navigate to={`/exercises/${UNITS[0].id}`} replace />

  const unitIndex = UNITS.findIndex((u) => u.id === unit.id)
  const total = countExercises(unit)
  const solvedInUnit = exercisesInUnit(unit).filter((e) => solved.has(e.id)).length

  return (
    <div className="unit-page">
      <UnitRail activeUnitId={unit.id} solved={solved} />

      <main className="unit-page__main">
        <p className="unit-page__eyebrow">Unit {unitIndex + 1}</p>
        <h1 className="unit-page__title">{unit.title}</h1>

        <section className="unit-page__card unit-page__about">
          <h2>About this unit</h2>
          <p>{unit.description}</p>
        </section>

        {unit.sections.map((section) => {
          const done = section.exerciseIds.filter((id) => solved.has(id)).length
          return (
            <section key={section.id} className="unit-page__card unit-page__section">
              <h2 className="unit-page__section-title">{section.title}</h2>
              <p className="unit-page__section-label">
                Exercises
                {done > 0 && (
                  <span className="unit-page__section-progress">
                    {' '}
                    · {done}/{section.exerciseIds.length} done
                  </span>
                )}
              </p>
              <ul className="unit-page__links">
                {section.exerciseIds.map((id) => {
                  const exercise = getExercise(id)
                  if (!exercise) return null
                  const isSolved = solved.has(exercise.id)
                  return (
                    <li key={exercise.id}>
                      <Link
                        to={`/exercise/${exercise.id}`}
                        className={`unit-page__link${isSolved ? ' unit-page__link--solved' : ''}`}
                      >
                        {isSolved ? (
                          <CheckOne
                            className="unit-page__link-icon unit-page__link-icon--solved"
                            theme="filled"
                            size="15"
                            aria-label="solved"
                          />
                        ) : (
                          <Components className="unit-page__link-icon" theme="outline" size="15" />
                        )}
                        <span className="unit-page__link-title">{exercise.title}</span>
                        <span
                          className={`unit-page__link-difficulty unit-page__link-difficulty--${exercise.difficulty}`}
                        >
                          {DIFFICULTY_LABELS[exercise.difficulty] ?? exercise.difficulty}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}

        <p className="unit-page__footnote">
          {solvedInUnit > 0
            ? `${solvedInUnit} of ${total} solved in this unit`
            : `${total} ${total === 1 ? 'exercise' : 'exercises'} in this unit`}
        </p>
      </main>
    </div>
  )
}
