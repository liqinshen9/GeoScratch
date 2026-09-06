import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

let REGISTERED = false

/**
 * Register variables_get_obj3D building blocks + generator
 */
export function initGetObj3DBlock() {
  if (REGISTERED) return
  REGISTERED = true

  // === Block Defination ===
  Blockly.Blocks['variables_get_obj3D'] = {
    init() {
      this.appendDummyInput()
        .appendField(
          new Blockly.FieldVariable('item', null, ['obj3D'], 'obj3D'),
          'VAR'
        )
        .appendField(' (3D Object)')
      this.setOutput(true, 'obj3D')
      this.setStyle(BLOCK_STYLES.OBJECT_VARIABLE)
      this.setTooltip('Get a 3D object variable')
    },
  }

  // === Generator ===
  javascriptGenerator.forBlock['variables_get_obj3D'] = function (
    block,
    generator
  ) {
    const code = generator.getVariableName(block.getFieldValue('VAR'))
    return [code, Order.ATOMIC]
  }
}
