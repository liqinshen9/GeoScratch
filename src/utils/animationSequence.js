/**
 * A stand-in animation target that plays several animatable objects one after
 * another, each over a slot sized by its own `durationScale`. Shaped like an
 * object (`userData.animate`, `userData.animActiveBlockId`) so AnimationDriver
 * drives it like any single target.
 * See docs/architecture/animation.md#a-whole-task-in-sequence.
 *
 * @param {THREE.Object3D[]} parts animatable objects, in playing order
 */
export function makeAnimationSequence(parts) {
  const scaleOf = (part) => Number(part.userData.animate.durationScale) || 1
  const userData = { animActiveBlockId: null }

  const animate = (progress, ease) => {
    const p = Math.max(0, Math.min(1, progress))
    const scales = parts.map(scaleOf)
    const total = scales.reduce((a, b) => a + b, 0)
    let offset = 0
    const locals = scales.map((scale) => {
      const local = Math.max(0, Math.min(1, (p * total - offset) / scale))
      offset += scale
      return local
    })
    const active = p === 1 ? -1 : locals.findIndex((local) => local < 1)
    // The part in progress goes last, so where two parts drive one glyph the
    // one playing has the final say.
    parts.forEach((part, i) => i !== active && part.userData.animate(locals[i], ease))
    if (active < 0) {
      userData.animActiveBlockId = null
      return
    }
    const part = parts[active]
    part.userData.animate(locals[active], ease)
    userData.animActiveBlockId = part.userData.animActiveBlockId ?? part.userData.srcBlockId
  }
  Object.defineProperty(animate, 'durationScale', {
    get: () => parts.reduce((sum, part) => sum + scaleOf(part), 0),
  })
  userData.animate = animate
  return { userData }
}
