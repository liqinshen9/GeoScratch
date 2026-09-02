import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { forInstance } from '@/store/colorSystem'

function geoSphereDefinition(centreInput, radiusInput, blockId) {
  const THREE = window.THREE
  const threeObjStore = window.threeObjStore
  const useSettingsStore = window.useSettingsStore
  if (!THREE) return null
  const centre = centreInput?.isVector3 ? centreInput.clone() : new THREE.Vector3()
  const radius = Math.max(0.01, Number(radiusInput) || 1)
  const formatCenterPoint = (point) => '[' + [point.x, point.y, point.z].map((value) => Number(value.toFixed(3))).join(', ') + ']'
  const geometry = new THREE.SphereGeometry(radius, 32, 16)
  const material = new THREE.MeshStandardMaterial({
    color: window.GeoScratchColors.forInstance('sphere', blockId),
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
  const centreMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 18, 12),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.35, metalness: 0.05 })
  )
  centreMarker.userData.geoType = 'sphere_center_marker'
  centreMarker.userData.srcBlockId = blockId
  centreMarker.userData.zoomInvariantRadius = 0.075
  centreMarker.userData.zoomInvariantUniform = true
  mesh.add(centreMarker)

  edges.visible = !!useSettingsStore?.getState().settings.sphereShowGridlines
  if (useSettingsStore) {
    const unsubscribe = useSettingsStore.subscribe((state) => {
      if (window.threeObjStore?.[blockId] !== mesh) {
        unsubscribe()
        return
      }
      edges.visible = !!state.settings.sphereShowGridlines
      material.color.set(window.GeoScratchColors.forInstance('sphere', blockId))
    })
  }

  mesh.userData.geoType = 'geo_sphere'
  mesh.userData.centre = centre.clone()
  mesh.userData.radius = radius
  mesh.userData.srcBlockId = blockId
  mesh.userData.labelAnchors = {
    centre: { type: 'world', position: [centre.x, centre.y, centre.z] },
  }
  mesh.userData.labels = [
    {
      anchor: 'centre',
      text: 'center point = ' + formatCenterPoint(centre),
      distanceFactor: 7,
      offset: [0.12, 0.12, 0],
      color: '#111827',
    },
  ]
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
      this.setStyle(BLOCK_STYLES.CREATE_SPHERE)
      this.setColour(forInstance('sphere', this.id))
      this.setTooltip('Geometric Sphere Object')
      this.setDeletable(true)
      this.setMovable(true)
      this.setOutput(true, 'obj3D')
      this.appendValueInput('RADIUS_INPUT').appendField('Radius:').setCheck('scalar')
      this.appendValueInput('CENTRE').appendField('Centre:').setCheck('vector3')
    },
  }
  javascriptGenerator.forBlock.geo_sphere = function(block, generator) {
    const valueToCode = (name) =>
      block.getInput(name) ? generator.valueToCode(block, name, Order.FUNCTION_CALL) : ''
    // Fall back safely to window scope context inside the output execution block string
    const centre = valueToCode('CENTRE') || 'new window.THREE.Vector3(0,0,0)'
    const radius = valueToCode('RADIUS_INPUT') || '1'
    const blockId = JSON.stringify(block.id)
    const code = `(${geoSphereDefinition.toString()})(${centre}, ${radius}, ${blockId})`
    return [code, Order.FUNCTION_CALL]
  }
}
