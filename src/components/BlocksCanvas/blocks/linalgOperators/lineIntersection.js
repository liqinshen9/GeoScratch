import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

function lineIntersectionDefinition(lineAInput, lineBInput, blockId, THREE, threeObjStore) {
  const getLineData = (input) => {
    if (!input?.isObject3D || input.userData?.geoType !== 'geo_vector_line') return null
    const origin = input.userData.origin?.isVector3 ? input.userData.origin.clone() : null
    const direction = input.userData.direction?.isVector3 ? input.userData.direction.clone() : null
    if (!origin || !direction || direction.lengthSq() < 1e-12) return null
    return { origin, direction }
  }

  const fmt = (value) => {
    if (!Number.isFinite(value)) return '?'
    const rounded = Number(value.toFixed(3))
    return Object.is(rounded, -0) ? '0' : String(rounded)
  }
  const fmtVec = (vec) => `[${fmt(vec.x)}, ${fmt(vec.y)}, ${fmt(vec.z)}]`

  const group = new THREE.Group()
  const lineA = getLineData(lineAInput)
  const lineB = getLineData(lineBInput)

  group.userData.geoType = 'geo_line_intersection'
  group.userData.srcBlockId = blockId
  group.userData.hasIntersection = false
  group.userData.status = 'missing-lines'

  const markerMaterial = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.34, metalness: 0.08 })
  const marker = (position, color, radius = 0.12) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), markerMaterial(color))
    mesh.position.copy(position)
    return mesh
  }

  if (!lineA || !lineB) {
    const fallback = marker(new THREE.Vector3(), 0xef4444, 0.1)
    group.add(fallback)
    group.userData.labels = [
      { anchor: 'status', text: 'Connect two vector lines', distanceFactor: 8, offset: [0.12, 0.12, 0] },
    ]
    group.userData.labelAnchors = { status: { type: 'world', position: [0, 0, 0] } }
    if (threeObjStore) threeObjStore[blockId] = group
    return group
  }

  const p1 = lineA.origin
  const d1 = lineA.direction
  const p3 = lineB.origin
  const d2 = lineB.direction

  const w0 = p1.clone().sub(p3)
  const a = d1.dot(d1)
  const b = d1.dot(d2)
  const c = d2.dot(d2)
  const d = d1.dot(w0)
  const e = d2.dot(w0)
  const denominator = a * c - b * b

  if (Math.abs(denominator) < 1e-10) {
    const midpoint = p1.clone().add(p3).multiplyScalar(0.5)
    group.add(marker(midpoint, 0xef4444, 0.1))
    group.userData.status = 'parallel'
    group.userData.point = midpoint.clone()
    group.userData.labels = [
      { anchor: 'status', text: 'No unique intersection: lines are parallel', distanceFactor: 8, offset: [0.12, 0.12, 0] },
    ]
    group.userData.labelAnchors = { status: { type: 'world', position: [midpoint.x, midpoint.y, midpoint.z] } }
    if (threeObjStore) threeObjStore[blockId] = group
    return group
  }

  const tA = (b * e - c * d) / denominator
  const tB = (a * e - b * d) / denominator
  const pointA = p1.clone().addScaledVector(d1, tA)
  const pointB = p3.clone().addScaledVector(d2, tB)
  const midpoint = pointA.clone().add(pointB).multiplyScalar(0.5)
  const distance = pointA.distanceTo(pointB)
  const hasIntersection = distance <= 1e-4

  group.add(marker(midpoint, hasIntersection ? 0x22c55e : 0xf59e0b, hasIntersection ? 0.14 : 0.11))

  if (!hasIntersection) {
    const segmentGeometry = new THREE.BufferGeometry().setFromPoints([pointA, pointB])
    group.add(new THREE.Line(segmentGeometry, new THREE.LineBasicMaterial({ color: 0xf59e0b })))
    group.add(marker(pointA, 0x60a5fa, 0.07))
    group.add(marker(pointB, 0xfb7185, 0.07))
  }

  group.userData.hasIntersection = hasIntersection
  group.userData.status = hasIntersection ? 'intersects' : 'skew'
  group.userData.point = midpoint.clone()
  group.userData.closestPointA = pointA.clone()
  group.userData.closestPointB = pointB.clone()
  group.userData.tA = tA
  group.userData.tB = tB
  group.userData.distance = distance
  group.userData.labelAnchors = {
    point: { type: 'world', position: [midpoint.x, midpoint.y, midpoint.z] },
  }
  group.userData.labels = [
    {
      anchor: 'point',
      text: hasIntersection
        ? `intersection ${fmtVec(midpoint)}; t1=${fmt(tA)}, t2=${fmt(tB)}`
        : `closest midpoint ${fmtVec(midpoint)}; gap=${fmt(distance)}`,
      distanceFactor: 8,
      offset: [0.12, 0.12, 0],
    },
  ]

  if (threeObjStore) threeObjStore[blockId] = group
  return group
}

let REGISTERED = false

export function initLineIntersectionBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.line_intersection_3d = {
    init() {
      this.appendDummyInput().appendField('Intersect 3D lines')
      this.appendValueInput('LINE_A').setCheck('obj3D').appendField('line 1:')
      this.appendValueInput('LINE_B').setCheck('obj3D').appendField('line 2:')
      this.setInputsInline(false)
      this.setOutput(true, 'obj3D')
      this.setStyle(BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS)
      this.setTooltip('Find the intersection of two 3D vector lines, or show the closest midpoint when they are skew.')
      this.setDeletable(true)
      this.setMovable(true)
    },
  }

  javascriptGenerator.forBlock.line_intersection_3d = function (block, generator) {
    const lineA = generator.valueToCode(block, 'LINE_A', Order.FUNCTION_CALL) || 'null'
    const lineB = generator.valueToCode(block, 'LINE_B', Order.FUNCTION_CALL) || 'null'
    const blockId = JSON.stringify(block.id)
    const code = `(${lineIntersectionDefinition.toString()})(${lineA}, ${lineB}, ${blockId}, THREE, threeObjStore)`

    return [code, Order.FUNCTION_CALL]
  }
}
