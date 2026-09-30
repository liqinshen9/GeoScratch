import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { vectorLabelFromBlock } from '@/utils/sceneHelpers'
import { buildDotProductVisualExpression } from '@/utils/dotProductVisualCodegen'

let REGISTERED = false

export function initDotProductBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.vector_dot_product = {
    init() {
      this.appendDummyInput().appendField('Dot Product')
      this.appendValueInput('U').setCheck('vector3')
      this.appendValueInput('V').setCheck('vector3').appendField('·')
      this.setInputsInline(true)
      this.setOutput(true, 'scalar')
      this.setStyle(BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS)
      this.setTooltip('Compute p · q; shows projection of q onto p in the 3D view.')
      this.setDeletable(true)
      this.setMovable(true)
    },
  }

  javascriptGenerator.forBlock.vector_dot_product = function (block, generator) {
    const u = generator.valueToCode(block, 'U', Order.FUNCTION_CALL) || 'null'
    const v = generator.valueToCode(block, 'V', Order.FUNCTION_CALL) || 'null'
    // Operand block names, baked in: a nested vector carries none.
    const code = buildDotProductVisualExpression(
      block.id,
      u,
      v,
      vectorLabelFromBlock(block.getInputTargetBlock('U')) || 'p',
      vectorLabelFromBlock(block.getInputTargetBlock('V')) || 'q',
    )
    return [code, Order.FUNCTION_CALL]
  }
}
