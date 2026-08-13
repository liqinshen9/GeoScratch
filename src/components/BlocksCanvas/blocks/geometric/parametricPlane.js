import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

function geoParametricPlaneDefinition(pointInput, normInput, normLabel, blockId, THREE, threeObjStore) {
  const point = pointInput?.isVector3 ? pointInput.clone() : new THREE.Vector3()
  let normalRaw = normInput?.isVector3 ? normInput.clone() : new THREE.Vector3(0, 1, 0)
  let normalLength = normalRaw.length()

  if (!Number.isFinite(normalLength) || normalLength === 0) {
    normalRaw = new THREE.Vector3(0, 1, 0)
    normalLength = 1
  }

  const normalUnit = normalRaw.clone().normalize()
  const planeSize = window.__geoScratchRuntimeMode === 'exercise-2' ? 28 : 12
  const planeGeom = new THREE.PlaneGeometry(planeSize, planeSize)
  const planeMat = new THREE.MeshStandardMaterial({
    color: 0xbfdbfe,
    transparent: true,
    opacity: 0.42,
    roughness: 0.55,
    metalness: 0.02,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const plane = new THREE.Mesh(planeGeom, planeMat)
  const planeEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(planeGeom),
    new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.9 })
  )
  plane.add(planeEdges)
  plane.setRotationFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normalUnit)
  )
  plane.position.copy(point)

  // Point + normal glyph: the two pieces of data that actually define this
  // plane, shown alongside the plane mesh whenever the "Show Point &
  // Normal" setting is on. Visibility is toggled in place (not rebuilt) so
  // flipping the setting doesn't touch the plane mesh itself.
  const pointMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.35, metalness: 0.05 })
  )
  pointMarker.position.copy(point)
  pointMarker.userData.zoomInvariantRadius = 0.24
  pointMarker.userData.zoomInvariantUniform = true
  pointMarker.userData.geoType = 'parametric_plane_point_marker'
  pointMarker.userData.srcBlockId = blockId

  const normalArrow = new THREE.ArrowHelper(normalUnit, point, normalLength, 0x3b82f6, 0.25, 0.1)
  normalArrow.userData.geoType = 'parametric_plane_normal_arrow'
  normalArrow.userData.srcBlockId = blockId

  const pointNormalGroup = new THREE.Group()
  pointNormalGroup.add(pointMarker, normalArrow)
  pointNormalGroup.userData.geoType = 'parametric_plane_point_normal_group'

  const group = new THREE.Group()
  group.add(plane, pointNormalGroup)

  const applyPointNormalVisibility = (settings) => {
    pointNormalGroup.visible = settings?.showPlanePointNormal !== false
  }
  applyPointNormalVisibility(window.useSettingsStore?.getState().settings)
  if (window.useSettingsStore) {
    const unsubscribe = window.useSettingsStore.subscribe((state) => {
      if (window.threeObjStore?.[blockId] !== group) {
        unsubscribe()
        return
      }
      applyPointNormalVisibility(state.settings)
    })
  }

  group.userData.geoType = 'point_normal_plane_group'
  group.userData.srcBlockId = blockId
  group.userData.point = point.clone()
  group.userData.normalRaw = normalRaw.clone()
  group.userData.normalUnit = normalUnit.clone()
  group.userData.planeSize = planeSize
  group.userData.labelAnchors = {}
  group.userData.labels = []

  plane.userData = Object.assign(plane.userData || {}, { geoType: 'plane_mesh', srcBlockId: blockId })

  if (threeObjStore) threeObjStore[blockId] = group
  return group
}

let REGISTERED = false

export function initParametricPlaneBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.parametric_plane = {
    init() {
      this.appendDummyInput().appendField('Plane (Point-Normal)')
      this.appendValueInput('point').appendField('Point:').setCheck('vector3')
      this.appendValueInput('norm').appendField('Normal:').setCheck('vector3')
      this.setStyle(BLOCK_STYLES.CREATE_LINES_PLANES)
      this.setTooltip('Plane defined by a point p and a normal n (normalized internally).')
      this.setDeletable(true)
      this.setMovable(true)
      this.setOutput(true, 'obj3D')
    },
  }

  javascriptGenerator.forBlock.parametric_plane = function(block, generator) {
    const point = generator.valueToCode(block, 'point', Order.FUNCTION_CALL) || 'new THREE.Vector3()'
    const norm = generator.valueToCode(block, 'norm', Order.FUNCTION_CALL) || 'new THREE.Vector3(0,1,0)'
    const normalLabel = (() => {
      try {
        const target = block.getInputTargetBlock?.('norm')
        if (!target || typeof target.getFieldValue !== 'function') return 'n'
        const fields = ['NAME', 'Label', 'LABEL', 'VAR', 'Var', 'ID', 'TITLE', 'TEXT']
        for (const field of fields) {
          const value = target.getFieldValue(field)
          if (value) return String(value)
        }
        return target.type || 'n'
      } catch {
        return 'n'
      }
    })()
    const blockId = JSON.stringify(block.id)
    const code = `(${geoParametricPlaneDefinition.toString()})(${point}, ${norm}, ${JSON.stringify(normalLabel)}, ${blockId}, THREE, threeObjStore)`

    return [code, Order.FUNCTION_CALL]
  }
}

export default initParametricPlaneBlock
