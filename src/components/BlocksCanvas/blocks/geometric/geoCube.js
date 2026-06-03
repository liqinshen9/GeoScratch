import * as Blockly from 'blockly/core'
import { javascriptGenerator, Order } from 'blockly/javascript'

// ===================
// 1. RUNTIME THREE.JS
// ===================
function geoCubeDefinition(centreInput, sideLength, blockId, THREE, threeObjStore) {
  const centre = centreInput.clone();
  const geometry = new THREE.BoxGeometry(sideLength, sideLength, sideLength);
  const material = new THREE.MeshStandardMaterial({
    color: 0x8b5cf6,
    roughness: 0.5,
    metalness: 0.1,
    transparent: true,
    opacity: 0.7
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(centre);

  const edgeGeometry = new THREE.EdgesGeometry(geometry);
  const edgeMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.25 });
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  mesh.add(edges);

  mesh.userData.geoType = 'geo_cube';
  mesh.userData.centre = centre.clone();
  mesh.userData.sideLength = sideLength;
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

export default function initGeoCubeBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['geo_cube'] = {
    init() {
      this.appendDummyInput().appendField('Cube')
      this.setStyle('math_blocks')
      this.setTooltip('Cube thats defined by side length and centre position.')
      this.setDeletable(true)
      this.setMovable(true)
      this.setOutput(true, 'obj3D')
      this.setColour(205)

      // Side length field: Keyed as 'SIDE_LENGTH' to stay descriptive
      this.appendDummyInput('SIDE_ROW')
        .appendField('Side length:')
        .appendField(new Blockly.FieldNumber(1, 0.0001, Infinity, 0.1), 'SIDE_LENGTH')

      // Centre field: Keyed as 'CENTRE'
      this.appendValueInput('CENTRE').appendField('Centre:').setCheck('vector3')
    }
  }

  javascriptGenerator.forBlock['geo_cube'] = function(block, generator) {
    const centre = generator.valueToCode(block, 'CENTRE', Order.FUNCTION_CALL) ||
      'new THREE.Vector3(0,0,0)'
    let sideLength = Number(block.getFieldValue('SIDE_LENGTH'))
    const blockId = JSON.stringify(block.id)

    const code = `(${geoCubeDefinition.toString()})(${centre}, ${sideLength}, ${blockId}, THREE, threeObjStore)`

    return [code, Order.FUNCTION_CALL]
  }
}
