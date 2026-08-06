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

function runConnectedTransformPipelines(workspace) {
  const pipelines = workspace.getBlocksByType('transform_pipeline', false)
  const threeObjStore = window.threeObjStore || {}

  for (const pipeline of pipelines) {
    const inputBlock = pipeline.getInputTargetBlock('INPUT')
    if (!inputBlock) continue

    const object = threeObjStore[inputBlock.id]
    if (!object || !object.isObject3D) continue

    const steps = collectStatementChain(pipeline.getInputTargetBlock('STEPS'))
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
