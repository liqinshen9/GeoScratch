import { getTechnique, CUE_SETTING_KEYS, STUDY_PINNED_SETTINGS } from '@/study/phase1/conditions'
import { LABEL_DETAIL_LEVELS } from '@/store/namingConfig'

// Phases 2 and 3 (dissertation Method, "Holistic Authoring Tasks" and
// "Counterbalancing"). See docs/architecture/study-session.md#holistic-order.

export const HOLISTIC_TASK_CAP_MS = 6 * 60 * 1000

export const RENDER_MODES = Object.freeze({ STATIC: 'static', ANIMATED: 'animated' })
export const CONFIGURATIONS = Object.freeze({ BASELINE: 'baseline', PERCEPTION: 'perception' })

/**
 * The four holistic conditions. `number` is the value sent to Qualtrics as
 * `combinationNum`, so it must never be renumbered once data collection starts.
 */
export const COMBINATIONS = Object.freeze([
  { number: 1, configuration: CONFIGURATIONS.BASELINE, mode: RENDER_MODES.STATIC },
  { number: 2, configuration: CONFIGURATIONS.PERCEPTION, mode: RENDER_MODES.STATIC },
  { number: 3, configuration: CONFIGURATIONS.BASELINE, mode: RENDER_MODES.ANIMATED },
  { number: 4, configuration: CONFIGURATIONS.PERCEPTION, mode: RENDER_MODES.ANIMATED },
])

/** Two transform problems, then two derivation problems (exercise ids). */
export const HOLISTIC_TASKS = Object.freeze([
  'scale-object',
  'transform-object',
  'point-plane-distance',
  'sphere-distance',
])

function cueSettings(techniqueId) {
  const { settings } = getTechnique(techniqueId)
  return Object.fromEntries(CUE_SETTING_KEYS.map((key) => [key, settings[key]]))
}

/**
 * Baseline matches T1 and perception-driven matches T10, on the cue keys only:
 * the rest of the editor keeps the participant's normal settings, since this is
 * authoring rather than a controlled probe, except `STUDY_PINNED_SETTINGS`.
 * Perception-driven also raises label detail.
 */
export function configurationSettings(configuration) {
  if (configuration === CONFIGURATIONS.PERCEPTION) {
    return {
      ...cueSettings('T10'),
      ...STUDY_PINNED_SETTINGS,
      labelDetail: LABEL_DETAIL_LEVELS.NAME_AND_VALUE,
    }
  }
  return {
    ...cueSettings('T1'),
    ...STUDY_PINNED_SETTINGS,
    labelDetail: LABEL_DETAIL_LEVELS.NAME_ONLY,
  }
}

/**
 * The holistic order for a counterbalancing slot. Slot bits pick which mode
 * comes first and which configuration comes first within each mode; the task
 * Latin square row advances once per four slots as well as per slot, so the
 * two are crossed rather than locked together (slots 1-16 cover all 16 pairs).
 *
 * @param {number} slot  1-based
 */
export function resolveHolisticOrder(slot) {
  const s = slot - 1
  const group = s % 4
  const animatedFirst = group >= 2
  const perceptionFirst = group % 2 === 1
  const taskRow = (s + Math.floor(s / 4)) % 4

  const modes = animatedFirst
    ? [RENDER_MODES.ANIMATED, RENDER_MODES.STATIC]
    : [RENDER_MODES.STATIC, RENDER_MODES.ANIMATED]
  const configurations = perceptionFirst
    ? [CONFIGURATIONS.PERCEPTION, CONFIGURATIONS.BASELINE]
    : [CONFIGURATIONS.BASELINE, CONFIGURATIONS.PERCEPTION]

  const conditions = modes.flatMap((mode) =>
    configurations.map((configuration) => {
      const combination = COMBINATIONS.find(
        (c) => c.mode === mode && c.configuration === configuration,
      )
      const exerciseId = HOLISTIC_TASKS[(combination.number - 1 + taskRow) % 4]
      return { ...combination, exerciseId }
    }),
  )

  return { group, taskRow, conditions }
}
