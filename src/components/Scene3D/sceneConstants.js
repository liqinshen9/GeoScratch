/**
 * Constants shared by more than one Scene3D module. Anything used by a single
 * module lives in that module instead.
 */

export const DESMOS_TICK_COLOR = '#6b7280'

export const AXIS_COLORS = {
  x: '#b56f6f',
  y: '#6f9b72',
  z: '#6f86b5',
}

// Axes are NOT zoom-invariant-scaled. MIN_LINE_WORLD_RADIUS is a floor that
// keeps line glyphs thicker than the axis at any zoom despite the MIN_SCALE
// clamp. See docs/architecture/glyph-sizing.md#axis-vs-line-radius.
export const AXIS_SHAFT_RADIUS = 0.022
export const MIN_LINE_WORLD_RADIUS = AXIS_SHAFT_RADIUS * 1.25
// Per-glyph-kind zoom/thickness caps. See docs/architecture/glyph-sizing.md.
export const EXTRA_THICK_LINE_MULTIPLIER = 2.7
export const EXTRA_LARGE_POINT_MULTIPLIER = 1.6
export const EXTRA_LARGE_POINT_MAX_SCALE = 5.5
export const POINT_ZOOM_MAX_SCALE = 3.3
export const VECTOR_ZOOM_MAX_SCALE = 3.4
