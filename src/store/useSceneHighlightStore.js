import { create } from 'zustand'

// Non-selection highlight requests, rendered by SelectionHighlight with the
// user's highlight style. See docs/architecture/selection-and-picking.md#scene-axis-highlight.
const useSceneHighlightStore = create((set) => ({
  // 'x' | 'y' | 'z' | null -- a world axis to highlight (e.g. a rotation's axis).
  highlightedAxis: null,
  setHighlightedAxis: (axis) =>
    set({ highlightedAxis: axis ? String(axis).toLowerCase() : null }),
}))

export default useSceneHighlightStore
