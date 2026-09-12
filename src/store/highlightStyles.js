// Visual treatments for the currently-selected 3D object (see
// SelectionHighlight.jsx). Chosen from Settings -> Pre-attentive processing.
export const OBJECT_HIGHLIGHT_STYLES = Object.freeze({
  BLINK: 'blink',
  GLOW: 'glow',
})

// A single high-contrast accent that reads on top of any object colour. Could
// later be derived from the active colorPreset.
export const SELECTION_HIGHLIGHT_COLOR = '#ffb300'

// Correctness is semantic, not decorative, so these deliberately do NOT come
// from the colour preset: a "correct" green that turns grey under Monochrome
// would stop meaning anything. Matched to the pass banner's green in
// ExercisePage.css.
export const ANSWER_HIGHLIGHT_COLORS = Object.freeze({
  correct: '#22c55e',
  incorrect: '#dc2626',
})
