// Exercise metadata only -- title/category/difficulty for navigation and
// browsing. The actual per-exercise instructions, given values, starter
// blocks, and pass/fail verification logic all still live in
// ExercisePage.jsx (keyed by `number`); extracting those into data here too
// would mean re-deriving a generic checker schema for ~7 hand-written,
// heterogeneous verification strategies, which is a much bigger, separate
// undertaking than "browse and navigate between exercises".

export const DIFFICULTIES = Object.freeze({
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
})

export const DIFFICULTY_LABELS = Object.freeze({
  [DIFFICULTIES.EASY]: 'Easy',
  [DIFFICULTIES.MEDIUM]: 'Medium',
  [DIFFICULTIES.HARD]: 'Hard',
})

// Rendered in this order wherever exercises are grouped by category.
export const CATEGORIES = Object.freeze(['Transformations', 'Distances & Projections'])

export const EXERCISES = Object.freeze([
  {
    number: 1,
    title: 'Scale this object by 3',
    category: 'Transformations',
    difficulty: DIFFICULTIES.EASY,
  },
  {
    number: 2,
    title: 'Rotate this object',
    category: 'Transformations',
    difficulty: DIFFICULTIES.EASY,
  },
  {
    number: 3,
    title: 'Transform this object',
    category: 'Transformations',
    difficulty: DIFFICULTIES.MEDIUM,
  },
  {
    number: 4,
    title: 'Translate this object',
    category: 'Transformations',
    difficulty: DIFFICULTIES.EASY,
  },
  {
    number: 5,
    title: 'Calculate distance from point P to a plane',
    category: 'Distances & Projections',
    difficulty: DIFFICULTIES.MEDIUM,
  },
  {
    number: 6,
    title: 'Calculate the shortest distance between two skew lines',
    category: 'Distances & Projections',
    difficulty: DIFFICULTIES.HARD,
  },
  {
    number: 7,
    title: 'Calculate the distance between two spheres',
    category: 'Distances & Projections',
    difficulty: DIFFICULTIES.MEDIUM,
  },
])

export function getExercise(number) {
  return EXERCISES.find((exercise) => exercise.number === Number(number))
}

export function groupExercisesByCategory() {
  return CATEGORIES.map((category) => ({
    category,
    exercises: EXERCISES.filter((exercise) => exercise.category === category),
  })).filter((group) => group.exercises.length > 0)
}
