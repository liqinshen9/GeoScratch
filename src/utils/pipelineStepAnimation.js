import THREE from '@/utils/three'

/**
 * An `animate(progress, ease)` that plays a transform pipeline one step at a
 * time, each step easing over its own equal slice of the timeline, instead of
 * lerping straight from the start pose to the end pose. A step is applied in
 * world space like the pipeline applies it, so a rotation turns the object
 * about the origin. `object.userData.animActiveBlockId` names the step playing
 * (null at rest) for AnimationDriver to highlight.
 * See docs/architecture/animation.md#step-by-step-pipelines.
 *
 * @param {THREE.Object3D} object
 * @param {{ startPos: THREE.Vector3, startQuat: THREE.Quaternion, startScale: THREE.Vector3 }} start
 * @param {THREE.Matrix4[]} stepMatrices one world matrix per step, in order
 * @param {string[]} stepBlockIds the block behind each step
 */
export function makePipelineStepAnimation(object, start, stepMatrices, stepBlockIds) {
  const before = []
  const matrix = new THREE.Matrix4().compose(start.startPos, start.startQuat, start.startScale)
  for (const step of stepMatrices) {
    before.push(matrix.clone())
    matrix.premultiply(step)
  }
  const parts = stepMatrices.map((step) => {
    const translation = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    step.decompose(translation, rotation, scale)
    return { translation, rotation, scale }
  })
  const partial = new THREE.Matrix4()
  const identity = new THREE.Quaternion()
  const one = new THREE.Vector3(1, 1, 1)

  const animate = (progress, ease) => {
    const p = Math.max(0, Math.min(1, progress))
    const stage = p * parts.length
    const index = Math.min(parts.length - 1, Math.floor(stage))
    const local = p === 1 ? 1 : stage - index
    const t = typeof ease === 'function' ? ease(local) : local
    const { translation, rotation, scale } = parts[index]
    partial
      .compose(
        translation.clone().multiplyScalar(t),
        identity.clone().slerp(rotation, t),
        one.clone().lerp(scale, t),
      )
      .multiply(before[index])
      .decompose(object.position, object.quaternion, object.scale)
    object.updateMatrixWorld(true)
    object.userData.animActiveBlockId = p === 1 ? null : stepBlockIds[index]
  }
  // A step gets the time a whole pipeline used to, so each one is followable.
  animate.durationScale = parts.length
  return animate
}
