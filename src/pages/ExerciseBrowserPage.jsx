import { useNavigate } from 'react-router-dom'
import { UNITS, countExercises } from '@/data/exercises'
import './ExerciseBrowserPage.css'

export default function ExerciseBrowserPage() {
  const navigate = useNavigate()

  return (
    <div className="exercise-browser-page">
      <div className="exercise-browser-page__header">
        <h1>Exercises</h1>
        <p>Pick a unit to work through its exercises.</p>
      </div>

      <div className="exercise-browser-page__units">
        {UNITS.map((unit) => {
          const count = countExercises(unit)
          return (
            <button
              key={unit.id}
              type="button"
              className="exercise-browser-unit-card"
              onClick={() => navigate(`/exercises/${unit.id}`)}
            >
              <span className="exercise-browser-unit-card__title">{unit.title}</span>
              <span className="exercise-browser-unit-card__description">{unit.description}</span>
              <span className="exercise-browser-unit-card__count">
                {count} {count === 1 ? 'exercise' : 'exercises'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
