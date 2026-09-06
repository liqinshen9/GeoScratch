import exercise01 from './exercise01-scale'
import exercise02 from './exercise02-rotate'
import exercise03 from './exercise03-transform'
import exercise04 from './exercise04-translate'
import exercise05 from './exercise05-pointPlane'
import exercise06 from './exercise06-skewLines'
import exercise07 from './exercise07-spheres'

/**
 * One module per exercise, keyed by the number in its URL (/exercise/:n) and in
 * data/exercises.js.
 *
 * Each module default-exports:
 *
 *   number    Matches its key here and its entry in data/exercises.js.
 *   kind      'transform' or 'distance' -- picks which answer card the page shows.
 *   Givens    Component: the "Given values" panel.
 *   Steps     Component: ({ steps, passed }) => the numbered task list.
 *   evaluate  ({ objects, workspace }) => { passed, incorrect, steps, answer, target? }
 *
 * and optionally:
 *
 *   seedWorkspace(workspace)          Drops starter/decorative blocks in on entry.
 *   decorateObjects(objects, ws)      Adds exercise-only scene objects before render.
 *   reusableBlockTemplate             Offered as a saveable "My Block" once passed.
 *
 * The checks themselves are deliberately NOT forced into a shared schema: the
 * seven exercises verify genuinely different things, and a generic checker
 * format would obscure each one rather than clarify it. What is shared lives in
 * ./shared instead.
 */
export const EXERCISE_MODULES = {
  1: exercise01,
  2: exercise02,
  3: exercise03,
  4: exercise04,
  5: exercise05,
  6: exercise06,
  7: exercise07,
}

/** The module for an exercise number, falling back to the first exercise. */
export function getExerciseModule(number) {
  return EXERCISE_MODULES[Number(number)] || EXERCISE_MODULES[1]
}
