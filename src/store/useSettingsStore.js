import { create } from 'zustand'
import { LINE_STYLES } from './lineStyles'

const useSettingsStore = create((set) => ({
  settings: {
    lineStyle: LINE_STYLES.PLAIN_LINE,
    showLabels: true,
    gridOpacity: 0.5,
  },

  updateSetting: (key, value) => set((state) => ({
    settings: {
      ...state.settings,
      [key]: value
    }
  })),

  resetSettings: () => set({
    settings: {
      lineStyle: LINE_STYLES.PLAIN_LINE,
      showLabels: true,
      gridOpacity: 0.5,
    }
  })
}))

export default useSettingsStore
