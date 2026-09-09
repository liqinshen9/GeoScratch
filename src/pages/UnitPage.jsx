import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { getExercise, getUnit, DIFFICULTY_LABELS } from '@/data/exercises'
import './ExerciseBrowserPage.css'

function DifficultyBadge({ difficulty }) {
  return (
    <span className={`exercise-browser-difficulty exercise-browser-difficulty--${difficulty}`}>
      {DIFFICULTY_LABELS[difficulty] ?? difficulty}
    </span>
  )
}

export default function UnitPage() {
  const { unitId } = useParams()
  const navigate = useNavigate()
  const unit = getUnit(unitId)

  if (!unit) return <Navigate to="/exercises" replace />

  return (
    <div className="exercise-browser-page">
      <div className="exercise-browser-page__header">
        <Link to="/exercises" className="exercise-browser-back">
          &larr; All units
        </Link>
        <h1>{unit.title}</h1>
        <p>{unit.description}</p>
      </div>

      <div className="exercise-browser-page__groups">
        {unit.sections.map((section) => (
          <section key={section.id} className="exercise-browser-group">
            <h2>{section.title}</h2>
            <div className="exercise-browser-group__cards">
              {section.exerciseIds.map((id) => {
                const exercise = getExercise(id)
                if (!exercise) return null
                return (
                  <button
                    key={exercise.id}
                    type="button"
                    className="exercise-browser-card"
                    onClick={() => navigate(`/exercise/${exercise.id}`)}
                  >
                    <span className="exercise-browser-card__body">
                      <span className="exercise-browser-card__title">{exercise.title}</span>
                      <DifficultyBadge difficulty={exercise.difficulty} />
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
