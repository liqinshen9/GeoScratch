import { create } from 'zustand'
import { LINE_STYLES, LINE_COLLISION_STYLES } from './lineStyles'
import { DEFAULT_COLOR_PRESET } from './colorPresets'
import { OBJECT_HIGHLIGHT_STYLES } from './highlightStyles'
import { ANIMATION_EASINGS, DEFAULT_ANIMATION_DURATION_MS } from './animationConfig'
import { NAMING_STYLES, LABEL_DETAIL_LEVELS } from './namingConfig'

// Extract defaults so you only have to maintain them in one place
const DEFAULT_SETTINGS = {
  lineStyle: LINE_STYLES.PLAIN_TUBE,
  lineCollisionStyle: LINE_COLLISION_STYLES.DASHED,
  colorPreset: DEFAULT_COLOR_PRESET,
  showLabels: true,
  showGrid: true,
  showBox: true,
  showBoxFrontWireframe: true,
  showAxes: true,
  showAxisToggleButton: true,
  showOriginLabel: false,
  showAxisScaleLabels: true,
  showAxisGizmo: true,
  objectsReceiveShadows: false,
  cameraShadowsEnabled: true,
  autoFocusOnNewObject: false,
  sphereShowGridlines: false,
  teapotShowGridlines: false,
  cubeShowEdges: false,
  zoomInvariantSizing: true,
  extraThickLines: false,
  extraLargePoints: false,
  mattePoints: false,
  haloEnabled: true,
  vectorStyle: LINE_STYLES.PLAIN_TUBE,
  extraThickVectors: false,
  showVectorOriginPoint: false,
  showPlanePointNormal: true,
  objectHighlightEnabled: true,
  objectHighlightStyle: OBJECT_HIGHLIGHT_STYLES.BLINK,
  animationDurationMs: DEFAULT_ANIMATION_DURATION_MS,
  animationEasing: ANIMATION_EASINGS.EASE_IN_OUT,
  animationLoop: false,
  namingStyle: NAMING_STYLES.SHORT,
  labelDetail: LABEL_DETAIL_LEVELS.NAME_ONLY,
}

export const SETTING_KEYS = Object.freeze(Object.keys(DEFAULT_SETTINGS))

// `settings` (the surface every consumer reads) is three layers merged, with
// the active exercise's overrides on top -- an exercise locks a setting via its
// `settingsOverrides` export (see src/exercises/index.js).
const mergeSettings = (userSettings, exerciseOverrides) => ({
  ...DEFAULT_SETTINGS,
  ...userSettings,
  ...exerciseOverrides,
})

// Drops keys that aren't real settings so a typo in an exercise module can't
// inject arbitrary state.
function pickValidOverrides(overrides) {
  const clean = {}
  for (const [key, value] of Object.entries(overrides || {})) {
    if (Object.hasOwn(DEFAULT_SETTINGS, key) && value !== undefined) {
      clean[key] = value
    } else if (import.meta.env?.DEV) {
      console.warn(`[GeoScratch] ignoring unknown exercise setting override: ${key}`)
    }
  }
  return clean
}

const useSettingsStore = create((set, get) => ({
  // Keys the user explicitly changed (updateSetting writes here).
  userSettings: {},
  // Keys forced by the currently open exercise -- these win.
  exerciseOverrides: {},
  // Derived read surface: DEFAULT_SETTINGS < userSettings < exerciseOverrides.
  settings: { ...DEFAULT_SETTINGS },

  updateSetting: (key, value) =>
    set((state) => {
      const userSettings = { ...state.userSettings, [key]: value }
      return { userSettings, settings: mergeSettings(userSettings, state.exerciseOverrides) }
    }),

  // Reset the user's own choices; an exercise's lock stays in place.
  resetSettings: () =>
    set((state) => ({ userSettings: {}, settings: mergeSettings({}, state.exerciseOverrides) })),

  setExerciseOverrides: (overrides) =>
    set((state) => {
      const exerciseOverrides = pickValidOverrides(overrides)
      return { exerciseOverrides, settings: mergeSettings(state.userSettings, exerciseOverrides) }
    }),

  clearExerciseOverrides: () =>
    set((state) => ({ exerciseOverrides: {}, settings: mergeSettings(state.userSettings, {}) })),

  isSettingLocked: (key) => Object.hasOwn(get().exerciseOverrides, key),
}))

if (typeof window !== 'undefined') {
  window.useSettingsStore = useSettingsStore
}

export default useSettingsStore
