import * as Blockly from 'blockly/core'
import { javascriptGenerator, Order } from 'blockly/javascript'

// ===================
// 1. RUNTIME THREE.JS
// ===================
function geoSphereDefinition(centreInput, radiusInput, blockId, THREE, threeObjStore) {
  const centre = centreInput.clone();
  const radius = Math.max(0.01, radiusInput);
  const geometry = new THREE.SphereGeometry(radius, 32, 16);
  const material = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    roughness: 0.5,
    metalness: 0.1,
    opacity: 0.8,
    transparent: true
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(centre);

  mesh.userData.geoType = 'geo_sphere';
  mesh.userData.centre = centre.clone();
  mesh.userData.radius = radius;
  mesh.userData.srcBlockId = blockId;

  if (threeObjStore) {
    threeObjStore[blockId] = mesh;
  }
  return mesh;
}


// ==========================================
// 2. BLOCKLY BLOCK DEFINITION
// ==========================================
let REGISTERED = false

export function initGeoSphereBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['geo_sphere'] = {
    init() {
      this.appendDummyInput().appendField('Sphere')
      this.setStyle('math_blocks')
      this.setTooltip('Sphere thats defined by radius and centre position.')
      this.setDeletable(true)
      this.setMovable(true)
      this.setOutput(true, 'obj3D')
      this.appendDummyInput()
        .appendField('Radius:')
        .appendField(new Blockly.FieldNumber(1, 0.01, Infinity, 0.1), 'Radius')
      this.appendValueInput('CENTRE').appendField('Centre:').setCheck('vector3')
      this.setColour(205)
    },
  }

  javascriptGenerator.forBlock['geo_sphere'] = function(block, generator) {
    const centre =
      generator.valueToCode(block, 'CENTRE', Order.FUNCTION_CALL) ||
      'new THREE.Vector3()'
    const radius = Number(block.getFieldValue('Radius'))
    const blockId = JSON.stringify(block.id)

    const code = `(${geoSphereDefinition.toString()})(${centre}, ${radius}, ${blockId}, THREE, threeObjStore)`

    return [code, Order.FUNCTION_CALL]
  }
}
