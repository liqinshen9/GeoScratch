// The geoTypes that DRAW a distance, as opposed to the ones that merely carry
// its value. Shared by the exercise checkers (which name the answer object) and
// the scene (which recolours it).
// See docs/architecture/selection-and-picking.md#the-answer-is-not-where-the-number-is.
export const ANSWER_GEOMETRY_TYPES = new Set([
  'distance_segment',
  'sphere_distance_candidate_highlight',
])
