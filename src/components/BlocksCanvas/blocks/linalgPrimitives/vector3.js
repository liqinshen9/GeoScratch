import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

let REGISTERED = false

/**
 * Register linalg_vec3 (3-dimensional vector) building blocks + code generator
 * Output type: 'vector3'
 * Field: X/Y/Z (number)
 */
export function initVec3Block() {
  if (REGISTERED) return
  REGISTERED = true

  function appendCoordinateFields(block, label) {
    block.appendDummyInput()
      .appendField(label)
      .appendField(new Blockly.FieldNumber(1), 'X')
      .appendField(',')
      .appendField(new Blockly.FieldNumber(1), 'Y')
      .appendField(',')
      .appendField(new Blockly.FieldNumber(1), 'Z')
      .appendField(')')
  }

  function initVector3LikeBlock(block, label, tooltip) {
    appendCoordinateFields(block, label)
    block.setStyle(BLOCK_STYLES.CREATE_POINTS_VECTORS)
    block.setTooltip(tooltip)
    block.setDeletable(true)
    block.setMovable(true)
    block.setOutput(true, 'vector3')
  }

  Blockly.Blocks['linalg_vec3'] = {
    init() {
      initVector3LikeBlock(this, 'R³: (', '3D coordinate')
    },
  }

  Blockly.Blocks['linalg_point'] = {
    init() {
      initVector3LikeBlock(this, 'Point: (', '3D point coordinate')
    },
  }

  function vector3Generator(block) {
    const coords = `${block.getFieldValue('X')}, ${block.getFieldValue('Y')}, ${block.getFieldValue('Z')}`
    if (block.type === 'linalg_point') {
      return [`(function(){
        const point = new THREE.Vector3(${coords});
        const label = vectorNotation.assignPointLabel(${JSON.stringify(block.id)});
        point.userData = {
          geoType: 'linalg_point_vector',
          label,
          point: point.clone(),
        };
        return point;
      })()`, Order.FUNCTION_CALL]
    }
    return [`new THREE.Vector3(${coords})`, Order.ATOMIC]
  }

  //Linalg primitives
  javascriptGenerator.forBlock['linalg_vec3'] = vector3Generator
  javascriptGenerator.forBlock['linalg_point'] = vector3Generator
}
