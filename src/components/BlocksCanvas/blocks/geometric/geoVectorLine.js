import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

function geoVectorLineDefinition(posInput, dirInput, tRaw, blockId, THREE, threeObjStore) {
  const getRawVector = (input) => {
    if (!input) return new THREE.Vector3()
    if (input.isVector3) return input.clone()
    if (input.isObject3D && input.userData?.direction) return input.userData.direction.clone()
    if (input.isObject3D && input.position) return input.position.clone()
    return new THREE.Vector3()
  }

  const origin = getRawVector(posInput)
  let direction = getRawVector(dirInput)
  if (!Number.isFinite(direction.length()) || direction.length() === 0) {
    direction = new THREE.Vector3(1, 0, 0)
  }

  const lineExtent = 20
  const normalised = direction.clone().normalize()
  const p1 = origin.clone().addScaledVector(normalised, -lineExtent)
  const p2 = origin.clone().addScaledVector(normalised, lineExtent)
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([p1, p2]),
    new THREE.LineBasicMaterial({ color: 0x6b7280 })
  )

  const sphereGeom = new THREE.SphereGeometry(0.05, 16, 12)
  const originSphere = new THREE.Mesh(
    sphereGeom,
    new THREE.MeshStandardMaterial({ color: 0x49a1ff, roughness: 0.4, metalness: 0.1 })
  )
  originSphere.position.copy(origin)

  const group = new THREE.Group()
  group.add(line, originSphere)

  if (typeof tRaw !== 'undefined' && Number.isFinite(Number(tRaw))) {
    const tVal = Number(tRaw)
    const rPoint = origin.clone().addScaledVector(direction, tVal)
    const tSphere = new THREE.Mesh(
      sphereGeom,
      new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.4, metalness: 0.1 })
    )
    tSphere.position.copy(rPoint)
    group.add(tSphere)
    group.userData.t = tVal
    group.userData.rPoint = rPoint.clone()
  } else {
    group.userData.t = undefined
    group.userData.rPoint = undefined
  }

  group.userData.geoType = 'geo_vector_line'
  group.userData.origin = origin.clone()
  group.userData.direction = direction.clone()
  group.userData.lineExtent = lineExtent
  group.userData.srcBlockId = blockId

  if (threeObjStore) threeObjStore[blockId] = group
  return group
}

let REGISTERED = false

export function initVector3Block() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.geo_vector = {
    init() {
      this.appendDummyInput().appendField('Vector Equation of Line')
      this.appendValueInput('POS').appendField('Position:').setCheck('vector3')
      this.appendValueInput('DIR').appendField('Direction:').setCheck('vector3')
      this.appendValueInput('SCALE').appendField('t:').setCheck('scalar')
      this.setStyle(BLOCK_STYLES.CREATE_POINTS_VECTORS)
      this.setTooltip('A line in R3 that passes through a specific point and runs parallel to the direction vector')
      this.setDeletable(true)
      this.setMovable(true)
      this.setOutput(true, 'obj3D')
    },
  }

  javascriptGenerator.forBlock.geo_vector = function (block, generator) {
    const valueToCode = (name) =>
      block.getInput(name) ? generator.valueToCode(block, name, Order.FUNCTION_CALL) : ''
    const vecPos =
      valueToCode('POS') ||
      valueToCode('pos') ||
      'new THREE.Vector3()'
    const vecDir =
      valueToCode('DIR') ||
      valueToCode('dir') ||
      'new THREE.Vector3(1,0,0)'
    const scaleInput = block.getInput('SCALE') ?? block.getInput('scale')
    const hasScaleInput = !!(scaleInput?.connection?.targetConnection)
    const vecScaleCode = hasScaleInput
      ? (
        valueToCode('SCALE') ||
        valueToCode('scale') ||
        '0'
      )
      : 'undefined'
    const blockId = JSON.stringify(block.id)
    const code = `(${geoVectorLineDefinition.toString()})(${vecPos}, ${vecDir}, ${vecScaleCode}, ${blockId}, THREE, threeObjStore)`

    return [code, Order.FUNCTION_CALL]
  }
}
