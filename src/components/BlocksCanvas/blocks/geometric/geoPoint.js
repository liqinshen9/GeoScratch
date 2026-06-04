import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

function geoPointDefinition(posInput, blockId, THREE, threeObjStore) {
  const position = posInput?.isVector3 ? posInput.clone() : new THREE.Vector3()
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x49a1ff, roughness: 0.4, metalness: 0.1 })
  )

  mesh.position.copy(position)
  mesh.userData.geoType = 'geo_point'
  mesh.userData.srcBlockId = blockId

  if (threeObjStore) threeObjStore[blockId] = mesh
  return mesh
}

let REGISTERED = false

export default function initPointBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.geo_point = {
    init() {
      this.appendDummyInput().appendField('Point')
      this.appendValueInput('POS').appendField('pos:').setCheck('vector3')
      this.setStyle(BLOCK_STYLES.CREATE_POINTS_VECTORS)
      this.setTooltip('Point with position p.')
      this.setOutput(true, 'obj3D')
    },
  }

  javascriptGenerator.forBlock.geo_point = function (block, generator) {
    const valueToCode = (name) =>
      block.getInput(name) ? generator.valueToCode(block, name, Order.FUNCTION_CALL) : ''
    const pos =
      valueToCode('POS') ||
      valueToCode('pos') ||
      'new THREE.Vector3()'
    const blockId = JSON.stringify(block.id)
    const code = `(${geoPointDefinition.toString()})(${pos}, ${blockId}, THREE, threeObjStore)`

    return [code, Order.FUNCTION_CALL]
  }
}
