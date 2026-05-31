import * as Blockly from 'blockly/core'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { buildDotProductVisualExpression } from '@/utils/dotProductVisualCodegen'

let REGISTERED = false

export function initDotProductBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.vector_dot_product = {
    init() {
      this.appendDummyInput().appendField('Dot Product')
      this.appendValueInput('U').setCheck('vector3').appendField('p:')
      this.appendValueInput('V').setCheck('vector3').appendField('·').appendField('q:')
      this.setInputsInline(true)
      this.setOutput(true, 'scalar')
      this.setStyle('math_blocks')
      this.setColour(155)
      this.setTooltip('Compute p · q; shows projection of q onto p in the 3D view.')
      this.setDeletable(true)
      this.setMovable(true)
    },
  }

  javascriptGenerator.forBlock.vector_dot_product = function (block, generator) {
    const u = generator.valueToCode(block, 'U', Order.FUNCTION_CALL) || 'null'
    const v = generator.valueToCode(block, 'V', Order.FUNCTION_CALL) || 'null'
    const code = buildDotProductVisualExpression(block.id, u, v)
    return [code, Order.FUNCTION_CALL]
  }
}
