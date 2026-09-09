import { create } from 'zustand'
import { LINE_STYLES, LINE_COLLISION_STYLES } from './lineStyles'
import { DEFAULT_COLOR_PRESET } from './colorPresets'
import { OBJECT_HIGHLIGHT_STYLES } from './highlightStyles'
import { ANIMATION_EASINGS, DEFAULT_ANIMATION_DURATION_MS } from './animationConfig'
import { NAMING_STYLES, LABEL_DETAIL_LEVELS } from './namingConfig'
import { THEMES, DEFAULT_THEME, resolveTheme, THEME_STORAGE_KEY } from './themeConfig'

// Extract defaults so you only have to maintain them in one place
const DEFAULT_SETTINGS = {
  theme: DEFAULT_THEME,
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
  haloLineVectorEnabled: true,
  vectorStyle: LINE_STYLES.PLAIN_TUBE,
  extraThickVectors: false,
  showVectorOriginPoint: false,
  showUnscaledVector: true,
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

// The user's own setting choices persist per-device in localStorage, the same
// local-convenience tier as exercise progress. Exercise overrides are never
// stored -- they're transient state owned by the open exercise.
const STORAGE_KEY = 'geoscratch:user-settings'

function loadUserSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    const clean = {}
    for (const [key, value] of Object.entries(parsed || {})) {
      if (Object.hasOwn(DEFAULT_SETTINGS, key) && value !== undefined) clean[key] = value
    }
    return clean
  } catch {
    // No storage (private mode, disabled, SSR): start from defaults.
    return {}
  }
}

function loadLegacyTheme() {
  try {
    const theme = localStorage.getItem(THEME_STORAGE_KEY)
    return Object.values(THEMES).includes(theme) ? { theme } : {}
  } catch {
    return {}
  }
}

function saveUserSettings(userSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userSettings))
    // Keep the pre-paint theme cache in step with main's saved settings.
    localStorage.setItem(THEME_STORAGE_KEY, userSettings.theme ?? DEFAULT_THEME)
  } catch {
    // Storage unavailable -- choices just won't persist across sessions.
  }
}

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

const INITIAL_USER_SETTINGS = { ...loadLegacyTheme(), ...loadUserSettings() }

const useSettingsStore = create((set, get) => ({
  // Keys the user explicitly changed (updateSetting writes here), rehydrated
  // from localStorage on load.
  userSettings: INITIAL_USER_SETTINGS,
  // Keys forced by the currently open exercise -- these win.
  exerciseOverrides: {},
  // Derived read surface: DEFAULT_SETTINGS < userSettings < exerciseOverrides.
  settings: mergeSettings(INITIAL_USER_SETTINGS, {}),
  resolvedTheme: resolveTheme(mergeSettings(INITIAL_USER_SETTINGS, {}).theme),

  updateSetting: (key, value) =>
    set((state) => {
      const userSettings = { ...state.userSettings, [key]: value }
      saveUserSettings(userSettings)
      return { userSettings, settings: mergeSettings(userSettings, state.exerciseOverrides) }
    }),

  // Reset the user's own choices; an exercise's lock stays in place.
  resetSettings: () =>
    set((state) => {
      saveUserSettings({})
      return { userSettings: {}, settings: mergeSettings({}, state.exerciseOverrides) }
    }),

  setExerciseOverrides: (overrides) =>
    set((state) => {
      const exerciseOverrides = pickValidOverrides(overrides)
      return { exerciseOverrides, settings: mergeSettings(state.userSettings, exerciseOverrides) }
    }),

  clearExerciseOverrides: () =>
    set((state) => ({ exerciseOverrides: {}, settings: mergeSettings(state.userSettings, {}) })),

  setResolvedTheme: (resolvedTheme) => set({ resolvedTheme }),

  isSettingLocked: (key) => Object.hasOwn(get().exerciseOverrides, key),
}))

if (typeof window !== 'undefined') {
  window.useSettingsStore = useSettingsStore
}

export default useSettingsStore
