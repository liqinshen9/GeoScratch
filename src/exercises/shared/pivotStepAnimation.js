import THREE from '@/utils/three'
import { matrix4FromTransformStepBlock } from '@/utils/sceneHelpers'

export function installPivotStepAnimation(object, steps, workspace) {
  const start = object.userData.transformAnim
  if (!start || !steps.length) return
  const matrix = new THREE.Matrix4().compose(start.startPos, start.startQuat, start.startScale)
  const poses = []
  const capture = () => {
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    matrix.decompose(position, quaternion, scale)
    poses.push({ position, quaternion, scale })
  }
  capture()
  for (const step of steps) {
    matrix.premultiply(matrix4FromTransformStepBlock(step, { fallbackToIdentity: true }))
    capture()
  }
  let highlighted = null
  object.userData.animateSteps = (progress, ease) => {
    const p = Math.max(0, Math.min(1, progress))
    const stage = p * (steps.length + 1)
    const preview = stage < 1
    const index = Math.min(steps.length - 1, Math.max(0, Math.floor(stage) - 1))
    const local = preview ? 0 : p === 1 ? 1 : stage - 1 - index
    const t = typeof ease === 'function' ? ease(local) : local
    const from = poses[index]
    const to = poses[index + 1]
    object.position.lerpVectors(from.position, to.position, t)
    object.quaternion.slerpQuaternions(from.quaternion, to.quaternion, t)
    object.scale.lerpVectors(from.scale, to.scale, t)
    object.updateMatrixWorld(true)
    const blockId = p === 1 ? null : preview ? object.userData.srcBlockId : steps[index].id
    if (highlighted !== blockId) {
      workspace.highlightBlock?.(blockId)
      highlighted = blockId
    }
  }
  object.userData.animateSteps.durationScale = steps.length + 1
}
