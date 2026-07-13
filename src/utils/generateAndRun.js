import { javascriptGenerator } from 'blockly/javascript'
import * as THREEBase from 'three'
import { TeapotGeometry } from 'three/examples/jsm/geometries/TeapotGeometry.js'
import { createStyledArrow } from '@/utils/styledArrow'
const THREE = { ...THREEBase, TeapotGeometry }
THREE.makeArrow = (...args) => createStyledArrow(THREE, ...args)
import {
  applyWorldMatrix4ToObject,
  collectStatementChain,
  createInfinitePlaneMesh,
  matrix4FromTransformStepBlock,
} from '@/utils/sceneHelpers'

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

export function generateAndRun(workspace) {
  javascriptGenerator.addReservedWords('generatedUserCode')
  const generatedUserCode = javascriptGenerator.workspaceToCode(workspace)

  try {
    // Standardize runtime variables safely on the window scope
    window.THREE = THREE
    if (!window.threeObjStore) window.threeObjStore = {}

    const runWorkspace = new Function(
      'THREE',
      'threeObjStore',
      'createInfinitePlaneMesh',
      generatedUserCode,
    )

    // Pass the window reference down into the function argument parameters
    runWorkspace(THREE, window.threeObjStore, createInfinitePlaneMesh)

    // Run pipelines modifying those exact object instances in place
    runConnectedTransformPipelines(workspace)
  } catch (error) {
    console.log(error)
  }
}
