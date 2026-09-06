import { javascriptGenerator } from 'blockly/javascript'
import THREE from '@/utils/three'
import {
  applyWorldMatrix4ToObject,
  collectStatementChain,
  matrix4FromTransformStepBlock,
} from '@/utils/sceneHelpers'
import { validateVariableOrdering } from '@/utils/validateVariableOrdering'
import { installSceneRuntime, RUNTIME_PARAM_NAMES } from '@/utils/sceneRuntime'
import { bakeLineTransformAnimation } from '@/utils/lineTransformAnimation'
import { geoVectorLineDefinition } from '@/components/BlocksCanvas/blocks/geometric/geoVectorLine'

function disposeObject3D(root) {
  root?.traverse?.((child) => {
    child.geometry?.dispose?.()
    const materials = Array.isArray(child.material)
      ? child.material
      : child.material
        ? [child.material]
        : []
    for (const material of materials) {
      material.map?.dispose?.()
      material.dispose?.()
    }
  })
}

/**
 * Rebuilds a transformed line from its new origin/direction instead of
 * applyMatrix4-ing its baked geometry (#77). Returns the rebuilt object, or
 * the original if it couldn't rebuild.
 * See docs/architecture/transform-and-line-rebuild.md.
 */
export function rebuildTransformedLine(object, worldMatrix) {
  if (object?.userData?.geoType !== 'geo_vector_line' || !worldMatrix?.isMatrix4) return object

  const { srcBlockId: blockId, origin, direction } = object.userData
  if (!blockId || !origin || !direction) return object

  const newOrigin = origin.clone().applyMatrix4(worldMatrix)
  const linear = new THREE.Matrix3().setFromMatrix4(worldMatrix)
  const newDirection = direction.clone().applyMatrix3(linear)
  if (!Number.isFinite(newDirection.length()) || newDirection.length() < 1e-9) return object

  const rebuilt = geoVectorLineDefinition(newOrigin, newDirection, object.userData.t, blockId)
  if (!rebuilt || rebuilt === object) return object

  if (object.parent) {
    object.parent.add(rebuilt)
    object.parent.remove(object)
  }
  disposeObject3D(object)
  window.threeObjStore[blockId] = rebuilt
  return rebuilt
}

function runConnectedTransformPipelines(workspace) {
  const pipelines = workspace.getBlocksByType('transform_pipeline', false)
  const threeObjStore = window.threeObjStore || {}

  for (const pipeline of pipelines) {
    pipeline.setWarningText?.(null, 'lineScale')

    const inputBlock = pipeline.getInputTargetBlock('INPUT')
    if (!inputBlock) continue

    const object = threeObjStore[inputBlock.id]
    if (!object || !object.isObject3D) continue

    const steps = collectStatementChain(pipeline.getInputTargetBlock('STEPS'))

    if (object.userData?.geoType === 'geo_vector_line') {
      // Combine steps into one world matrix and rebuild once; scale steps
      // skipped. See docs/architecture/transform-and-line-rebuild.md#runconnectedtransformpipelines.
      const combined = new THREE.Matrix4()
      let hasStep = false
      let skippedScale = false
      for (const step of steps) {
        if (step.type === 'scale_matrix') {
          skippedScale = true
          continue
        }
        const stepMatrix = matrix4FromTransformStepBlock(step)
        if (stepMatrix?.isMatrix4) {
          combined.premultiply(stepMatrix)
          hasStep = true
        }
      }
      if (hasStep) {
        // Captured before the rebuild -- the untransformed line is progress 0.
        const priorAnim = object.userData.lineTransformAnim
        const startOrigin = priorAnim?.startOrigin || object.userData.origin?.clone()
        const startDirection = priorAnim?.startDirection || object.userData.direction?.clone()
        const rebuilt = rebuildTransformedLine(object, combined)
        // Same object back == couldn't rebuild == nothing moved == nothing to animate.
        if (rebuilt !== object) {
          bakeLineTransformAnimation(rebuilt, startOrigin, startDirection, [
            ...(priorAnim?.pipelineBlockIds || []),
            pipeline.id,
          ])
        }
      }
      pipeline.setWarningText?.(
        skippedScale ? 'Scaling has no effect on a line (a line has no size).' : null,
        'lineScale',
      )
      continue
    }

    // Bake a start/end pose pair + animate(progress) closure.
    // See docs/architecture/animation.md#pose-pair-baking.
    object.updateMatrix()
    const priorAnim = object.userData.transformAnim
    const startPos = priorAnim ? priorAnim.startPos : object.position.clone()
    const startQuat = priorAnim ? priorAnim.startQuat : object.quaternion.clone()
    const startScale = priorAnim ? priorAnim.startScale : object.scale.clone()

    for (const step of steps) {
      applyWorldMatrix4ToObject(object, matrix4FromTransformStepBlock(step))
    }

    object.updateMatrixWorld(true)

    const anim = {
      startPos,
      startQuat,
      startScale,
      endPos: object.position.clone(),
      endQuat: object.quaternion.clone(),
      endScale: object.scale.clone(),
      pipelineBlockIds: [...(priorAnim?.pipelineBlockIds || []), pipeline.id],
    }
    object.userData.transformAnim = anim
    object.userData.animAliasBlockIds = anim.pipelineBlockIds
    // Pose lerp: linear pos/scale, shortest-path quaternion slerp.
    // See docs/architecture/transform-and-line-rebuild.md#rotation-past-180.
    object.userData.animate = (p, ease) => {
      const e = typeof ease === 'function' ? ease(p) : p
      object.position.lerpVectors(anim.startPos, anim.endPos, e)
      object.quaternion.slerpQuaternions(anim.startQuat, anim.endQuat, e)
      object.scale.lerpVectors(anim.startScale, anim.endScale, e)
      object.updateMatrixWorld(true)
    }
  }
}

export function generateAndRun(workspace, options = {}) {
  javascriptGenerator.addReservedWords('generatedUserCode')
  const generatedUserCode = javascriptGenerator.workspaceToCode(workspace)
  validateVariableOrdering(workspace)

  try {
    // Publishes window.THREE, window.threeObjStore, etc. for stringified
    // builders. See docs/architecture/generated-code-runtime.md.
    const runtimeArgs = installSceneRuntime(workspace, options)

    // Set here, not in sceneRuntime.js, to avoid an import cycle (#77).
    // See docs/architecture/transform-and-line-rebuild.md#the-77-problem.
    window.__geoScratchRebuildTransformedLine = rebuildTransformedLine

    const runWorkspace = new Function(...RUNTIME_PARAM_NAMES, generatedUserCode)
    runWorkspace(...runtimeArgs)

    // Run pipelines modifying those exact object instances in place
    runConnectedTransformPipelines(workspace)
  } catch (error) {
    // Caught, not rethrown, but MUST be loud -- usually a builder referencing
    // an import from inside its stringified body.
    // See docs/architecture/generated-code-runtime.md#failure-mode.
    console.error('[GeoScratch] Generated block code threw; the scene may be incomplete:', error)
  }
}
