import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

let REGISTERED = false

/**
 * Register variables_set_obj3D building blocks + generator
 */
export function initSetObj3DBlock() {
  if (REGISTERED) return
  REGISTERED = true

  // === Block Defination ===
  Blockly.Blocks['variables_set_obj3D'] = {
    init: function () {
      this.appendValueInput('VALUE')
        .setCheck('obj3D')
        .appendField('set')
        .appendField(
          new Blockly.FieldDropdown(() => {
            const variables = this.workspace.getVariableMap().getVariablesOfType('obj3D')
            return variables.length ? variables.map((v) => [v.name, v.name]) : [['', '']]
          }),
          'VAR',
        )
        .appendField('to')
      this.setPreviousStatement(true, null)
      this.setNextStatement(true, null)
      this.setStyle(BLOCK_STYLES.OBJECT_VARIABLE)
      this.setTooltip('Set a 3D object variable')
    },
  }

  // === Generator ===
  javascriptGenerator.forBlock['variables_set_obj3D'] = function (block, generator) {
    const varName = generator.getVariableName(block.getFieldValue('VAR'))
    const argument0 = generator.valueToCode(block, 'VALUE', Order.NONE) || 'null'

    // No manual declaration -- the JS generator already emits `var <name>;`
    // for every workspace variable, defaulting to undefined (falsy-safe for a
    // premature `get`). See docs/architecture/naming-registry.md#variable-ordering-warnings-validatevariableorderingjs.

    // Evaluate the value expression exactly once -- splicing it in twice would
    // construct two separate objects.
    // See docs/architecture/naming-registry.md#wrapper-code-evaluates-once.
    const setLocal = `${varName} = ${argument0};\n`
    const persist = `threeObjStore["${varName}"] = ${varName};\n`
    const nameStamp = `if (${varName} && typeof ${varName} === 'object') ${varName}.userData = Object.assign(${varName}.userData || {}, { label: "${varName}" });\n`

    return setLocal + persist + nameStamp
  }
}
