import * as Blockly from 'blockly/core'
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

  for (let i = chain.length - 1; i >= 0; i -= 1) {
    combined.premultiply(matrix4FromTransformStepBlock(chain[i], { fallbackToIdentity: true }))
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
  const bottomToTopBlocks = topToBottomBlocks.slice().reverse()
  const nextNumberedIds = new Set(bottomToTopBlocks.map((b) => b.id))

  if (!pipelineBlock._numberedStepIds) pipelineBlock._numberedStepIds = new Set()

  for (const blockId of pipelineBlock._numberedStepIds) {
    if (nextNumberedIds.has(blockId)) continue
    const stepBlock = workspace.getBlockById(blockId)
    if (stepBlock?.getFieldValue('PIPE_STEP')) {
      stepBlock.setFieldValue('', 'PIPE_STEP')
    }
  }

  for (let i = 0; i < bottomToTopBlocks.length; i += 1) {
    const stepText = `Step ${i + 1}`
    if (bottomToTopBlocks[i].getFieldValue('PIPE_STEP') !== stepText) {
      bottomToTopBlocks[i].setFieldValue(stepText, 'PIPE_STEP')
    }
  }

  pipelineBlock._numberedStepIds = nextNumberedIds
}

export function initTransformPipelineBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.transform_pipeline = {
    init() {
      this.appendDummyInput().appendField('Transform Pipeline (Bottom \u2192 Top)')
      this.appendValueInput('INPUT').setCheck('obj3D').appendField('Input object')
      this.appendStatementInput('STEPS').setCheck('transformStep').appendField('Transforms')
      appendMatrixPreviewUI(this, computePipelineMatrix3, computePipelineMatrix4)
      this.setStyle('logic_blocks')
      this.setColour(155)
      this.setTooltip('Connect an input object and a stack of transforms.')

      this.setOnChange(() => {
        if (!this.workspace) return
        syncPipelineStepLabels(this)
        this.setWarningText(
          [
            'Transformation order changes the result.',
            'Bottom block runs first.',
            'Top block runs last.',
            'Drag steps to reorder.',
          ].join('\n'),
        )
      })
    },
  }

  javascriptGenerator.forBlock.transform_pipeline = function (block, generator) {
    generator.valueToCode(block, 'INPUT', Order.NONE)
    return ''
  }
}
