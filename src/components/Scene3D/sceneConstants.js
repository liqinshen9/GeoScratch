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

// Fixed world-space radius of an axis shaft (see AxisArrow below) -- axes
// are deliberately NOT zoom-invariant-scaled, so this is their radius at
// any zoom. Every line glyph's own base radius is bigger than this by
// design, but the zoom-invariant MIN_SCALE clamp (below) can shrink a line
// well under its base radius at close zoom -- MIN_LINE_WORLD_RADIUS (used by
// ZoomInvariantScaler) is what keeps a line glyph visually thicker than the
// axis at any zoom instead of just at scale 1.
export const AXIS_SHAFT_RADIUS = 0.022
export const MIN_LINE_WORLD_RADIUS = AXIS_SHAFT_RADIUS * 1.25
// "Extra Thick Lines" setting: flat multiplier on top of zoom-invariant
// scaling, for line/tube glyphs only (not point markers).
export const EXTRA_THICK_LINE_MULTIPLIER = 2.7
export const EXTRA_LARGE_POINT_MULTIPLIER = 1.6
// A flat 1.6x on top of ZOOM_INVARIANT_MAX_SCALE would let points balloon to
// 8x their base radius when zoomed far out -- capped closer to the normal
// max (5x) instead, so the multiplier mainly reads at everyday zoom levels.
export const EXTRA_LARGE_POINT_MAX_SCALE = 5.5
// Point markers scale up faster than they need to when zooming out -- past
// this they just read as blobs -- so cap them below the general zoom-invariant
// max (plain lines/tubes still use the full ZOOM_INVARIANT_MAX_SCALE).
export const POINT_ZOOM_MAX_SCALE = 3.3
// Vector shafts/arrowheads look stubby and odd when zoomed all the way out;
// cap their zoom scaling earlier too (the "Extra Thick Vectors" multiplier
// still applies on top of this).
export const VECTOR_ZOOM_MAX_SCALE = 3.4
