import THREE from '@/utils/three'
import { matrix4FromTransformStepBlock } from '@/utils/sceneHelpers'

export function installPivotStepAnimation(object, steps, workspace) {
  const start = object.userData.transformAnim
  if (!start || !steps.length) return
  object.userData.pivotHighlightAxis = null
  const matrix = new THREE.Matrix4().compose(start.startPos, start.startQuat, start.startScale)
  const matrices = []
  const capture = () => {
    matrices.push(matrix.clone())
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
    const stepMatrix = matrix4FromTransformStepBlock(steps[index], { fallbackToIdentity: true })
    const translation = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    stepMatrix.decompose(translation, rotation, scale)
    const partial = new THREE.Matrix4().compose(
      translation.multiplyScalar(t),
      new THREE.Quaternion().slerp(rotation, t),
      new THREE.Vector3(1, 1, 1).lerp(scale, t),
    )
    partial.multiply(matrices[index]).decompose(object.position, object.quaternion, object.scale)
    object.updateMatrixWorld(true)
    const blockId = p === 1 ? null : preview ? object.userData.srcBlockId : steps[index].id
    object.userData.pivotHighlightAxis =
      !preview && p !== 1 && steps[index]?.type === 'rot_matrix'
        ? steps[index].getFieldValue('AXIS') || 'X'
        : null
    if (object.userData.pivotCenterMarker) {
      object.userData.pivotCenterMarker.visible = p !== 1
    }
    if (highlighted !== blockId) {
      workspace.highlightBlock?.(blockId)
      highlighted = blockId
    }
  }
  object.userData.animateSteps.durationScale = steps.length + 1
}
