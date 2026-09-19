// Every tunable number in the Phase 1 procedure lives here.
// See docs/architecture/study-phase1.md.

/** Bump the suffix to generate a new fixed stimulus set; never reuse one mid-study. */
export const STUDY_STIMULUS_SEED = 'geoscratch-phase1-v4'

/** The scene viewport is this exact CSS size for every trial and participant. */
export const VIEWPORT = Object.freeze({ width: 960, height: 640 })

/**
 * The trial camera: the app's isometric viewing direction (see
 * `sceneConstants.js`), at a closer distance than the editor's, because a
 * participant cannot zoom and the scene has to read at one fixed distance.
 * Passed to Scene3D as `cameraPosition`, and used to place and grade every
 * stimulus, so the two can never drift apart.
 */
export const CAMERA = Object.freeze({
  position: [22.59, 22.59, 22.59],
  target: [0, 0, 0],
  fov: 45,
})

/**
 * The two questions a trial can ask.
 *
 * - `occlusion`: the targets cross on screen and one is drawn over the other.
 *   "Which is in front" is only well posed where they overlap, hence the wording.
 * - `proximity`: the targets are apart on screen and the question names a
 *   vertical band. An infinite line has no single depth, so a proximity
 *   question without a named region has no answer.
 */
export const QUESTION_TYPES = Object.freeze(['occlusion', 'proximity'])

/** Where a proximity question's band sits, in NDC x. */
export const PROBE_BANDS = Object.freeze([
  { id: 'left', x: -0.46 },
  { id: 'middle', x: 0 },
  { id: 'right', x: 0.46 },
])

/**
 * Camera-space depth gap between the two targets at the judged point, in world
 * units. PLACEHOLDERS pending the pilot: T1 must stay off floor at easy, T10
 * off ceiling at hard.
 */
export const DEPTH_SEPARATIONS = Object.freeze({ easy: 6, medium: 3, hard: 1.2 })
export const DIFFICULTY_LEVELS = Object.freeze(['easy', 'medium', 'hard'])

export const CLUTTER_DISTRACTORS = Object.freeze({ low: 2, high: 8 })
export const CLUTTER_LEVELS = Object.freeze(['low', 'high'])

/**
 * Target pairings. A sphere is a solid with a transparent surface, so "which
 * one occludes the other" is not well posed for it; sphere pairs are asked as
 * proximity questions only. See docs/architecture/study-phase1.md#stimuli.
 */
export const PAIR_TYPES = Object.freeze([
  'line-line',
  'line-point',
  'line-sphere',
  'vector-line',
  'vector-vector',
  'vector-sphere',
])

export const OCCLUSION_PAIR_TYPES = Object.freeze([
  'line-line',
  'line-point',
  'vector-line',
  'vector-vector',
])

export const PAIR_KINDS = Object.freeze({
  'line-line': ['line', 'line'],
  'line-point': ['line', 'point'],
  'line-sphere': ['line', 'sphere'],
  'vector-line': ['vector', 'line'],
  'vector-vector': ['vector', 'vector'],
  'vector-sphere': ['vector', 'sphere'],
})

/** Measured stimuli per clutter level, by difficulty: 12 each, 24 in total. */
export const MEASURED_DIFFICULTY_COUNTS = Object.freeze({
  low: { easy: 4, medium: 4, hard: 4 },
  high: { easy: 4, medium: 4, hard: 4 },
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
  // Solids never overlap each other on screen: an overlapping pair composites
  // by draw order rather than depth. See render-order.md#solid-depthwrite.
  solidClearOfSolidNdc: 0.02,
  lineDepthTilt: 0.35,
  minCrossingAngleDeg: 40,
  // Solids read at a fixed camera distance with no zoom, so they are drawn
  // larger here than a hand-built scene would place them.
  cubeSize: { min: 2.5, max: 4.3 },
  sphereRadius: { min: 1.25, max: 2.15 },
  targetSphereRadius: { min: 1.6, max: 2.4 },
  vectorLength: { min: 7, max: 12 },
  // Where along its own shaft a vector meets the judged point.
  vectorAnchorFraction: { min: 0.3, max: 0.7 },
  // Targets never touch in 3D: genuinely touching lines are immune to each
  // other's halo, which would silently remove the T5/T10 cue.
  minSeparation3d: 0.5,
  // Proximity questions: half-width of the judged band, how far apart the two
  // targets must stay inside it, and how flat a line has to lie so that it
  // has one depth per screen column there.
  probeBandHalfWidthNdc: 0.1,
  probeBandXJitterNdc: 0.05,
  proximityYLimitNdc: 0.56,
  proximityGapNdc: { min: 0.36, max: 0.62 },
  minProximityGapNdc: 0.22,
  maxProximityScreenTiltDeg: 30,
  proximityAngleJitterDeg: 8,
  // A line's label sits at its box-clipped midpoint; these keep it readable
  // as belonging to that line.
  labelOnScreenNdc: { x: 0.85, y: 0.8 },
  labelClearOfCrossingNdc: 0.18,
  labelClearOfOtherTargetNdc: 0.1,
  clearOfTargetLabelNdc: 0.06,
})
