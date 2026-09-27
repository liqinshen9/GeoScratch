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
export const EXTRA_LARGE_POINT_MAX_SCALE = 1.75
export const POINT_ZOOM_MAX_SCALE = 1.3
export const VECTOR_ZOOM_MAX_SCALE = 3.4

// Default/reset camera, as an orbit around the origin: `azimuthDeg` is measured
// from +Z towards +X (45 turns the ground plan 45 degrees, so X and Z leave the
// origin symmetrically), `elevationDeg` up from the ground plane. Isometric is
// 35.26 degrees; lower reads more like standing beside the scene.
// See docs/architecture/camera-view.md.
//
// Shared because the perceptual exercises grade "which is closer" against it --
// moving the camera must move their answer key too, not silently leave it
// behind.
export const DEFAULT_CAMERA_VIEW = Object.freeze({
  distance: 30,
  azimuthDeg: 45,
  elevationDeg: 27,
})

export function positionFromOrbit({ distance, azimuthDeg, elevationDeg }) {
  const azimuth = (azimuthDeg * Math.PI) / 180
  const elevation = (elevationDeg * Math.PI) / 180
  const horizontal = distance * Math.cos(elevation)
  return [
    horizontal * Math.sin(azimuth),
    distance * Math.sin(elevation),
    horizontal * Math.cos(azimuth),
  ]
}

export const DEFAULT_CAMERA_POSITION = positionFromOrbit(DEFAULT_CAMERA_VIEW)

// Above and to the viewer's left of the default view: the light-from-above
// prior, which is biased roughly 26 degrees left of vertical. Fixed in world
// space; it is derived from the default view's azimuth only so that editing
// DEFAULT_CAMERA_VIEW keeps it on the left. Orbiting does not move it.
// See docs/architecture/shadows.md#where-the-overhead-light-sits.
export const OVERHEAD_LIGHT_POSITION = positionFromOrbit({
  distance: 20,
  azimuthDeg: DEFAULT_CAMERA_VIEW.azimuthDeg - 90,
  elevationDeg: 64,
})
