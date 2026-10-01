import {
  DEFAULT_CAMERA_VIEW,
  CAMERA_FOV,
  positionFromOrbit,
} from '@/components/Scene3D/sceneConstants'

// Every tunable number in the Phase 1 procedure lives here.
// See docs/architecture/study-phase1.md.

/** Bump the suffix to generate a new fixed stimulus set; never reuse one mid-study. */
export const STUDY_STIMULUS_SEED = 'geoscratch-phase1-v15'

/**
 * The scene viewport is this exact CSS size for every trial and participant.
 * 860 keeps the room's floor clear past both rounded bottom
 * corners (at 960 the background showed there). Stimuli are placed through this
 * aspect, so a change needs a seed bump.
 */
export const VIEWPORT = Object.freeze({ width: 860, height: 640 })

/**
 * The trial camera: the editor's default viewing angle and field of view (see
 * `sceneConstants.js`), at the study's own distance, because a participant
 * cannot zoom and the scene has to read at one fixed framing. Passed to Scene3D
 * as `cameraPosition`, and used to place and grade every stimulus, so the two
 * can never drift apart. Changing the editor's angle changes this too: bump
 * `STUDY_STIMULUS_SEED` with it.
 */
export const STUDY_CAMERA_DISTANCE = 39
export const CAMERA = Object.freeze({
  position: positionFromOrbit({ ...DEFAULT_CAMERA_VIEW, distance: STUDY_CAMERA_DISTANCE }),
  target: [0, 0, 0],
  fov: CAMERA_FOV,
})

/**
 * The three questions a trial can ask.
 *
 * - `occlusion`: the targets cross on screen and one is drawn over the other.
 *   "Which is in front" is only well posed where they overlap, hence the wording.
 * - `proximity`: the targets are apart on screen and the question names a
 *   vertical band. An infinite line has no single depth, so a proximity
 *   question without a named region has no answer.
 * - `distance`: which of A and B (each a point or a vector's tip) is closer in
 *   3D to a reference point C. The screen distances never give it away, so it
 *   takes depth. See docs/architecture/study-phase1.md#distance-questions.
 */
export const QUESTION_TYPES = Object.freeze(['occlusion', 'proximity', 'distance'])

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

/**
 * Distance questions: the farther target's 3D distance to C over the nearer
 * one's. PLACEHOLDERS pending the pilot, like DEPTH_SEPARATIONS.
 */
export const DISTANCE_RATIOS = Object.freeze({ easy: 1.6, medium: 1.35, hard: 1.15 })
export const DIFFICULTY_LEVELS = Object.freeze(['easy', 'medium', 'hard'])

export const CLUTTER_DISTRACTORS = Object.freeze({ low: 2, high: 8 })
export const CLUTTER_LEVELS = Object.freeze(['low', 'high'])

/**
 * Target pairings (proximity questions). A sphere is a solid with a transparent
 * surface, so "which one occludes the other" is not well posed for it; sphere
 * pairs are asked as proximity questions only. No bare points as targets in any
 * question: a point marker is drawn the same size at any depth, so where a
 * point sits in depth cannot be told, and a trial that hinges on one is a
 * guess. See docs/architecture/study-phase1.md#stimuli.
 */
export const PAIR_TYPES = Object.freeze([
  'line-line',
  'line-sphere',
  'vector-line',
  'vector-vector',
  'vector-sphere',
  'sphere-sphere',
])

export const OCCLUSION_PAIR_TYPES = Object.freeze(['line-line', 'vector-line', 'vector-vector'])

/**
 * Distance questions judge the shortest distance to C: a vector's tip, a line's
 * nearest point, a sphere's surface. Never a bare point: a point marker is drawn
 * the same size at any depth, so a trial that hinges on one is close to a guess
 * under every technique (C itself sits on a line for that reason). Cubes are
 * left out: the distance to a cube depends on its orientation, so the
 * difficulty ratio could not be exact.
 */
export const DISTANCE_PAIR_TYPES = Object.freeze([
  'line-line',
  'vector-line',
  'line-sphere',
  'vector-sphere',
  'vector-vector',
  'sphere-sphere',
])

export const PAIR_KINDS = Object.freeze({
  'line-line': ['line', 'line'],
  'line-sphere': ['line', 'sphere'],
  'vector-line': ['vector', 'line'],
  'vector-vector': ['vector', 'vector'],
  'vector-sphere': ['vector', 'sphere'],
  'sphere-sphere': ['sphere', 'sphere'],
})

/**
 * Measured stimuli per clutter level, by difficulty: 9 each, 18 in total. Each
 * difficulty level holds one of each question type per clutter level, so every
 * type gets 6 trials, 2 per difficulty.
 */
export const MEASURED_DIFFICULTY_COUNTS = Object.freeze({
  low: { easy: 3, medium: 3, hard: 3 },
  high: { easy: 3, medium: 3, hard: 3 },
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
  // Every target sphere is the same size, so a sphere that looks bigger really
  // is nearer. With random radii, a big-looking sphere could simply be big.
  // Distractor spheres still vary (sphereRadius).
  targetSphereRadius: 2,
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
  // Distance questions. C sits near the middle of the view. The target farther
  // from C in 3D sits `targetScreenPx` from it on screen, and the nearer one
  // `screenRatio` times that, so on screen the nearer one is never clearly
  // nearer. Its 3D distance to C is `depthStretch` times the shortest distance
  // its view ray allows, which pushes it off C's depth. A vector's arrow aims
  // roughly at C, so its shaft never runs over C.
  distance: {
    referenceNdc: { x: 0.25, y: 0.2 },
    targetScreenPx: { min: 120, max: 200 },
    screenRatio: { min: 0.95, max: 1.3 },
    minScreenAngleDeg: 70,
    depthStretch: { min: 1.25, max: 2.2 },
    onScreenNdc: { x: 0.8, y: 0.75 },
    vectorAimJitterDeg: 45,
    shaftClearNdc: 0.07,
    // Nothing judged may sit on C on screen, and a line target may not point so
    // nearly along the view that it reads as a dot.
    minImagePx: 60,
    maxLineViewAlignment: 0.8,
  },
})
