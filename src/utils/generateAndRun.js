import { javascriptGenerator } from 'blockly/javascript'
import * as THREEBase from 'three'
import { TeapotGeometry } from 'three/examples/jsm/geometries/TeapotGeometry.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
const THREE = { ...THREEBase, TeapotGeometry, Line2, LineGeometry, LineMaterial, LineSegments2, LineSegmentsGeometry }
import {
  applyWorldMatrix4ToObject,
  collectStatementChain,
  createInfinitePlaneMesh,
  matrix4FromTransformStepBlock,
} from '@/utils/sceneHelpers'
import { createVectorNotationRuntime } from '@/utils/vectorNotation'
import { HALO_LAYER } from '@/utils/haloLayer'
import { getHaloId } from '@/utils/haloIdRegistry'
import { applyHaloDiscardMaterial } from '@/utils/haloDiscardShader'
import { createHaloIdMaterial } from '@/utils/haloIdMaterial'
import { registerHaloLine, resetHaloIntersectionRegistry, MAX_IMMUNE_IDS } from '@/utils/haloIntersectionRegistry'
import { buildVectorShaftGlyph } from '@/utils/vectorShaftGlyph'
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
      if (hasStep) rebuildTransformedLine(object, combined)
      pipeline.setWarningText?.(
        skippedScale ? 'Scaling has no effect on a line (a line has no size).' : null,
        'lineScale',
      )
      continue
    }

    for (const step of steps) {
      applyWorldMatrix4ToObject(object, matrix4FromTransformStepBlock(step))
    }

    object.updateMatrixWorld(true)
  }
}

export function generateAndRun(workspace, options = {}) {
  javascriptGenerator.addReservedWords('generatedUserCode')
  const generatedUserCode = javascriptGenerator.workspaceToCode(workspace)

  try {
    // Standardize runtime variables safely on the window scope
    window.THREE = THREE
    if (!window.threeObjStore) window.threeObjStore = {}
    window.__geoScratchCrossVisualKeys = new Set()
    window.__geoScratchRuntimeMode = options.runtimeMode || 'sandbox'
    window.vectorNotation = createVectorNotationRuntime()
    window.HALO_LAYER = HALO_LAYER
    window.getHaloId = getHaloId
    window.applyHaloDiscardMaterial = applyHaloDiscardMaterial
    window.createHaloIdMaterial = createHaloIdMaterial
    window.registerHaloLine = registerHaloLine
    window.HALO_MAX_IMMUNE_IDS = MAX_IMMUNE_IDS
    window.buildVectorShaftGlyph = buildVectorShaftGlyph
    // Lets object_transform / vector_transform's generated runtime code rebuild
    // a transformed line instead of applyMatrix4-ing its baked geometry (#77).
    window.__geoScratchRebuildTransformedLine = rebuildTransformedLine
    // Fresh per run -- a stale entry from a previous run is harmless (its
    // blockId's id is never written by anything once that run's objects are
    // gone), but there's no reason to let the registry grow unbounded across
    // many runs either.
    resetHaloIntersectionRegistry()

    const runWorkspace = new Function(
      'THREE',
      'threeObjStore',
      'createInfinitePlaneMesh',
      'vectorNotation',
      generatedUserCode,
    )

    // Pass the window reference down into the function argument parameters
    runWorkspace(THREE, window.threeObjStore, createInfinitePlaneMesh, window.vectorNotation)

    // Run pipelines modifying those exact object instances in place
    runConnectedTransformPipelines(workspace)
  } catch (error) {
    console.log(error)
  }
}
