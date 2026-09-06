// Builds a userData.animate(progress, ease) closure that reveals a sequence of
// vector-shaft glyphs one after another, each eased over its own slot.
// `parts`: [{ obj, full }] in reveal order.
// See docs/architecture/animation.md#staged-vector-reveal.

export function makeStagedVectorReveal(parts) {
  return (progress, ease) => {
    const ez = typeof ease === 'function' ? ease : (t) => t
    const n = parts.length || 1
    parts.forEach(({ obj, full }, i) => {
      const raw = Math.max(0, Math.min(1, progress * n - i))
      const setLen = obj && obj.userData && obj.userData.setVectorLength
      if (typeof setLen === 'function') setLen(full * ez(raw))
      if (obj) obj.visible = full === 0 || raw > 1e-3
    })
  }
}
