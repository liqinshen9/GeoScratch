import { create } from 'zustand'
import { LINE_STYLES } from './lineStyles'

// Extract defaults so you only have to maintain them in one place
const DEFAULT_SETTINGS = {
  lineStyle: LINE_STYLES.PLAIN_TUBE,
  showLabels: true,
  sceneBackground: 'dark',
  showGrid: true,
  showBox: true,
  showAxes: true,
  objectsReceiveShadows: true,
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
