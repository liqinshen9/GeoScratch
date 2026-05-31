import { javascriptGenerator } from 'blockly/javascript'
import * as THREE from 'three'
import {
  applyWorldMatrix4ToObject,
  collectStatementChain,
  createInfinitePlaneMesh,
  matrix4FromTransformStepBlock,
} from '@/utils/sceneHelpers'
import useThreeStore from '@/store/useThreeStore'

function blockCodegen(block) {
  const code = javascriptGenerator.blockToCode(block)
  return Array.isArray(code) ? code[0] ?? '' : code ?? ''
}

function evaluateBlockExpression(block, threeObjStore) {
  const code = blockCodegen(block)
  if (!code) return null
  try {
    return new Function('THREE', 'threeObjStore', `return (${code});`)(THREE, threeObjStore)
  } catch (error) {
    console.log(error)
    return null
  }
}

function runBlockStatement(block, threeObjStore) {
  const code = blockCodegen(block)
  if (!code) return
  try {
    new Function('THREE', 'threeObjStore', code)(THREE, threeObjStore)
  } catch (error) {
    console.log(error)
  }
}

function resolvePipelineInputObject(inputBlock, threeObjStore) {
  if (!inputBlock) return null

  let object = evaluateBlockExpression(inputBlock, threeObjStore)
  if (!(object?.isObject3D)) {
    object = threeObjStore[inputBlock.id]
  }
  return object?.isObject3D ? object : null
}

function runConnectedTransformPipelines(workspace, threeObjStore) {
  const pipelines = workspace.getBlocksByType('transform_pipeline', false)

  for (const pipeline of pipelines) {
    const inputBlock = pipeline.getInputTargetBlock('INPUT')
    const object = resolvePipelineInputObject(inputBlock, threeObjStore)
    if (!object) continue

    const steps = collectStatementChain(pipeline.getInputTargetBlock('STEPS'))

    for (let i = steps.length - 1; i >= 0; i -= 1) {
      applyWorldMatrix4ToObject(object, matrix4FromTransformStepBlock(steps[i]))
    }

    object.updateMatrixWorld(true)
  }
}

function runStandaloneDotProductBlocks(workspace, threeObjStore) {
  for (const block of workspace.getTopBlocks(false)) {
    if (block.type !== 'vector_dot_product') continue
    if (block.outputConnection?.targetConnection) continue
    runBlockStatement(block, threeObjStore)
  }
}

export function generateAndRun(workspace) {
  javascriptGenerator.addReservedWords('generatedUserCode')
  const generatedUserCode = javascriptGenerator.workspaceToCode(workspace)

  try {
    const threeObjStore = useThreeStore.getState().objects
    const runWorkspace = new Function(
      'THREE',
      'threeObjStore',
      'createInfinitePlaneMesh',
      generatedUserCode,
    )
    runWorkspace(THREE, threeObjStore, createInfinitePlaneMesh)
    runConnectedTransformPipelines(workspace, threeObjStore)
    runStandaloneDotProductBlocks(workspace, threeObjStore)
  } catch (error) {
    console.log(error)
  }
}