import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { forInstance } from '@/store/colorSystem'
import { FieldObjectName } from '@/components/BlocksCanvas/blocks/naming/FieldObjectName'

function geoParametricPlaneDefinition(
  pointInput,
  normInput,
  normLabel,
  blockId,
  THREE,
  threeObjStore,
) {
  const point = pointInput?.isVector3 ? pointInput.clone() : new THREE.Vector3()
  let normalRaw = normInput?.isVector3 ? normInput.clone() : new THREE.Vector3(0, 1, 0)
  let normalLength = normalRaw.length()

  if (!Number.isFinite(normalLength) || normalLength === 0) {
    normalRaw = new THREE.Vector3(0, 1, 0)
    normalLength = 1
  }

  const normalUnit = normalRaw.clone().normalize()
  // This instance's colors, from the shared object-color framework
  // (colorSystem.js) -- the "Plane" family for the plane's own fill/edges/
  // normal arrow, and "Point" for the defining point marker.
  const planeColor = window.GeoScratchColors.forInstance('plane', blockId)
  const planeFillColor = window.GeoScratchColors.forInstanceVariant('plane', blockId, 35)
  const pointColor = window.GeoScratchColors.forInstance('point', blockId)
  const planeRotation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    normalUnit,
  )
  // Center the patch on the plane near the origin, then fit an intact square
  // two units inside the scene walls. Its size must not depend on the chosen point.
  const planeCenter = normalUnit.clone().multiplyScalar(normalUnit.dot(point))
  const u = new THREE.Vector3(1, 0, 0).applyQuaternion(planeRotation)
  const v = new THREE.Vector3(0, 1, 0).applyQuaternion(planeRotation)
  let halfSize = window.__geoScratchRuntimeMode === 'exercise-2' ? 14 : 24
  for (const axis of ['x', 'y', 'z']) {
    const room = Math.max(0, 18 - Math.abs(planeCenter[axis]))
    const span = Math.abs(u[axis]) + Math.abs(v[axis])
    if (span > 1e-10) halfSize = Math.min(halfSize, room / span)
    if (Math.abs(planeCenter[axis]) > 18) halfSize = 0
  }
  const planeSize = halfSize * 2
  const planeGeom = new THREE.PlaneGeometry(planeSize, planeSize)
  const planeMat = new THREE.MeshStandardMaterial({
    color: planeFillColor,
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
    new THREE.LineBasicMaterial({ color: planeColor, transparent: true, opacity: 0.9 }),
  )
  plane.add(planeEdges)
  plane.setRotationFromQuaternion(planeRotation)
  plane.position.copy(planeCenter)

  // Point + normal glyph: the two pieces of data that actually define this
  // plane, shown alongside the plane mesh whenever the "Show Point &
  // Normal" setting is on. Visibility is toggled in place (not rebuilt) so
  // flipping the setting doesn't touch the plane mesh itself.
  const pointMarker = window.geoPointMarker({
    color: pointColor,
    geoType: 'parametric_plane_point_marker',
    srcBlockId: blockId,
  })
  pointMarker.position.copy(point)

  // buildVectorShaftGlyph self-unsubscribes from settings once
  // threeObjStore no longer holds it under the id it was given -- so it
  // needs its own key distinct from the plane's own blockId (which
  // threeObjStore maps to the outer group, not this arrow).
  const normalArrowId = blockId + '_normal'
  const normalArrow = window.buildVectorShaftGlyph(
    THREE,
    normalArrowId,
    point.clone(),
    normalUnit.clone(),
    normalLength,
    planeColor,
  )
  normalArrow.userData.geoType = 'parametric_plane_normal_arrow'
  normalArrow.userData.srcBlockId = blockId
  if (threeObjStore) threeObjStore[normalArrowId] = normalArrow

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
  group.userData.planeCenter = plane.position.clone()
  group.userData.normalRaw = normalRaw.clone()
  group.userData.normalUnit = normalUnit.clone()
  group.userData.planeSize = planeSize
  group.userData.labelAnchors = {
    point: { type: 'world', position: [point.x, point.y, point.z] },
  }
  group.userData.labels = [
    {
      anchor: 'point',
      name: window.geoNaming?.nameFor?.(blockId) || 'Plane',
      value:
        'point ' +
        window.vectorNotation.formatVector(point) +
        ', normal ' +
        window.vectorNotation.formatVector(normalUnit),
      distanceFactor: 8,
      offset: [0.12, 0.12, 0],
      color: planeColor,
    },
  ]

  plane.userData = Object.assign(plane.userData || {}, {
    geoType: 'plane_mesh',
    srcBlockId: blockId,
  })

  if (threeObjStore) threeObjStore[blockId] = group
  return group
}

let REGISTERED = false

export function initParametricPlaneBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.parametric_plane = {
    init() {
      this.appendDummyInput()
        .appendField('Plane')
        .appendField(new FieldObjectName(), 'GEOSCRATCH_NAME')
      this.appendValueInput('point').appendField('Point:').setCheck('vector3')
      this.appendValueInput('norm').appendField('Normal:').setCheck('vector3')
      this.setStyle(BLOCK_STYLES.CREATE_PLANE)
      this.setColour(forInstance('plane', this.id))
      this.setTooltip('Plane defined by a point p and a normal n (normalized internally).')
      this.setDeletable(true)
      this.setMovable(true)
      this.setOutput(true, 'obj3D')
    },
  }

  javascriptGenerator.forBlock.parametric_plane = function (block, generator) {
    const point =
      generator.valueToCode(block, 'point', Order.FUNCTION_CALL) || 'new THREE.Vector3()'
    const norm =
      generator.valueToCode(block, 'norm', Order.FUNCTION_CALL) || 'new THREE.Vector3(0,1,0)'
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
