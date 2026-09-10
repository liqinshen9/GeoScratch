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
// This traversal is the canonical order; prev/next (getAdjacentExercises) walks
// only the exercises inside the current unit, so each unit is a self-contained
// track. Every EXERCISES id must appear in exactly one section.
export const UNITS = Object.freeze([
  {
    id: 'transformations',
    title: 'Unit 1: Transformations',
    description:
      'Transformations are how you move geometry around a scene: sliding it, turning it, and resizing it. Each one is a matrix you build from a block, and stacking them in a pipeline lets you compose a translation, a rotation and a scale into a single motion. Getting comfortable here sets up everything that follows, because almost every later construction is some object placed by a transform.',
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
    title: 'Unit 2: Distances & Projections',
    description:
      'A distance question is really a projection question: the shortest gap between two shapes lies along the direction perpendicular to both. These exercises work through the standard cases in order of difficulty, from a point and a plane up to two skew lines that never meet. In each one you build the construction that makes the perpendicular explicit, then read the length off it rather than guessing from the picture.',
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
    title: 'Unit 3: Perception',
    description:
      'A 3D scene on a flat screen only looks three-dimensional because of cues your visual system reads automatically: things further away are smaller, nearer things overlap the ones behind them, and shading follows depth. These short exercises make those cues explicit by asking you to judge which object is closer or which line passes in front, then check your answer against the real geometry.',
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

/** A unit's exercises, flattened in section -> exerciseIds order. */
export function exercisesInUnit(unit) {
  return unit.sections.flatMap((section) =>
    section.exerciseIds.map((id) => getExercise(id)).filter(Boolean),
  )
}

/** Every exercise, flattened in unit -> section -> exerciseIds order. */
export function orderedExercises() {
  return UNITS.flatMap(exercisesInUnit)
}

/**
 * The exercises immediately before and after `id` within its own unit. Prev/next
 * deliberately does not cross unit boundaries -- a unit is a self-contained
 * track, and the browser is the way to move between units.
 */
export function getAdjacentExercises(id) {
  const unit = getUnitForExercise(id)
  const ordered = unit ? exercisesInUnit(unit) : []
  const index = ordered.findIndex((exercise) => exercise.id === id)
  return {
    previous: index > 0 ? ordered[index - 1] : null,
    next: index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null,
  }
}

/** The unit whose sections contain `id`. */
export function getUnitForExercise(id) {
  return UNITS.find((unit) => unit.sections.some((section) => section.exerciseIds.includes(id)))
}

/** The `{ unit, section }` an exercise sits in, or undefined if unplaced. */
export function getSectionForExercise(id) {
  for (const unit of UNITS) {
    const section = unit.sections.find((s) => s.exerciseIds.includes(id))
    if (section) return { unit, section }
  }
  return undefined
}

/** Number of exercises across all of a unit's sections. */
export function countExercises(unit) {
  return exercisesInUnit(unit).length
}
