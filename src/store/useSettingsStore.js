import { create } from 'zustand'
import { LINE_STYLES, LINE_COLLISION_STYLES } from './lineStyles'

// Extract defaults so you only have to maintain them in one place
const DEFAULT_SETTINGS = {
  lineStyle: LINE_STYLES.PLAIN_TUBE,
  lineCollisionStyle: LINE_COLLISION_STYLES.RINGED,
  thickLinePrimitives: true,
  showLabels: true,
  showGrid: true,
  showBox: true,
  showBoxFrontWireframe: true,
  showAxes: true,
  objectsReceiveShadows: true,
  autoFocusOnNewObject: false,
  sphereShowGridlines: false,
  teapotShowGridlines: false,
  zoomInvariantSizing: true,
  extraThickLines: false,
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
