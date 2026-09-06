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
 * A "Vector Equation of Line" bakes its wall-to-wall extent into geometry at
 * build time (rayBoxExitDistance in geoVectorLine.js). Applying a transform via
 * applyMatrix4 just spins that baked segment, so after a rotation it no longer
 * spans the bounding box for its new direction -- it falls short on one side and
 * pokes out the other (#77). Rebuild it from the transformed origin/direction
 * instead, which re-runs the extent calculation. `worldMatrix` is a world-space
 * Matrix4; lines are top-level in the scene so no parent-space correction is
 * needed. Returns the object to use going forward (rebuilt, or the original if
 * it could not be rebuilt).
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
      // Combine the steps into one world matrix (same order as the block's
      // matrix preview) and rebuild once. Scale steps are skipped: a line has
      // no size, so "scaling" it only shears its direction into a different
      // line, which is confusing as a size control (#77).
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
        // Captured before the rebuild: these are the untransformed line, which
        // is what progress 0 has to show. A second pipeline feeding the same
        // line keeps the first-captured start and just adds its own id as
        // another entry point, same as the pose path below.
        const priorAnim = object.userData.lineTransformAnim
        const startOrigin = priorAnim?.startOrigin || object.userData.origin?.clone()
        const startDirection = priorAnim?.startDirection || object.userData.direction?.clone()
        const rebuilt = rebuildTransformedLine(object, combined)
        // rebuildTransformedLine hands back the ORIGINAL object when it can't
        // rebuild (degenerate direction, missing origin) -- nothing moved, so
        // there is nothing to animate.
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

    // Bake a start/end pose pair + an animate(progress) closure so
    // AnimationDriver can interpolate this object between "untransformed" and
    // "fully transformed" without re-running code generation every frame.
    // Assumes `object` is top-level in the scene (its <primitive> wrapper group
    // is identity) -- true for every current transform exercise. A second
    // pipeline feeding the same object keeps the first-captured start and just
    // records its own id as another entry point (animAliasBlockIds -- selecting
    // the pipeline block, which renders nothing itself, still drives this).
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
    // One continuous motion, so ease the whole 0..1. Pose lerp: position/scale
    // linear, rotation via shortest-path quaternion slerp. Limitation: a single
    // rotation step past 180 degrees animates the short way round -- the
    // decompose above already collapsed it to a <=180 quaternion.
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
    // Publishes window.THREE, window.threeObjStore and the rest of the API that
    // stringified block builders depend on -- see sceneRuntime.js for the full
    // list and for why builders cannot simply import these.
    const runtimeArgs = installSceneRuntime(workspace, options)

    // Lets object_transform / vector_transform's generated runtime code rebuild
    // a transformed line instead of applyMatrix4-ing its baked geometry (#77).
    // Lives here rather than in sceneRuntime.js because it is defined in this
    // module, which sceneRuntime.js must not import back (cycle).
    window.__geoScratchRebuildTransformedLine = rebuildTransformedLine

    const runWorkspace = new Function(...RUNTIME_PARAM_NAMES, generatedUserCode)
    runWorkspace(...runtimeArgs)

    // Run pipelines modifying those exact object instances in place
    runConnectedTransformPipelines(workspace)
  } catch (error) {
    // Caught, not rethrown: one malformed block should degrade to a partial
    // scene rather than take the whole editor down. But it MUST be loud -- a
    // silent failure here looks identical to "the scene is just empty", and the
    // most common cause is a block builder referencing an imported binding that
    // does not exist inside its stringified body (see sceneRuntime.js).
    console.error('[GeoScratch] Generated block code threw; the scene may be incomplete:', error)
  }
}
