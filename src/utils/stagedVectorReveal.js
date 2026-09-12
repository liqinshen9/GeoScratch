// Builds a userData.animate(progress, ease) closure that reveals a sequence of
// vector-shaft glyphs one after another, each eased over its own slot. The
// closure carries `.stages`, the number of arrows it reveals.
// `parts`: [{ obj | objs, full } | { animate }] in reveal order.
// See docs/architecture/animation.md#staged-vector-reveal.

export function makeStagedVectorReveal(parts) {
  // Slots are counted in arrows, not in parts: a part that delegates to
  // another reveal claims that reveal's whole stage count, so every arrow in
  // the picture gets a slot of the same length however deeply it is nested.
  const weights = parts.map((part) =>
    typeof part.animate === 'function' ? Math.max(1, part.animate.stages || 1) : 1,
  )
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1
  const starts = weights.map((_, i) => weights.slice(0, i).reduce((sum, w) => sum + w, 0))

  const reveal = (progress, ease) => {
    const ez = typeof ease === 'function' ? ease : (t) => t
    parts.forEach(({ obj, objs, animate, full }, i) => {
      const raw = Math.max(0, Math.min(1, (progress * total - starts[i]) / weights[i]))
      // A stage can hand its slot to another object's own reveal (an operand
      // another block drew, Scale Vector's v then k*v), which plays its whole
      // sub-picture inside this slot and eases its own stages.
      if (typeof animate === 'function') {
        animate(raw, ease)
        return
      }
      // Coincident glyphs share one stage (Scale Vector at k = 1): given a slot
      // each, the second would grow invisibly inside the first.
      const targets = objs || (obj ? [obj] : [])
      targets.forEach((target) => {
        const setLen = target.userData && target.userData.setVectorLength
        if (typeof setLen === 'function') setLen(full * ez(raw))
        // The reveal owns "not yet its turn", not "wanted at all": a glyph a
        // setting has switched off (vectorScale.js's Show Unscaled Vector)
        // stays off, or scrubbing would turn it back on for good.
        const suppressed = target.userData?.hiddenBySetting === true
        target.visible = !suppressed && (full === 0 || raw > 1e-3)
      })
    })
  }
  // What a consumer's slot has to be worth for this reveal to keep its pace.
  reveal.stages = total
  // A reveal that hands a stage to a slower closure has to ask for that time
  // too. AnimationDriver reads this off the SELECTED object's closure, and the
  // block a student selects is usually the outermost one, which delegates.
  reveal.durationScale = parts.reduce(
    (slowest, part) => Math.max(slowest, Number(part.animate?.durationScale) || 1),
    1,
  )
  return reveal
}

const EPSILON_SQ = 1e-9

const samePoint = (a, b) =>
  !!a && !!b && (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 < EPSILON_SQ

/**
 * Reveal order for a head-to-tail arrangement: a part whose tail sits on
 * another part's tip has to be revealed after it, whatever order the sockets
 * are in -- otherwise the first arrow grows out of a point in mid-air.
 * See docs/architecture/animation.md#reveal-order-follows-the-tails.
 *
 * @param {Array<{anchor?: number[], tip?: number[]}>} parts
 * @returns {Array} the same parts, reordered; stable where nothing anchors.
 */
export function orderRevealParts(parts) {
  const depth = parts.map(() => 0)
  // Passes, not a comparator: "after" is not a total order here, and two
  // degenerate parts on the same point would make a comparator cycle.
  for (let pass = 0; pass < parts.length; pass++) {
    let changed = false
    parts.forEach((part, i) => {
      parts.forEach((other, j) => {
        if (i === j || !samePoint(part.anchor, other.tip)) return
        if (depth[i] > depth[j]) return
        depth[i] = depth[j] + 1
        changed = true
      })
    })
    if (!changed) break
  }
  return parts
    .map((part, i) => ({ part, i }))
    .sort((a, b) => depth[a.i] - depth[b.i] || a.i - b.i)
    .map(({ part }) => part)
}
