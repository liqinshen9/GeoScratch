import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

function geoTeapotDefinition(centreInput, sizeInput, rotXInput, rotYInput, rotZInput, segmentsInput, blockId) {
  const THREE = window.THREE
  const threeObjStore = window.threeObjStore
  if (!THREE) return null
  if (!THREE.TeapotGeometry) {
    console.warn('geo_teapot: THREE.TeapotGeometry is not registered on window.THREE. Load the TeapotGeometry addon module first.')
    return null
  }

  const centre = centreInput?.isVector3 ? centreInput.clone() : new THREE.Vector3()
  const size = Math.max(0.01, Number(sizeInput) || 1)
  const segments = Math.max(2, Math.round(Number(segmentsInput) || 10))
  const rotX = (Number(rotXInput) || 0) * (Math.PI / 180)
  const rotY = (Number(rotYInput) || 0) * (Math.PI / 180)
  const rotZ = (Number(rotZInput) || 0) * (Math.PI / 180)

  // (size, segments, lid, body, fitLid, blinnScale)
  const geometry = new THREE.TeapotGeometry(size, segments, true, true, true, true)
  const material = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    roughness: 0.5,
    metalness: 0.1,
    opacity: 0.8,
    transparent: true,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(centre)
  mesh.rotation.set(rotX, rotY, rotZ)
  mesh.castShadow = true
  mesh.receiveShadow = true

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ transparent: true, opacity: 0.25, color: 0xffffff })
  )
  mesh.add(edges)

  mesh.userData.geoType = 'geo_teapot'
  mesh.userData.centre = centre.clone()
  mesh.userData.size = size
  mesh.userData.rotation = { x: rotX, y: rotY, z: rotZ }
  mesh.userData.srcBlockId = blockId
  if (threeObjStore) threeObjStore[blockId] = mesh
  return mesh
}

let REGISTERED = false
export function initGeoTeapotBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.geo_teapot = {
    init() {
      this.appendDummyInput().appendField('Teapot')
      this.setStyle(BLOCK_STYLES.CREATE_SOLIDS)
      this.setTooltip('Utah Teapot Object')
      this.setDeletable(true)
      this.setMovable(true)
      this.setOutput(true, 'obj3D')

      this.appendDummyInput()
        .appendField('Size:')
        .appendField(new Blockly.FieldNumber(1, 0.01, Infinity, 0.1), 'SIZE')

      this.appendValueInput('CENTRE').appendField('Centre:').setCheck('vector3')

      this.appendDummyInput()
        .appendField('Rotation X:')
        .appendField(new Blockly.FieldNumber(0, -360, 360, 1), 'ROT_X')
        .appendField('Y:')
        .appendField(new Blockly.FieldNumber(0, -360, 360, 1), 'ROT_Y')
        .appendField('Z:')
        .appendField(new Blockly.FieldNumber(0, -360, 360, 1), 'ROT_Z')

      this.appendDummyInput()
        .appendField('Segments:')
        .appendField(new Blockly.FieldNumber(10, 2, 30, 1), 'SEGMENTS')
    },
  }

  javascriptGenerator.forBlock.geo_teapot = function(block, generator) {
    const valueToCode = (name) =>
      block.getInput(name) ? generator.valueToCode(block, name, Order.FUNCTION_CALL) : ''
    // Fall back safely to window scope context inside the output execution block string
    const centre = valueToCode('CENTRE') || 'new window.THREE.Vector3(0,0,0)'
    const size = Number(block.getFieldValue('SIZE'))
    const rotX = Number(block.getFieldValue('ROT_X'))
    const rotY = Number(block.getFieldValue('ROT_Y'))
    const rotZ = Number(block.getFieldValue('ROT_Z'))
    const segments = Number(block.getFieldValue('SEGMENTS'))
    const blockId = JSON.stringify(block.id)
    const code = `(${geoTeapotDefinition.toString()})(${centre}, ${size}, ${rotX}, ${rotY}, ${rotZ}, ${segments}, ${blockId})`
    return [code, Order.FUNCTION_CALL]
  }
}
