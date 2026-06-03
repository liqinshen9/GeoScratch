import * as Blockly from 'blockly/core'
import { javascriptGenerator, Order } from 'blockly/javascript'

// ===================
// 1. RUNTIME THREE.JS
// ===================
function geoPointDefinition(posInput, blockId, THREE, threeObjStore) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.4, metalness: 0.1 })
  );

  m.position.copy(posInput);
  m.userData.geoType = 'geo_point';
  m.userData.srcBlockId = blockId;

  if (threeObjStore) {
    threeObjStore[blockId] = m;
  }

  return m;
}

// ==========================================
// 2. BLOCKLY BLOCK DEFINITION
// ==========================================
let REGISTERED = false

export default function initPointBlock() {
  if (REGISTERED) return
  REGISTERED = true

  // Block Definition
  Blockly.Blocks['geo_point'] = {
    init() {
      this.appendDummyInput().appendField('Point')
      this.appendValueInput('POS').appendField('pos:').setCheck('vector3')
      this.setStyle('math_blocks')
      this.setTooltip('Point with position p.')
      this.setOutput(true, 'obj3D')
      this.setColour(205)
    },
  }

  // Block Code Generation
  javascriptGenerator.forBlock['geo_point'] = function(block, generator) {
    const pos =
      generator.valueToCode(block, 'POS', Order.FUNCTION_CALL) ||
      'new THREE.Vector3()'
    const blockId = JSON.stringify(block.id)

    const code = `(${geoPointDefinition.toString()})(${pos}, ${blockId}, THREE, threeObjStore)`

    return [code, Order.FUNCTION_CALL]
  }
}
