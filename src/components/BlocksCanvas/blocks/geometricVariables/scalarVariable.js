import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

let SET_REGISTERED = false
let GET_REGISTERED = false

/**
 * Register variables_set_scalar / variables_get_scalar: a shared numeric
 * variable. A number has no 3D presence and no userData to stamp a name
 * onto, so unlike variables_set_obj3D/vector3 this never touches
 * threeObjStore or vectorNotation -- the JS variable itself is the whole
 * mechanism (every re-run re-evaluates the `set` block's input and every
 * `get` reads the resulting value, same as the object/vector variants).
 */
export function initSetScalarVarBlock() {
  if (SET_REGISTERED) return
  SET_REGISTERED = true

  Blockly.Blocks['variables_set_scalar'] = {
    init() {
      this.appendValueInput('VALUE')
        .setCheck('scalar')
        .appendField('set')
        .appendField(
          new Blockly.FieldDropdown(() => {
            const variables = this.workspace.getVariableMap().getVariablesOfType('scalar')
            return variables.length ? variables.map((v) => [v.name, v.name]) : [['', '']]
          }),
          'VAR',
        )
        .appendField('to')
      this.setPreviousStatement(true, null)
      this.setNextStatement(true, null)
      this.setStyle(BLOCK_STYLES.OBJECT_VARIABLE)
      this.setTooltip('Set a scalar variable')
    },
  }

  javascriptGenerator.forBlock['variables_set_scalar'] = function (block, generator) {
    const varName = generator.getVariableName(block.getFieldValue('VAR'))
    const argument0 = generator.valueToCode(block, 'VALUE', Order.NONE) || '0'

    // No manual declaration: see setObj3D.js's generator for why -- the JS
    // generator's own init() already declares every real workspace
    // variable (as `var`, defaulting to undefined).
    return `${varName} = ${argument0};\n`
  }
}

export function initGetScalarVarBlock() {
  if (GET_REGISTERED) return
  GET_REGISTERED = true

  Blockly.Blocks['variables_get_scalar'] = {
    init() {
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('item', null, ['scalar'], 'scalar'), 'VAR')
        .appendField(' (Scalar)')
      this.setOutput(true, 'scalar')
      this.setStyle(BLOCK_STYLES.OBJECT_VARIABLE)
      this.setTooltip('Get a scalar variable')
    },
  }

  javascriptGenerator.forBlock['variables_get_scalar'] = function (block, generator) {
    const code = generator.getVariableName(block.getFieldValue('VAR'))
    return [code, Order.ATOMIC]
  }
}
