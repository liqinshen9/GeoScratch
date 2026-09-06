import { useNavigate } from 'react-router-dom'
import { groupExercisesByCategory, DIFFICULTY_LABELS } from '@/data/exercises'
import './ExerciseBrowserPage.css'

function DifficultyBadge({ difficulty }) {
  return (
    <span className={`exercise-browser-difficulty exercise-browser-difficulty--${difficulty}`}>
      {DIFFICULTY_LABELS[difficulty] ?? difficulty}
    </span>
  )
}

export default function ExerciseBrowserPage() {
  const navigate = useNavigate()
  const groups = groupExercisesByCategory()

  return (
    <div className="exercise-browser-page">
      <div className="exercise-browser-page__header">
        <h1>Exercises</h1>
        <p>Pick an exercise to jump straight in, grouped by topic and difficulty.</p>
      </div>

      <div className="exercise-browser-page__groups">
        {groups.map(({ category, exercises }) => (
          <section key={category} className="exercise-browser-group">
            <h2>{category}</h2>
            <div className="exercise-browser-group__cards">
              {exercises.map((exercise) => (
                <button
                  key={exercise.number}
                  type="button"
                  className="exercise-browser-card"
                  onClick={() => navigate(`/exercise/${exercise.number}`)}
                >
                  <span className="exercise-browser-card__number">{exercise.number}</span>
                  <span className="exercise-browser-card__body">
                    <span className="exercise-browser-card__title">{exercise.title}</span>
                    <DifficultyBadge difficulty={exercise.difficulty} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
