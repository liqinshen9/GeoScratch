// Every tunable number in the identification task lives here.
// See docs/architecture/study-session.md#identification-task.

/** Bump the suffix to generate a new fixed scene set; never reuse one mid-study. */
export const IDENTIFICATION_SEED = 'geoscratch-identify-v2'

/**
 * The 2 x 2 of cues. `id` is logged. Name-only labels, because a label here is
 * a cue for matching the block to its object, not a readout of its values.
 */
export const IDENTIFICATION_CELLS = Object.freeze([
  { id: 'none', highlight: false, labels: false },
  { id: 'labels', highlight: false, labels: true },
  { id: 'highlight', highlight: true, labels: false },
  { id: 'both', highlight: true, labels: true },
])

export const MEASURED_TRIALS_PER_CELL = 8
export const PRACTICE_TRIALS_PER_BLOCK = 2

/**
 * One object type per scene. With per-instance colour variation pinned off,
 * every object of a type is the same colour, and a block takes its object's
 * colour, so a mixed scene would give the answer away by type or colour.
 *
 * No points: a few pixels across at the study camera, and a floating dot has
 * no size or perspective to place it in depth, so with no cue a point scene
 * came down to projecting coordinates in your head, and to click precision.
 */
export const SCENE_KINDS = Object.freeze(['sphere', 'cube'])
export const OBJECTS_PER_SCENE = 5

/** Whole numbers, so a participant can read a block's values off it. */
export const PLACEMENT = Object.freeze({
  coordinateRange: { min: -9, max: 9 },
  heightRange: { min: 0, max: 7 },
  sphereRadii: [1, 1.5, 2],
  cubeSizes: [2, 2.5, 3],
  // Every object whole and apart on screen, clear of the viewport edges.
  maxNdc: 0.78,
  minSeparationNdc: 0.12,
  maxAttempts: 4000,
})

export const FIXATION_MS = 500
export const FEEDBACK_MS = 900

/**
 * Smaller than Phase 1's scene, to leave room for readable blocks beside it,
 * but the same 3:2 shape, so the study camera frames it identically.
 */
export const IDENTIFY_VIEWPORT = Object.freeze({ width: 840, height: 560 })

/** The read-only workspace beside the scene. */
export const WORKSPACE_WIDTH = 520
