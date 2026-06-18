import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'
import * as THREE from 'three'
import {
  collectStatementChain,
  matrix4FromTransformStepBlock,
  matrix4ToRowMajor,
  rowMajor4To3,
} from '@/utils/sceneHelpers'
import { appendMatrixPreviewUI } from '../linalgPrimitives/matrixPreview.js'

let REGISTERED = false

function computePipelineMatrix4(block) {
  const chain = collectStatementChain(block.getInputTargetBlock('STEPS'))
  const combined = new THREE.Matrix4().identity()

  for (const step of chain) {
    combined.premultiply(matrix4FromTransformStepBlock(step, { fallbackToIdentity: true }))
  }

  return matrix4ToRowMajor(combined)
}

function computePipelineMatrix3(block) {
  return rowMajor4To3(computePipelineMatrix4(block))
}

function syncPipelineStepLabels(pipelineBlock) {
  const workspace = pipelineBlock.workspace
  if (!workspace) return

  const topToBottomBlocks = collectStatementChain(pipelineBlock.getInputTargetBlock('STEPS'))
  const nextNumberedIds = new Set(topToBottomBlocks.map((b) => b.id))

  if (!pipelineBlock._numberedStepIds) pipelineBlock._numberedStepIds = new Set()

  for (const blockId of pipelineBlock._numberedStepIds) {
    if (nextNumberedIds.has(blockId)) continue
    const stepBlock = workspace.getBlockById(blockId)
    if (stepBlock?.getFieldValue('PIPE_STEP')) {
      stepBlock.setFieldValue('', 'PIPE_STEP')
    }
  }

  for (let i = 0; i < topToBottomBlocks.length; i += 1) {
    const stepText = `Step ${i + 1}`
    if (topToBottomBlocks[i].getFieldValue('PIPE_STEP') !== stepText) {
      topToBottomBlocks[i].setFieldValue(stepText, 'PIPE_STEP')
    }
  }

  pipelineBlock._numberedStepIds = nextNumberedIds
}

export function initTransformPipelineBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.transform_pipeline = {
    init() {
      this.appendDummyInput().appendField('Transform Pipeline')
      this.appendValueInput('INPUT').setCheck('obj3D').appendField('Input object')
      this.appendStatementInput('STEPS').setCheck('transformStep').appendField('Transforms')
      appendMatrixPreviewUI(this, computePipelineMatrix3, computePipelineMatrix4, {
        spacerHeight: 28,
      })
      this.setStyle(BLOCK_STYLES.TRANSFORM_PIPELINE)
      this.setTooltip('Connect an input object and a stack of transforms.')

      this.setOnChange(() => {
        if (!this.workspace) return
        syncPipelineStepLabels(this)
        this.setWarningText(
          [
            'Transformation order changes the result.',
            'Top block runs first.',
            'Bottom block runs last.',
            'Drag steps to reorder.',
          ].join('\n'),
        )
      })
    },
  }

  javascriptGenerator.forBlock.transform_pipeline = function (block, generator) {
    const inputObject = generator.valueToCode(block, 'INPUT', Order.NONE)
    return inputObject ? `${inputObject};\n` : ''
  }
}
