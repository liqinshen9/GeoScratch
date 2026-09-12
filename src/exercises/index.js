import exercise01 from './exercise01-scale'
import exercise02 from './exercise02-rotate'
import exercise03 from './exercise03-transform'
import exercise04 from './exercise04-translate'
import exercise05 from './exercise05-pointPlane'
import exercise06 from './exercise06-skewLines'
import exercise07 from './exercise07-spheres'
import exercise08 from './exercise08-closerObject'
import exercise09 from './exercise09-lineInFront'

/**
 * One module per exercise, keyed by the slug id in its URL (/exercise/:id) and
 * in data/exercises.js.
 *
 * Each module default-exports:
 *
 *   id        Matches its key here and its entry in data/exercises.js.
 *   kind      'transform' / 'distance' picks the answer card; 'perceptual' is a
 *             look-and-answer question -- the scene is prefilled by seedWorkspace
 *             and the choices come from the `mcq` descriptor (see exercise08/09).
 *   Givens    Component: the "Given values" panel (or a question + its choices).
 *   Steps     Component: ({ steps, passed }) => the numbered task list.
 *   evaluate  ({ objects, workspace }) => { passed, incorrect, steps, answer, target? }
 *
 * and optionally:
 *
 *   mcq                              { prompt, choices: [{id, label}], correctId }
 *                                     for a 'perceptual' exercise. ExercisePage
 *                                     renders it via shared/PerceptualQuestion
 *                                     and logs the pick to exercise_attempts.
 *   solutionXml                       Blockly XML for a worked solution, offered
 *                                     behind ExercisePage's dev-only "Fill
 *                                     solution" control. Gated on
 *                                     import.meta.env.DEV, so it is compiled out
 *                                     of a study build rather than merely
 *                                     hidden from participants. Omitted by the
 *                                     perceptual exercises, which have nothing
 *                                     to build. The four transform exercises
 *                                     share one shape via
 *                                     shared/fillSolution.js's
 *                                     teapotPipelineSolution().
 *   seedWorkspace(workspace)          Drops starter/decorative blocks in on entry.
 *   decorateObjects(objects, ws)      Adds exercise-only scene objects before render.
 *   reusableBlockTemplate             Offered as a saveable "My Block" once passed.
 *   settingsOverrides                 { <settingKey>: value } forced while this
 *                                     exercise is open; the matching Settings
 *                                     controls render as locked. Keys must be
 *                                     valid useSettingsStore setting keys.
 *                                     Reverted when the student leaves. Locking
 *                                     `showAxes` also needs
 *                                     `showAxisToggleButton: false` (the in-scene
 *                                     axis button writes `showAxes` directly).
 *
 * The checks themselves are deliberately NOT forced into a shared schema: the
 * seven exercises verify genuinely different things, and a generic checker
 * format would obscure each one rather than clarify it. What is shared lives in
 * ./shared instead.
 */
export const EXERCISE_MODULES = {
  'scale-object': exercise01,
  'rotate-object': exercise02,
  'transform-object': exercise03,
  'translate-object': exercise04,
  'point-plane-distance': exercise05,
  'skew-lines-distance': exercise06,
  'sphere-distance': exercise07,
  'closer-object': exercise08,
  'line-in-front': exercise09,
}

export const FALLBACK_EXERCISE_ID = 'scale-object'

/** The module for an exercise id, falling back to the first exercise. */
export function getExerciseModule(id) {
  return EXERCISE_MODULES[id] || EXERCISE_MODULES[FALLBACK_EXERCISE_ID]
}
