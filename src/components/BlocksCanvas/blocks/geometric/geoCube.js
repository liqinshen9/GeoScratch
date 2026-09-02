import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { forInstance } from '@/store/colorSystem'

function geoCubeDefinition(centreInput, sideLengthInput, blockId) {
  // Pull context strictly from the window where Three has been cleanly mounted
  const THREE = window.THREE
  const threeObjStore = window.threeObjStore
  const useSettingsStore = window.useSettingsStore

  if (!THREE) return null

  const centre = centreInput?.isVector3 ? centreInput.clone() : new THREE.Vector3()
  const sideLength = Math.max(0.0001, Number(sideLengthInput) || 1)
  const geometry = new THREE.BoxGeometry(sideLength, sideLength, sideLength)
  const material = new THREE.MeshStandardMaterial({
    color: window.GeoScratchColors.forInstance('cube', blockId),
    roughness: 0.5,
    metalness: 0.1,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(centre)

  mesh.castShadow = true
  mesh.receiveShadow = true

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ transparent: true, opacity: 0.25, color: 0xffffff })
  )
  mesh.add(edges)

  edges.visible = !!useSettingsStore?.getState().settings.cubeShowEdges
  if (useSettingsStore) {
    const unsubscribeEdges = useSettingsStore.subscribe((state) => {
      if (window.threeObjStore?.[blockId] !== mesh) {
        unsubscribeEdges()
        return
      }
      edges.visible = !!state.settings.cubeShowEdges
    })
  }

  mesh.userData.geoType = 'geo_cube'
  mesh.userData.centre = centre.clone()
  mesh.userData.center = centre.clone()
  mesh.userData.sideLength = sideLength
  mesh.userData.side = sideLength
  mesh.userData.srcBlockId = blockId

  if (threeObjStore) threeObjStore[blockId] = mesh

  const unsubscribe = window.GeoScratchColors.subscribeToPreset(() => {
    if (window.threeObjStore?.[blockId] !== mesh) {
      unsubscribe()
      return
    }
    material.color.set(window.GeoScratchColors.forInstance('cube', blockId))
  })

  return mesh
}

let REGISTERED = false

export default function initGeoCubeBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.geo_cube = {
    init() {
      this.appendDummyInput().appendField('Cube')
      this.setStyle(BLOCK_STYLES.CREATE_CUBE)
      this.setColour(forInstance('cube', this.id))
      this.setTooltip('Axis-aligned cube defined by centre and side length.')
      this.setDeletable(true)
      this.setMovable(true)
      this.setOutput(true, 'obj3D')
      this.appendValueInput('SIDE_LENGTH_INPUT').appendField('Side length:').setCheck('scalar')
      this.appendValueInput('CENTRE').appendField('Centre:').setCheck('vector3')
    },
  }

  javascriptGenerator.forBlock.geo_cube = function(block, generator) {
    const valueToCode = (name) =>
      block.getInput(name) ? generator.valueToCode(block, name, Order.FUNCTION_CALL) : ''

    // Fall back safely to window scope context inside the output execution block string
    const centre = valueToCode('CENTRE') || 'new window.THREE.Vector3(0,0,0)'
    const sideLength = valueToCode('SIDE_LENGTH_INPUT') || '1'
    const blockId = JSON.stringify(block.id)

    const code = `(${geoCubeDefinition.toString()})(${centre}, ${sideLength}, ${blockId})`

    return [code, Order.FUNCTION_CALL]
  }
}
