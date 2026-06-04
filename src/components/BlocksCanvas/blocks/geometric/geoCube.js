import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

function geoCubeDefinition(centreInput, sideLengthInput, blockId, THREE, threeObjStore) {
  const centre = centreInput?.isVector3 ? centreInput.clone() : new THREE.Vector3()
  const sideLength = Math.max(0.0001, Number(sideLengthInput) || 1)
  const geometry = new THREE.BoxGeometry(sideLength, sideLength, sideLength)
  const material = new THREE.MeshStandardMaterial({
    color: 0x8b5cf6,
    roughness: 0.5,
    metalness: 0.1,
    transparent: true,
    opacity: 0.7,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(centre)

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ transparent: true, opacity: 0.25 })
  )
  mesh.add(edges)

  mesh.userData.geoType = 'geo_cube'
  mesh.userData.centre = centre.clone()
  mesh.userData.center = centre.clone()
  mesh.userData.sideLength = sideLength
  mesh.userData.side = sideLength
  mesh.userData.srcBlockId = blockId

  if (threeObjStore) threeObjStore[blockId] = mesh
  return mesh
}

let REGISTERED = false

export default function initGeoCubeBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.geo_cube = {
    init() {
      this.appendDummyInput().appendField('Cube')
      this.setStyle(BLOCK_STYLES.CREATE_SOLIDS)
      this.setTooltip('Axis-aligned cube defined by centre and side length.')
      this.setDeletable(true)
      this.setMovable(true)
      this.setOutput(true, 'obj3D')
      this.appendDummyInput('SIDE_ROW')
        .appendField('Side length:')
        .appendField(new Blockly.FieldNumber(1, 0.0001, Infinity, 0.1), 'SIDE_LENGTH')
      this.appendValueInput('CENTRE').appendField('Centre:').setCheck('vector3')
    },
  }

  javascriptGenerator.forBlock.geo_cube = function (block, generator) {
    const valueToCode = (name) =>
      block.getInput(name) ? generator.valueToCode(block, name, Order.FUNCTION_CALL) : ''
    const centre =
      valueToCode('CENTRE') ||
      valueToCode('center') ||
      'new THREE.Vector3(0,0,0)'
    const sideLength = Number(block.getFieldValue('SIDE_LENGTH') ?? block.getFieldValue('SIDE'))
    const blockId = JSON.stringify(block.id)
    const code = `(${geoCubeDefinition.toString()})(${centre}, ${sideLength}, ${blockId}, THREE, threeObjStore)`

    return [code, Order.FUNCTION_CALL]
  }
}
