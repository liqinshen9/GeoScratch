/**
 * Constants shared by more than one Scene3D module. Anything used by a single
 * module lives in that module instead.
 */

// Origin marker / neutral tick color, per resolved theme.
const TICK_COLOR = { light: '#6b7280', dark: '#9aa4b8' }

// Muted per-axis red/green/blue. The dark set is lifted so the axes read
// against the dark scene ground. See docs/architecture/theming.md.
const AXIS_COLORS_BY_THEME = {
  light: { x: '#b56f6f', y: '#6f9b72', z: '#6f86b5' },
  dark: { x: '#e08f8f', y: '#8fca92', z: '#9db8ec' },
}

/** @param {'light' | 'dark'} [theme] */
export function getAxisColors(theme = 'light') {
  return AXIS_COLORS_BY_THEME[theme] || AXIS_COLORS_BY_THEME.light
}

/** @param {'light' | 'dark'} [theme] */
export function getTickColor(theme = 'light') {
  return TICK_COLOR[theme] || TICK_COLOR.light
}

// Back-compat: the light palette as plain exports (some call sites don't have
// a theme to hand). Prefer the accessors above where a theme is available.
export const DESMOS_TICK_COLOR = TICK_COLOR.light
export const AXIS_COLORS = AXIS_COLORS_BY_THEME.light

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

// Default/reset camera position. Shared because the perceptual exercises grade
// "which is closer" against it -- moving the camera must move their answer key
// too, not silently leave it behind.
export const DEFAULT_CAMERA_POSITION = [0, 25, 50]
