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

const useSettingsStore = create((set) => ({
  settings: { ...DEFAULT_SETTINGS },

  updateSetting: (key, value) => set((state) => ({
    settings: {
      ...state.settings,
      [key]: value
    }
  })),

  resetSettings: () => set({
    settings: { ...DEFAULT_SETTINGS }
  })
}))

if (typeof window !== 'undefined') {
  window.useSettingsStore = useSettingsStore;
}

export default useSettingsStore
