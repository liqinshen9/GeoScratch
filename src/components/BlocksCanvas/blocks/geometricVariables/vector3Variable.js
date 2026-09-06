import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

let SET_REGISTERED = false
let GET_REGISTERED = false

/**
 * Register variables_set_vector3 / variables_get_vector3: a shared point or
 * vector variable. Unlike variables_set_obj3D, this never touches
 * threeObjStore -- a bare THREE.Vector3 has nothing to render on its own
 * (matching how a non-standalone linalg_vec3/linalg_point already has no
 * independent 3D presence; whichever block eventually consumes the value --
 * a vector_arithmetic, geo_vector, etc. -- is what draws it). The variable's
 * chosen name still propagates everywhere a name would otherwise come from:
 * vectorNotation.setVectorMetadata stamps it as the value's `label`, which
 * every operator block's `vectorNotation.getLabel(value, fallback)` already
 * knows how to read.
 */
export function initSetVector3VarBlock() {
  if (SET_REGISTERED) return
  SET_REGISTERED = true

  Blockly.Blocks['variables_set_vector3'] = {
    init() {
      this.appendValueInput('VALUE')
        .setCheck('vector3')
        .appendField('set')
        .appendField(
          new Blockly.FieldDropdown(() => {
            const variables = this.workspace.getVariableMap().getVariablesOfType('vector3')
            return variables.length ? variables.map((v) => [v.name, v.name]) : [['', '']]
          }),
          'VAR',
        )
        .appendField('to')
      this.setPreviousStatement(true, null)
      this.setNextStatement(true, null)
      this.setStyle(BLOCK_STYLES.OBJECT_VARIABLE)
      this.setTooltip('Set a point/vector variable')
    },
  }

  javascriptGenerator.forBlock['variables_set_vector3'] = function (block, generator) {
    const varName = generator.getVariableName(block.getFieldValue('VAR'))
    const argument0 = generator.valueToCode(block, 'VALUE', Order.NONE) || 'null'

    // No manual declaration: see setObj3D.js's generator for why -- the JS
    // generator's own init() already declares every real workspace
    // variable (as `var`, defaulting to undefined, already falsy-safe).
    const setLocal = `${varName} = ${argument0};\n`
    const nameStamp = `if (${varName} && ${varName}.isVector3) vectorNotation.setVectorMetadata(${varName}, { label: "${varName}" });\n`
    return setLocal + nameStamp
  }
}

export function initGetVector3VarBlock() {
  if (GET_REGISTERED) return
  GET_REGISTERED = true

  Blockly.Blocks['variables_get_vector3'] = {
    init() {
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('item', null, ['vector3'], 'vector3'), 'VAR')
        .appendField(' (Point/Vector)')
      this.setOutput(true, 'vector3')
      this.setStyle(BLOCK_STYLES.OBJECT_VARIABLE)
      this.setTooltip('Get a point/vector variable')
    },
  }

  javascriptGenerator.forBlock['variables_get_vector3'] = function (block, generator) {
    const code = generator.getVariableName(block.getFieldValue('VAR'))
    return [code, Order.ATOMIC]
  }
}
