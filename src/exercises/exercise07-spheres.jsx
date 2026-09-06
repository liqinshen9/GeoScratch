import THREE from '@/utils/three'
import {
  blockMatchesVec3,
  blockTreeContains,
  closeNumber,
  getInputBlock,
  isSphereBlock,
} from './shared/blockQueries'

const SPHERE_A_CENTRE = new THREE.Vector3(-4, 2, 1)
const SPHERE_B_CENTRE = new THREE.Vector3(3, -1, 6)
const SPHERE_A_RADIUS = 1.3
const SPHERE_B_RADIUS = 0.9
const SPHERE_DISTANCE = Math.max(
  0,
  SPHERE_A_CENTRE.distanceTo(SPHERE_B_CENTRE) - SPHERE_A_RADIUS - SPHERE_B_RADIUS,
)

const SPHERE_DISTANCE_BLOCK_XML =
  '<xml xmlns="https://developers.google.com/blockly/xml"><block type="sphere_distance" x="0" y="0"></block></xml>'

function isSphereABlock(block) {
  return isSphereBlock(block, SPHERE_A_CENTRE, SPHERE_A_RADIUS)
}

function isSphereBBlock(block) {
  return isSphereBlock(block, SPHERE_B_CENTRE, SPHERE_B_RADIUS)
}

function hasSphereBlocks(workspace) {
  if (!workspace) return false
  const spheres = workspace.getBlocksByType('geo_sphere', false)
  return spheres.some(isSphereABlock) && spheres.some(isSphereBBlock)
}

function isSphereCenterDifferenceBlock(block) {
  if (block?.type !== 'vector_arithmetic' || block.getFieldValue('OP') !== 'subtract') return false
  const left = getInputBlock(block, 'U')
  const right = getInputBlock(block, 'V')
  return (
    (blockMatchesVec3(left, SPHERE_B_CENTRE) && blockMatchesVec3(right, SPHERE_A_CENTRE)) ||
    (blockMatchesVec3(left, SPHERE_A_CENTRE) && blockMatchesVec3(right, SPHERE_B_CENTRE))
  )
}

function hasSphereCenterDifferenceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_arithmetic', false).some(isSphereCenterDifferenceBlock)
}

function hasSphereCenterMagnitudeBlock(workspace) {
  if (!workspace) return false
  return workspace
    .getBlocksByType('vector_magnitude', false)
    .some((block) => isSphereCenterDifferenceBlock(getInputBlock(block, 'V')))
}

function isSphereCenterMagnitudeBlock(block) {
  return (
    block?.type === 'vector_magnitude' && isSphereCenterDifferenceBlock(getInputBlock(block, 'V'))
  )
}

function getSphereRadiusScalar(block) {
  if (block?.type !== 'scalar') return null
  if (closeNumber(block.getFieldValue('scalar'), SPHERE_A_RADIUS)) return 'a'
  if (closeNumber(block.getFieldValue('scalar'), SPHERE_B_RADIUS)) return 'b'
  return null
}

function isSphereRadiusSumBlock(block) {
  if (block?.type !== 'scalar_arithmetic' || block.getFieldValue('OP') !== 'add') return false
  const leftRadius = getSphereRadiusScalar(getInputBlock(block, 'A'))
  const rightRadius = getSphereRadiusScalar(getInputBlock(block, 'B'))
  return (
    new Set([leftRadius, rightRadius]).size === 2 && leftRadius !== null && rightRadius !== null
  )
}

function getCenterMinusOneRadius(block) {
  if (block?.type !== 'scalar_arithmetic' || block.getFieldValue('OP') !== 'subtract') return null
  if (!isSphereCenterMagnitudeBlock(getInputBlock(block, 'A'))) return null
  return getSphereRadiusScalar(getInputBlock(block, 'B'))
}

function isSphereScalarDistanceBlock(block) {
  if (block?.type !== 'scalar_arithmetic' || block.getFieldValue('OP') !== 'subtract') return false

  if (
    isSphereCenterMagnitudeBlock(getInputBlock(block, 'A')) &&
    isSphereRadiusSumBlock(getInputBlock(block, 'B'))
  ) {
    return true
  }

  const firstSubtractedRadius = getCenterMinusOneRadius(getInputBlock(block, 'A'))
  const secondSubtractedRadius = getSphereRadiusScalar(getInputBlock(block, 'B'))
  return Boolean(
    firstSubtractedRadius &&
    secondSubtractedRadius &&
    firstSubtractedRadius !== secondSubtractedRadius,
  )
}

function hasSphereScalarDistanceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('scalar_arithmetic', false).some(isSphereScalarDistanceBlock)
}

