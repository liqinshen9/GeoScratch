import { create } from 'zustand'
import { LINE_STYLES } from './lineStyles';

const useSceneStore = create((set) => ({
  objects: [],
  pendingObjects: [],
  autoRender: true,

  setObjects: (objects) => set({ objects }),
  setPendingObjects: (objects) => set({ pendingObjects: objects }),
  toggleAutoRender: () => set((state) => ({ autoRender: !state.autoRender })),
  commitRender: () => set((state) => ({
    objects: state.pendingObjects
  })),

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
  }))
}))

if (typeof window !== 'undefined') {
  window.useSceneStore = useSceneStore;
}

export default useSceneStore
