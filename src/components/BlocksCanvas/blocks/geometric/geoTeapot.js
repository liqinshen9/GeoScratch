import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { forInstance } from '@/store/colorSystem'

function geoTeapotDefinition(centreInput, sizeInput, segmentsInput, blockId) {
  const THREE = window.THREE
  const threeObjStore = window.threeObjStore
  const useSettingsStore = window.useSettingsStore
  if (!THREE) return null
  if (!THREE.TeapotGeometry) {
    console.warn('geo_teapot: THREE.TeapotGeometry is not registered on window.THREE. Load the TeapotGeometry addon module first.')
    return null
  }

  const centre = centreInput?.isVector3 ? centreInput.clone() : new THREE.Vector3()
  const size = Math.max(0.01, Number(sizeInput) || 1)
  const segments = Math.max(2, Math.round(Number(segmentsInput) || 10))

  // (size, segments, lid, body, fitLid, blinnScale)
  const geometry = new THREE.TeapotGeometry(size, segments, true, true, true, true)
  const material = new THREE.MeshStandardMaterial({
    color: window.GeoScratchColors.forInstance('teapot', blockId),
    roughness: 0.5,
    metalness: 0.1,
    opacity: 0.8,
    transparent: true,
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

  edges.visible = !!useSettingsStore?.getState().settings.teapotShowGridlines
  if (useSettingsStore) {
    const unsubscribe = useSettingsStore.subscribe((state) => {
      if (window.threeObjStore?.[blockId] !== mesh) {
        unsubscribe()
        return
      }
      edges.visible = !!state.settings.teapotShowGridlines
      material.color.set(window.GeoScratchColors.forInstance('teapot', blockId))
    })
  }

  mesh.userData.geoType = 'geo_teapot'
  mesh.userData.centre = centre.clone()
  mesh.userData.size = size
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
      this.setStyle(BLOCK_STYLES.CREATE_TEAPOT)
      this.setColour(forInstance('teapot', this.id))
      this.setTooltip('Utah Teapot Object')
      this.setDeletable(true)
      this.setMovable(true)
      this.setOutput(true, 'obj3D')

      this.appendValueInput('SIZE_INPUT').appendField('Size:').setCheck('scalar')

      this.appendValueInput('CENTRE').appendField('Centre:').setCheck('vector3')

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
    const size = valueToCode('SIZE_INPUT') || 1
    const segments = Number(block.getFieldValue('SEGMENTS'))
    const blockId = JSON.stringify(block.id)
    const code = `(${geoTeapotDefinition.toString()})(${centre}, ${size}, ${segments}, ${blockId})`
    return [code, Order.FUNCTION_CALL]
  }
}
