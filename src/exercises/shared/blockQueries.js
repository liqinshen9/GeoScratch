import THREE from '@/utils/three'
import { ANSWER_GEOMETRY_TYPES } from '@/utils/answerGeometry'
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

// The object carrying a distance VALUE is not always the object that shows it:
// a point-plane magnitude group holds the number and the d = ... label but no
// geometry at all, while the bar you actually see is a nested distance_segment.
// Exercises name the visible one as their answer target so the scene has
// something to glow.
function findAnswerGeometry(objects) {
  let found = null
  const visit = (node) => {
    if (found || !node) return
    if (ANSWER_GEOMETRY_TYPES.has(node.userData?.geoType)) {
      found = node
      return
    }
    node.children?.forEach(visit)
  }
  ;(objects || []).forEach(visit)
  return found
}

function objectOrChildMatches(object, predicate) {
  if (!object?.isObject3D) return false
  let matched = false
  object.traverse((child) => {
    if (!matched && predicate(child)) matched = true
  })
  return matched
}

// geo_variable is a pass-through wrapper: naming a value plugs it into one, and
// the wrapper then behaves exactly as the block it holds. Every structural check
// here has to see the wrapped block rather than the wrapper, or naming an input
// silently fails the step that walks to it.
// See docs/architecture/blockly-integration.md#the-variable-wrappers-block-layout.
function getInputBlock(block, inputName) {
  let target = block?.getInputTargetBlock?.(inputName) ?? null
  // Bounded rather than a bare while: a malformed chain must not hang a checker
  // that runs on every workspace edit.
  for (let depth = 0; target?.type === 'geo_variable' && depth < 8; depth++) {
    target = target.getInputTargetBlock?.('VALUE') ?? null
  }
  return target
}

// parametric_plane falls back to +Y when its normal socket is empty or holds a
// zero-length vector, and renders the unit normal rather than the raw one (see
// blocks/geometric/parametricPlane.js). A checker that compares the socket's
// block directly therefore rejects planes the app itself renders as correct:
// leave the socket empty on a +Y plane and the object check passes while the
// block check fails. Read the effective normal instead.
function planeNormalFromBlock(planeBlock) {
  const raw = vec3FromBlock(getInputBlock(planeBlock, 'norm'))
  const length = raw ? raw.length() : 0
  if (!raw || !Number.isFinite(length) || length === 0) return new THREE.Vector3(0, 1, 0)
  return raw.normalize()
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
  findAnswerGeometry,
  getInputBlock,
  planeNormalFromBlock,
  scalarInputMatches,
  isSphereBlock,
  isLineBlock,
  blockTreeContains,
}
