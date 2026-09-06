// Exercise metadata only -- title/category/difficulty for navigation and
// browsing, used by ExerciseBrowserPage and for the prev/next controls.
//
// Each exercise's instructions, given values, starter blocks and pass/fail
// checking live in its own module under src/exercises/, keyed by the same
// `number`. They are deliberately NOT expressed as data here: the seven
// verification strategies are genuinely heterogeneous, and forcing them into a
// generic checker schema would obscure them rather than clarify them.
//
// Adding an exercise means adding an entry here AND a module in src/exercises/
// (registered in its index.js). The test in src/exercises/exercises.test.js
// fails if the two lists drift apart.

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
