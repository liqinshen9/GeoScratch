import { DEFAULT_CAMERA_POSITION } from '@/components/Scene3D/sceneConstants'

// Every tunable number in the Phase 1 procedure lives here.
// See docs/architecture/study-phase1.md.

/** Bump the suffix to generate a new fixed stimulus set; never reuse one mid-study. */
export const STUDY_STIMULUS_SEED = 'geoscratch-phase1-v1'

/** The scene viewport is this exact CSS size for every trial and participant. */
export const VIEWPORT = Object.freeze({ width: 960, height: 640 })

/** Must match Scene3D's Canvas camera, which starts here looking at the origin. */
export const CAMERA = Object.freeze({
  position: DEFAULT_CAMERA_POSITION,
  target: [0, 0, 0],
  fov: 45,
})

/**
 * Camera-space depth gap between the two targets where they meet on screen,
 * in world units. PLACEHOLDERS pending the pilot: T1 must stay off floor at
 * easy, T10 off ceiling at hard.
 */
export const DEPTH_SEPARATIONS = Object.freeze({ easy: 6, medium: 3, hard: 1.2 })
export const DIFFICULTY_LEVELS = Object.freeze(['easy', 'medium', 'hard'])

export const CLUTTER_DISTRACTORS = Object.freeze({ low: 2, high: 8 })
export const CLUTTER_LEVELS = Object.freeze(['low', 'high'])

export const PAIR_TYPES = Object.freeze(['line-line', 'line-point'])

/**
 * Measured stimuli per clutter level, by difficulty. 8 does not split evenly
 * into 3, so the level that gets 2 rotates between the clutter levels.
 */
export const MEASURED_DIFFICULTY_COUNTS = Object.freeze({
  low: { easy: 3, medium: 3, hard: 2 },
  high: { easy: 2, medium: 3, hard: 3 },
})

export const PRACTICE_TRIALS_PER_BLOCK = 4

export const FIXATION_MS = 500
export const FEEDBACK_MS = 900

/** Geometry bounds (world units / NDC) for procedural placement. */
export const PLACEMENT = Object.freeze({
  crossingNdc: { x: 0.35, y: 0.3 },
  depthJitter: 6,
  maxCoordinate: 17,
  distractorRadiusNdc: 0.28,
  distractorDepthJitter: 10,
  clearOfCrossingNdc: 0.05,
  solidOnTargetMinNdc: 0.16,
  solidOnTargetMaxNdc: 0.3,
  lineDepthTilt: 0.35,
  minCrossingAngleDeg: 40,
  // Targets never touch in 3D: genuinely touching lines are immune to each
  // other's halo, which would silently remove the T5/T10 cue.
  minSeparation3d: 0.5,
  // A line's label sits at its box-clipped midpoint; these keep it readable
  // as belonging to that line.
  labelOnScreenNdc: { x: 0.85, y: 0.8 },
  labelClearOfCrossingNdc: 0.18,
  labelClearOfOtherTargetNdc: 0.1,
  clearOfTargetLabelNdc: 0.06,
})
