import { create } from 'zustand'

const usePivotPlaybackStore = create((set, get) => ({
  target: null,
  progress: 0,
  play: (target) => {
    get().target?.userData?.animateSteps?.(1)
    set({ target, progress: 0 })
  },
  advance: (progress) => set({ progress, ...(progress >= 1 ? { target: null } : {}) }),
  stop: () => {
    get().target?.userData?.animateSteps?.(1)
    set({ target: null, progress: 0 })
  },
}))
export default usePivotPlaybackStore
