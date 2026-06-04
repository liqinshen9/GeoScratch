import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

function geoSphereDefinition(centreInput, radiusInput, blockId, THREE, threeObjStore) {
  const centre = centreInput?.isVector3 ? centreInput.clone() : new THREE.Vector3()
  const radius = Math.max(0.01, Number(radiusInput) || 1)
  const geometry = new THREE.SphereGeometry(radius, 32, 16)
  const material = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    roughness: 0.5,
    metalness: 0.1,
    opacity: 0.8,
    transparent: true,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(centre)
  mesh.userData.geoType = 'geo_sphere'
  mesh.userData.centre = centre.clone()
  mesh.userData.radius = radius
  mesh.userData.srcBlockId = blockId

  if (threeObjStore) threeObjStore[blockId] = mesh
  return mesh
}

let REGISTERED = false

export function initGeoSphereBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.geo_sphere = {
    init() {
      this.appendDummyInput().appendField('Sphere')
      this.setStyle(BLOCK_STYLES.CREATE_SOLIDS)
      this.setTooltip('Geometric Sphere Object')
      this.setDeletable(true)
      this.setMovable(true)
      this.setOutput(true, 'obj3D')
      this.appendDummyInput()
        .appendField('Radius:')
        .appendField(new Blockly.FieldNumber(1, 0.01, Infinity, 0.1), 'RADIUS')
      this.appendValueInput('CENTRE').appendField('Centre:').setCheck('vector3')
    },
  }

  javascriptGenerator.forBlock.geo_sphere = function (block, generator) {
    const valueToCode = (name) =>
      block.getInput(name) ? generator.valueToCode(block, name, Order.FUNCTION_CALL) : ''
    const centre =
      valueToCode('CENTRE') ||
      valueToCode('pos') ||
      'new THREE.Vector3()'
    const radius = Number(block.getFieldValue('RADIUS') ?? block.getFieldValue('R'))
    const blockId = JSON.stringify(block.id)
    const code = `(${geoSphereDefinition.toString()})(${centre}, ${radius}, ${blockId}, THREE, threeObjStore)`

    return [code, Order.FUNCTION_CALL]
  }
}