function isSphereScalarDistanceCandidateBlock(block) {
  if (block?.type !== 'scalar_arithmetic') return false
  return (
    blockTreeContains(getInputBlock(block, 'A'), isSphereCenterMagnitudeBlock) ||
    blockTreeContains(getInputBlock(block, 'B'), isSphereCenterMagnitudeBlock)
  )
}

function hasValidSphereDistanceComputation(workspace) {
  return (
    hasSphereBlocks(workspace) &&
    hasSphereCenterDifferenceBlock(workspace) &&
    hasSphereCenterMagnitudeBlock(workspace) &&
    hasSphereScalarDistanceBlock(workspace)
  )
}

function Givens() {
  return (
    <div className="exercise-given-values" aria-label="Given values">
      <section>
        <h3>Sphere A</h3>
        <p>Center A = (-4, 2, 1)</p>
        <p>Radius rA = 1.3</p>
      </section>
      <section>
        <h3>Sphere B</h3>
        <p>Center B = (3, -1, 6)</p>
        <p>Radius rB = 0.9</p>
      </section>
    </div>
  )
}

function Steps({ steps, passed }) {
  return (
    <ol className={`exercise-task-steps${passed ? ' is-passed' : ''}`}>
      <li className={steps.spheres ? 'is-complete' : ''}>
        Create: Sphere A, Sphere B, Center A, Center B. Use Scalar blocks for each radius, and Point
        blocks for the centers so the center-to-center vector draws in the right place.
      </li>
      <li className={steps.difference ? 'is-complete' : ''}>
        Compute: center difference with the Vector Arithmetic block, B - A or A - B. This vector
        should run from one sphere center to the other.
      </li>
      <li className={steps.magnitude ? 'is-complete' : ''}>
        Compute: center distance with the Vector Magnitude block, |B - A|.
      </li>
      <li className={steps.distance ? 'is-complete' : ''}>
        Compute: sphere distance with the Scalar Arithmetic block, i.e., |B - A| - rA - rB.
      </li>
    </ol>
  )
}

/**
 * Reads the answer from the scalar block that actually subtracts both radii,
 * rather than from any scalar in the workspace -- an intermediate value such as
 * the raw centre-to-centre distance would otherwise be read as the answer.
 */
function readDistance(objects, workspace) {
  // Search the rendered objects, not the workspace blocks: a candidate block
  // that produced no object has no value to read, and the next candidate should
  // still get a look in.
  const scalarObject = objects.find((object) => {
    if (object?.userData?.geoType !== 'scalar_arithmetic_result') return false
    return isSphereScalarDistanceCandidateBlock(
      workspace?.getBlockById?.(object.userData?.srcBlockId),
    )
  })
  const scalarValue = Number(scalarObject?.userData?.value)
  if (workspace && Number.isFinite(scalarValue)) return scalarValue

  const distanceObject = objects.find(
    (object) => object?.userData?.geoType === 'sphere_sphere_distance',
  )
  const scalarAnswer = objects
    .filter((object) => object?.userData?.geoType === 'scalar_arithmetic_result')
    .find((object) => closeNumber(object.userData?.value, SPHERE_DISTANCE, 0.01))
  const distance = Number(distanceObject?.userData?.distance ?? scalarAnswer?.userData?.value)
  return Number.isFinite(distance) ? distance : null
}

function evaluate({ objects, workspace }) {
  const distance = readDistance(objects, workspace)
  const distanceIsCorrect = distance !== null && closeNumber(distance, SPHERE_DISTANCE, 0.01)
  const passed = distanceIsCorrect && hasValidSphereDistanceComputation(workspace)

  return {
    passed,
    // The answer card goes green on a correct VALUE, before the working is
    // checked; `passed` additionally requires the student to have built the
    // computation rather than typed the number in.
    correct: distanceIsCorrect,
    incorrect: distance !== null && !distanceIsCorrect,
    answer: { type: 'distance', value: distance },
    steps: {
      spheres: hasSphereBlocks(workspace),
      difference: hasSphereCenterDifferenceBlock(workspace),
      magnitude: hasSphereCenterMagnitudeBlock(workspace),
      distance: hasSphereScalarDistanceBlock(workspace) && passed,
    },
  }
}

export default {
  number: 7,
  kind: 'distance',
  Givens,
  Steps,
  evaluate,
  reusableBlockTemplate: {
    defaultName: 'Distance between spheres',
    description: 'Save a reusable sphere distance block with open inputs for any two spheres.',
    source: 'exercise',
    xmlText: SPHERE_DISTANCE_BLOCK_XML,
  },
}
