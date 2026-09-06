import THREE from '@/utils/three'
import { getScalarInputValue } from '@/utils/sceneHelpers'

/**
 * Generic predicates for inspecting a Blockly workspace. Nothing here knows
 * about any particular exercise -- per-exercise checks live in the exercise
 * module that uses them.
 */

export const POINT_VECTOR_BLOCK_TYPES = ['linalg_vec3', 'linalg_point']

function closeNumber(a, b, tolerance = 1e-6) {
  return Math.abs(Number(a) - b) <= tolerance
}

function blockMatchesVec3(block, target) {
  return (
    POINT_VECTOR_BLOCK_TYPES.includes(block?.type) &&
    closeNumber(block.getFieldValue('X'), target.x) &&
    closeNumber(block.getFieldValue('Y'), target.y) &&
    closeNumber(block.getFieldValue('Z'), target.z)
  )
}

function vec3FromBlock(block) {
  if (!POINT_VECTOR_BLOCK_TYPES.includes(block?.type)) return null
  const x = Number(block.getFieldValue('X'))
  const y = Number(block.getFieldValue('Y'))
  const z = Number(block.getFieldValue('Z'))
  return [x, y, z].every(Number.isFinite) ? new THREE.Vector3(x, y, z) : null
}

function vectorMatches(a, b, tolerance = 1e-6) {
  return (
    a?.isVector3 &&
    b?.isVector3 &&
    closeNumber(a.x, b.x, tolerance) &&
    closeNumber(a.y, b.y, tolerance) &&
    closeNumber(a.z, b.z, tolerance)
  )
}

function vectorsAreParallel(a, b, tolerance = 1e-6) {
  return (
    a?.isVector3 &&
    b?.isVector3 &&
    a.lengthSq() > tolerance &&
    b.lengthSq() > tolerance &&
    new THREE.Vector3().crossVectors(a, b).length() <= tolerance * a.length() * b.length()
  )
}

function pointBlockLiesOnLine(block, linePoint, lineDirection, tolerance = 1e-6) {
  if (
    block?.type === 'geo_show_point_on_object' &&
    isLineBlock(getInputBlock(block, 'OBJECT'), linePoint, lineDirection)
  ) {
    return true
  }

  const point = vec3FromBlock(block)
  if (!point) return false
  return (
    new THREE.Vector3().crossVectors(point.clone().sub(linePoint), lineDirection).length() <=
    tolerance * Math.max(1, lineDirection.length())
  )
}

function objectOrChildMatches(object, predicate) {
  if (!object?.isObject3D) return false
  let matched = false
  object.traverse((child) => {
    if (!matched && predicate(child)) matched = true
  })
  return matched
}

function getInputBlock(block, inputName) {
  return block?.getInputTargetBlock?.(inputName) ?? null
}

function scalarInputMatches(block, inputName, target, fallback = 0) {
  return Boolean(
    block?.getInputTargetBlock?.(inputName) &&
    closeNumber(getScalarInputValue(block, inputName, null, fallback), target),
  )
}

function isSphereBlock(block, centre, radius) {
  return (
    block?.type === 'geo_sphere' &&
    blockMatchesVec3(getInputBlock(block, 'CENTRE'), centre) &&
    scalarInputMatches(block, 'RADIUS_INPUT', radius, 1)
  )
}

function isLineBlock(block, point, direction) {
  return (
    block?.type === 'geo_vector' &&
    blockMatchesVec3(getInputBlock(block, 'POS'), point) &&
    blockMatchesVec3(getInputBlock(block, 'DIR'), direction)
  )
}

function blockTreeContains(block, predicate, visited = new Set()) {
  if (!block || visited.has(block.id)) return false
  visited.add(block.id)
  if (predicate(block)) return true
  return (block.inputList || []).some((input) =>
    blockTreeContains(input.connection?.targetBlock?.(), predicate, visited),
  )
}

export {
  closeNumber,
  blockMatchesVec3,
  vec3FromBlock,
  vectorMatches,
  vectorsAreParallel,
  pointBlockLiesOnLine,
  objectOrChildMatches,
  getInputBlock,
  scalarInputMatches,
  isSphereBlock,
  isLineBlock,
  blockTreeContains,
}
