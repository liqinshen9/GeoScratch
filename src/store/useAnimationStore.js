import { create } from 'zustand'

// Transient playback transport (persistent knobs live in useSettingsStore).
// progress defaults to 1 == resting == today's static scene.
// See docs/architecture/animation.md.

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n)

const useAnimationStore = create((set) => ({
  playing: false,
  progress: 1,
  // Set by AnimationDriver: whether the current selection resolves to an
  // object that actually has a transform animation to play. The transport bar
  // uses it to enable/disable itself and show a hint.
  hasTarget: false,

  play: () =>
    set((state) => ({
      playing: true,
      progress: state.progress >= 1 ? 0 : state.progress,
    })),
  pause: () => set({ playing: false }),
  toggle: () =>
    set((state) => ({
      playing: !state.playing,
      progress: !state.playing && state.progress >= 1 ? 0 : state.progress,
    })),
  // Return to the resting, fully-transformed pose.
  stop: () => set({ playing: false, progress: 1 }),

  setProgress: (p) => set({ progress: clamp01(p), playing: false }),
  // Advancing from the play loop -- must not clear `playing` the way a manual
  // scrub does.
  tickProgress: (p) => set({ progress: clamp01(p) }),
  setHasTarget: (hasTarget) =>
    set((state) => (state.hasTarget === hasTarget ? state : { hasTarget })),
}))

export default useAnimationStore
