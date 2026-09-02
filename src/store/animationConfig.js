// Shared animation config: the persistent knobs live in useSettingsStore
// (animationDurationMs / animationEasing / animationLoop); this module holds the
// domain constants and the easing functions that both the Settings UI and
// AnimationDriver need.

export const ANIMATION_EASINGS = Object.freeze({
  LINEAR: 'linear',
  EASE_IN: 'ease-in',
  EASE_OUT: 'ease-out',
  EASE_IN_OUT: 'ease-in-out',
})

export const EASING_FNS = Object.freeze({
  [ANIMATION_EASINGS.LINEAR]: (t) => t,
  [ANIMATION_EASINGS.EASE_IN]: (t) => t * t * t,
  [ANIMATION_EASINGS.EASE_OUT]: (t) => 1 - Math.pow(1 - t, 3),
  [ANIMATION_EASINGS.EASE_IN_OUT]: (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
})

export function getEasingFn(name) {
  return EASING_FNS[name] || EASING_FNS[ANIMATION_EASINGS.EASE_IN_OUT]
}

// Wall-clock time for a full 0..1 play-through. 1x is the default.
export const DEFAULT_ANIMATION_DURATION_MS = 1500

export const ANIMATION_SPEED_PRESETS = Object.freeze([
  { label: '0.5x', ms: DEFAULT_ANIMATION_DURATION_MS * 2 },
  { label: '1x', ms: DEFAULT_ANIMATION_DURATION_MS },
  { label: '2x', ms: DEFAULT_ANIMATION_DURATION_MS / 2 },
  { label: '4x', ms: DEFAULT_ANIMATION_DURATION_MS / 4 },
])
