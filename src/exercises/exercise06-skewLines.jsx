import THREE from '@/utils/three'
import {
  blockMatchesVec3,
  closeNumber,
  getInputBlock,
  isLineBlock,
  pointBlockLiesOnLine,
  vec3FromBlock,
  vectorsAreParallel,
  POINT_VECTOR_BLOCK_TYPES,
} from './shared/blockQueries'

const SKEW_LINE_1_POINT = new THREE.Vector3(1, 2, 0)
const SKEW_LINE_1_DIRECTION = new THREE.Vector3(1, 2, 3)
const SKEW_LINE_2_POINT = new THREE.Vector3(5, 5, -3)
const SKEW_LINE_2_DIRECTION = new THREE.Vector3(2, -1, 1)
const SKEW_NORMAL = new THREE.Vector3().crossVectors(SKEW_LINE_1_DIRECTION, SKEW_LINE_2_DIRECTION)
const SKEW_DISTANCE =
  Math.abs(SKEW_LINE_2_POINT.clone().sub(SKEW_LINE_1_POINT).dot(SKEW_NORMAL)) / SKEW_NORMAL.length()

const LINE_INTERSECTION_3D_BLOCK_XML =
  '<xml xmlns="https://developers.google.com/blockly/xml"><block type="line_intersection_3d" x="0" y="0"></block></xml>'

function isSkewLine1Block(block) {
  return isLineBlock(block, SKEW_LINE_1_POINT, SKEW_LINE_1_DIRECTION)
}

function isSkewLine2Block(block) {
  return isLineBlock(block, SKEW_LINE_2_POINT, SKEW_LINE_2_DIRECTION)
}

function isSkewCrossProductBlock(block) {
  if (block?.type !== 'vector_cross_product') return false
  const left = getInputBlock(block, 'U')
  const right = getInputBlock(block, 'V')
  const isLine1Direction = (inputBlock) =>
    blockMatchesVec3(inputBlock, SKEW_LINE_1_DIRECTION) || isSkewLine1Block(inputBlock)
  const isLine2Direction = (inputBlock) =>
    blockMatchesVec3(inputBlock, SKEW_LINE_2_DIRECTION) || isSkewLine2Block(inputBlock)
  return (
    (isLine1Direction(left) && isLine2Direction(right)) ||
    (isLine2Direction(left) && isLine1Direction(right))
  )
}

function isSkewNormalBlock(block) {
  return vectorsAreParallel(vec3FromBlock(block), SKEW_NORMAL) || isSkewCrossProductBlock(block)
}

function getSkewPlaneLine(block) {
  if (
    block?.type === 'parametric_plane' &&
    isSkewNormalBlock(getInputBlock(block, 'norm')) &&
    pointBlockLiesOnLine(getInputBlock(block, 'point'), SKEW_LINE_1_POINT, SKEW_LINE_1_DIRECTION)
  ) {
    return 'line1'
  }

  if (
    block?.type === 'parametric_plane' &&
    isSkewNormalBlock(getInputBlock(block, 'norm')) &&
    pointBlockLiesOnLine(getInputBlock(block, 'point'), SKEW_LINE_2_POINT, SKEW_LINE_2_DIRECTION)
  ) {
    return 'line2'
  }

  return null
}

function isSkewPlaneBlock(block) {
  return Boolean(getSkewPlaneLine(block))
}

function isPointOnObjectBlock(block, objectPredicate) {
  return (
    block?.type === 'geo_show_point_on_object' && objectPredicate(getInputBlock(block, 'OBJECT'))
  )
}

function isPointOnSkewPlaneBlock(block) {
  return isPointOnObjectBlock(block, isSkewPlaneBlock)
}

function isPointOnOtherSkewLineBlock(block, planeLine) {
  return isPointOnObjectBlock(block, planeLine === 'line1' ? isSkewLine2Block : isSkewLine1Block)
}

function isSkewPointDifferenceBlock(block) {
  if (block?.type !== 'vector_arithmetic' || block.getFieldValue('OP') !== 'subtract') return false

  const left = getInputBlock(block, 'U')
  const right = getInputBlock(block, 'V')
  const leftIsPlanePoint = isPointOnSkewPlaneBlock(left)
  const rightIsPlanePoint = isPointOnSkewPlaneBlock(right)
  const planePointBlock = leftIsPlanePoint ? left : rightIsPlanePoint ? right : null
  const otherPointBlock = leftIsPlanePoint ? right : rightIsPlanePoint ? left : null

  const planeLine = getSkewPlaneLine(getInputBlock(planePointBlock, 'OBJECT'))
  return Boolean(planeLine && isPointOnOtherSkewLineBlock(otherPointBlock, planeLine))
}

function hasSkewLineBlocks(workspace) {
  if (!workspace) return false
  const lines = workspace.getBlocksByType('geo_vector', false)
  return lines.some(isSkewLine1Block) && lines.some(isSkewLine2Block)
}

function hasSkewCrossProductBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_cross_product', false).some(isSkewCrossProductBlock)
}

function hasSkewPlaneBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('parametric_plane', false).some(isSkewPlaneBlock)
}

function hasSkewOtherLinePointBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('geo_show_point_on_object', false).some((block) => {
    const planeBlocks = workspace
      .getBlocksByType('parametric_plane', false)
      .filter(isSkewPlaneBlock)
    return planeBlocks.some((planeBlock) =>
      isPointOnOtherSkewLineBlock(block, getSkewPlaneLine(planeBlock)),
    )
  })
}

function hasSkewPointDifferenceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_arithmetic', false).some(isSkewPointDifferenceBlock)
}

function hasSkewProjectionDistanceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_magnitude', false).some((block) => {
    const projectBlock = getInputBlock(block, 'V')
    return (
      projectBlock?.type === 'vector_project' &&
      isSkewPointDifferenceBlock(getInputBlock(projectBlock, 'U')) &&
      isSkewNormalBlock(getInputBlock(projectBlock, 'V'))
    )
  })
}

function hasSkewDotProductDistanceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_dot_product', false).some((block) => {
    const left = getInputBlock(block, 'U')
    const right = getInputBlock(block, 'V')
    return (
      (isSkewPointDifferenceBlock(left) && isSkewNormalBlock(right)) ||
      (isSkewNormalBlock(left) && isSkewPointDifferenceBlock(right))
    )
  })
}

function isSkewReusableDistanceBlock(block) {
  if (block?.type !== 'point_plane_distance') return false

  const planeBlock = getInputBlock(block, 'PLANE')
  const planeLine = getSkewPlaneLine(planeBlock)
  return Boolean(planeLine && isPointOnOtherSkewLineBlock(getInputBlock(block, 'POINT'), planeLine))
}

function hasSkewReusableDistanceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('point_plane_distance', false).some(isSkewReusableDistanceBlock)
}

function hasValidSkewDistanceComputation(workspace) {
  return (
    hasSkewProjectionDistanceBlock(workspace) ||
    hasSkewDotProductDistanceBlock(workspace) ||
    hasSkewReusableDistanceBlock(workspace)
  )
}

function Givens() {
  return (
    <div className="exercise-given-values" aria-label="Given values">
      <section>
        <h3>Line L1</h3>
        <p>P1 = (1, 2, 0)</p>
        <p>d1 = (1, 2, 3)</p>
      </section>
      <section>
        <h3>Line L2</h3>
        <p>P2 = (5, 5, -3)</p>
        <p>d2 = (2, -1, 1)</p>
      </section>
    </div>
  )
}

function Steps({ steps, passed }) {
  return (
    <ol className={`exercise-task-steps${passed ? ' is-passed' : ''}`}>
      <li className={steps.lines ? 'is-complete' : ''}>Create: L1, L2 with Line blocks.</li>
      <li className={steps.normal ? 'is-complete' : ''}>
        Compute: n = d1 x d2. This normal is perpendicular to both line directions.
      </li>
      <li className={steps.plane ? 'is-complete' : ''}>
        Create: helper plane from any point on L1 or L2 and normal n. The chosen line should lie in
        the plane.
      </li>
      <li className={steps.point ? 'is-complete' : ''}>Create: any point on the other line.</li>
      <li className={steps.difference ? 'is-complete' : ''}>
        Use the point on the other line as the point input, and use the helper plane as the plane
        input.
      </li>
      <li className={steps.distance ? 'is-complete' : ''}>
        Calculate the distance from that point to that helper plane.
      </li>
    </ol>
  )
}

function readDistance(objects) {
  // The Intersect 3D block reports the shortest distance between the two lines
  // directly, so prefer it over any loose scalar in the workspace.
  const intersection = objects.find(
    (object) => object?.userData?.geoType === 'geo_line_intersection',
  )
  const fromIntersection = Number(intersection?.userData?.distance)
  if (Number.isFinite(fromIntersection)) return fromIntersection

  const distanceObject = objects.find(
    (object) =>
      object?.userData?.geoType === 'point_plane_distance_dot' ||
      object?.userData?.geoType === 'point_plane_distance_projection_magnitude',
  )
  const scalarAnswer = objects
    .filter((object) => object?.userData?.geoType === 'scalar_arithmetic_result')
    .find((object) => closeNumber(object.userData?.value, SKEW_DISTANCE, 0.01))
  const distance = Number(distanceObject?.userData?.distance ?? scalarAnswer?.userData?.value)
  return Number.isFinite(distance) ? distance : null
}

function evaluate({ objects, workspace }) {
  const distance = readDistance(objects)
  const distanceIsCorrect = distance !== null && closeNumber(distance, SKEW_DISTANCE, 0.01)
  const passed = distanceIsCorrect && hasValidSkewDistanceComputation(workspace)

  // A saved "Intersect 3D" block does all of the point/difference work in one
  // go, so it satisfies those steps on its own.
  const usesReusableBlock = hasSkewReusableDistanceBlock(workspace)

  return {
    passed,
    // The answer card goes green on a correct VALUE, before the working is
    // checked; `passed` additionally requires the student to have built the
    // computation rather than typed the number in.
    correct: distanceIsCorrect,
    incorrect: distance !== null && !distanceIsCorrect,
    answer: { type: 'distance', value: distance },
    steps: {
      lines: hasSkewLineBlocks(workspace),
      normal: hasSkewCrossProductBlock(workspace),
      plane: hasSkewPlaneBlock(workspace),
      point: hasSkewOtherLinePointBlock(workspace) || usesReusableBlock,
      difference: hasSkewPointDifferenceBlock(workspace) || usesReusableBlock,
      distance: passed,
    },
  }
}

export default {
  number: 6,
  kind: 'distance',
  Givens,
  Steps,
  evaluate,
  reusableBlockTemplate: {
    defaultName: 'Intersect 3D lines',
    description: 'Save a reusable Intersect 3D block with open inputs for any two vector lines.',
    source: 'exercise',
    xmlText: LINE_INTERSECTION_3D_BLOCK_XML,
  },
}
