// Builds a `userData.animate(progress, ease)` closure for the play/scrub
// transport (see AnimationDriver.jsx) that reveals a sequence of vector-shaft
// glyphs one after another: each grows from its own baked origin over an equal
// slice of the timeline, and the configured easing is applied to each stage's
// OWN local progress so every arrow eases in/out over its slot rather than
// inheriting one curve stretched across the whole sequence.
//
// Used by vector_arithmetic and vector_cross_product -- both render operand
// arrows plus a result arrow, all from buildVectorShaftGlyph (which exposes
// `userData.setVectorLength` to grow along a fixed origin/direction with no
// re-anchoring). A degenerate result (a plain sphere, `full` 0) has no
// setVectorLength and is just left visible.
//
// `parts`: [{ obj, full }] in reveal order.

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
