// Exercise metadata only -- title/difficulty for each exercise plus the
// unit/section hierarchy that browsing and the prev/next controls walk.
//
// Each exercise's instructions, given values, starter blocks and pass/fail
// checking live in its own module under src/exercises/, keyed by the same
// string `id`. They are deliberately NOT expressed as data here: the seven
// verification strategies are genuinely heterogeneous, and forcing them into a
// generic checker schema would obscure them rather than clarify them.
//
// Adding an exercise means adding an entry here (and its id to a UNITS section)
// AND a module in src/exercises/ (registered in its index.js). The test in
// src/exercises/exercises.test.js fails if the lists drift apart.

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

export const EXERCISES = Object.freeze([
  {
    id: 'scale-object',
    title: 'Scale this object by 3',
    difficulty: DIFFICULTIES.EASY,
  },
  {
    id: 'rotate-object',
    title: 'Rotate this object',
    difficulty: DIFFICULTIES.EASY,
  },
  {
    id: 'transform-object',
    title: 'Transform this object',
    difficulty: DIFFICULTIES.MEDIUM,
  },
  {
    id: 'translate-object',
    title: 'Translate this object',
    difficulty: DIFFICULTIES.EASY,
  },
  {
    id: 'point-plane-distance',
    title: 'Calculate distance from point P to a plane',
    difficulty: DIFFICULTIES.MEDIUM,
  },
  {
    id: 'skew-lines-distance',
    title: 'Calculate the shortest distance between two skew lines',
    difficulty: DIFFICULTIES.HARD,
  },
  {
    id: 'sphere-distance',
    title: 'Calculate the distance between two spheres',
    difficulty: DIFFICULTIES.MEDIUM,
  },
  {
    id: 'closer-object',
    title: 'Which object is closer to the camera?',
    difficulty: DIFFICULTIES.EASY,
  },
  {
    id: 'line-in-front',
    title: 'Which line is in front?',
    difficulty: DIFFICULTIES.EASY,
  },
])

// The browsing hierarchy. Units render in this order; within a unit, sections
// render in order; within a section, exercises render in `exerciseIds` order.
// This traversal is also the canonical prev/next sequence (orderedExercises).
// Every EXERCISES id must appear in exactly one section.
export const UNITS = Object.freeze([
  {
    id: 'transformations',
    title: 'Transformations',
    description: 'Move, turn and resize objects with transform blocks and pipelines.',
    sections: [
      {
        id: 'single-transforms',
        title: 'Single transforms',
        exerciseIds: ['scale-object', 'rotate-object', 'translate-object'],
      },
      {
        id: 'combined-transforms',
        title: 'Combining transforms',
        exerciseIds: ['transform-object'],
      },
    ],
  },
  {
    id: 'distances-projections',
    title: 'Distances & Projections',
    description: 'Measure distances between points, lines, planes and spheres.',
    sections: [
      {
        id: 'points-and-planes',
        title: 'Points and planes',
        exerciseIds: ['point-plane-distance'],
      },
      {
        id: 'lines-and-spheres',
        title: 'Lines and spheres',
        exerciseIds: ['skew-lines-distance', 'sphere-distance'],
      },
    ],
  },
  {
    id: 'perception',
    title: 'Perception',
    description: 'Read depth and occlusion cues in the 3D scene.',
    sections: [
      {
        id: 'depth-cues',
        title: 'Depth cues',
        exerciseIds: ['closer-object', 'line-in-front'],
      },
    ],
  },
])

export function getExercise(id) {
  return EXERCISES.find((exercise) => exercise.id === id)
}

export function getUnit(unitId) {
  return UNITS.find((unit) => unit.id === unitId)
}

/** Every exercise, flattened in unit -> section -> exerciseIds order. */
export function orderedExercises() {
  return UNITS.flatMap((unit) =>
    unit.sections.flatMap((section) =>
      section.exerciseIds.map((id) => getExercise(id)).filter(Boolean),
    ),
  )
}

/** The exercises immediately before and after `id` in orderedExercises(). */
export function getAdjacentExercises(id) {
  const ordered = orderedExercises()
  const index = ordered.findIndex((exercise) => exercise.id === id)
  return {
    previous: index > 0 ? ordered[index - 1] : null,
    next: index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null,
  }
}

/** The unit whose sections contain `id`. */
export function getUnitForExercise(id) {
  return UNITS.find((unit) =>
    unit.sections.some((section) => section.exerciseIds.includes(id)),
  )
}

/** Number of exercises across all of a unit's sections. */
export function countExercises(unit) {
  return unit.sections.reduce((total, section) => total + section.exerciseIds.length, 0)
}
