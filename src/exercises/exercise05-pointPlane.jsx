import THREE from '@/utils/three'
import {
  blockMatchesVec3,
  closeNumber,
  getInputBlock,
  objectOrChildMatches,
  vectorMatches,
  POINT_VECTOR_BLOCK_TYPES,
} from './shared/blockQueries'

const POINT_P = new THREE.Vector3(3, 4, 5)
const PLANE_POINT_A = new THREE.Vector3(1, 1, 2)
const PLANE_NORMAL = new THREE.Vector3(0, 1, 0)
const CORRECT_DISTANCE = 3

const POINT_PLANE_DISTANCE_BLOCK_XML =
  '<xml xmlns="https://developers.google.com/blockly/xml"><block type="point_plane_distance" x="0" y="0"></block></xml>'

function pointLiesOnExercisePlane(point, tolerance = 1e-5) {
  if (!point?.isVector3) return false
  return Math.abs(point.clone().sub(PLANE_POINT_A).dot(PLANE_NORMAL)) <= tolerance
}

function isExercisePlaneObject(object) {
  const point = object?.userData?.point
  const normal = object?.userData?.normalRaw
  return (
    object.userData?.geoType === 'point_normal_plane_group' &&
    vectorMatches(point, PLANE_POINT_A) &&
    vectorMatches(normal, PLANE_NORMAL)
  )
}

function workspaceHasPointPVector(workspace) {
  if (!workspace) return false
  return POINT_VECTOR_BLOCK_TYPES.some((type) =>
    workspace.getBlocksByType(type, false).some((block) => blockMatchesVec3(block, POINT_P)),
  )
}

function isExercisePlaneBlock(block) {
  return (
    block?.type === 'parametric_plane' &&
    blockMatchesVec3(getInputBlock(block, 'point'), PLANE_POINT_A) &&
    blockMatchesVec3(getInputBlock(block, 'norm'), PLANE_NORMAL)
  )
}

function isExercisePointQBlock(block) {
  return (
    block?.type === 'geo_show_point_on_object' &&
    isExercisePlaneBlock(getInputBlock(block, 'OBJECT'))
  )
}

function isPointPBlock(block) {
  return blockMatchesVec3(block, POINT_P)
}

function isNormalVectorBlock(block) {
  return blockMatchesVec3(block, PLANE_NORMAL)
}

function isPointDifferenceBlock(block) {
  return (
    block?.type === 'vector_arithmetic' &&
    block.getFieldValue('OP') === 'subtract' &&
    isPointPBlock(getInputBlock(block, 'U')) &&
    isExercisePointQBlock(getInputBlock(block, 'V'))
  )
}

function objectIsAtPointP(object) {
  const position = object?.userData?.point ?? object?.position
  return (
    position?.isVector3 &&
    closeNumber(position.x, POINT_P.x) &&
    closeNumber(position.y, POINT_P.y) &&
    closeNumber(position.z, POINT_P.z)
  )
}

function createPointPMarker() {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35, metalness: 0.05 }),
  )

  marker.position.copy(POINT_P)
  marker.userData.geoType = 'exercise_point_p'
  marker.userData.labelAnchors = {
    p: { type: 'world', position: [POINT_P.x, POINT_P.y, POINT_P.z] },
  }
  marker.userData.labels = [
    {
      anchor: 'p',
      text: 'P = [3, 4, 5]',
      distanceFactor: 8,
      offset: [0.12, 0.12, 0],
      color: '#2563eb',
    },
  ]

  return marker
}

function addExercisePointPIfNeeded(objects, workspace) {
  if (!workspaceHasPointPVector(workspace)) return objects
  if (objects.some(objectIsAtPointP)) return objects
  return [...objects, createPointPMarker()]
}

function hasExercisePlane(objects) {
  return objects.some((object) => objectOrChildMatches(object, isExercisePlaneObject))
}

function hasPointQOnExercisePlane(objects) {
  return objects.some(
    (object) =>
      object?.userData?.geoType === 'annotated_object' &&
      pointLiesOnExercisePlane(object.userData.point) &&
      objectOrChildMatches(object, isExercisePlaneObject),
  )
}

function hasPointDifferenceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_arithmetic', false).some(isPointDifferenceBlock)
}

function hasProjectionDistanceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_magnitude', false).some((block) => {
    const projectBlock = getInputBlock(block, 'V')
    return (
      projectBlock?.type === 'vector_project' &&
      isPointDifferenceBlock(getInputBlock(projectBlock, 'U')) &&
      isNormalVectorBlock(getInputBlock(projectBlock, 'V'))
    )
  })
}

function hasDotProductDistanceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_dot_product', false).some((block) => {
    const left = getInputBlock(block, 'U')
    const right = getInputBlock(block, 'V')
    return (
      (isPointDifferenceBlock(left) && isNormalVectorBlock(right)) ||
      (isNormalVectorBlock(left) && isPointDifferenceBlock(right))
    )
  })
}

function hasValidDistanceComputation(workspace) {
  return hasProjectionDistanceBlock(workspace) || hasDotProductDistanceBlock(workspace)
}

function Givens() {
  return (
    <div className="exercise-given-values" aria-label="Given values">
      <section>
        <h3>Plane</h3>
        <p>Point A = (1, 1, 2)</p>
        <p>Normal n = (0, 1, 0)</p>
      </section>
      <section>
        <h3>Point</h3>
        <p>P = (3, 4, 5)</p>
      </section>
    </div>
  )
}

function Steps({ steps, passed }) {
  return (
    <ol className={`exercise-task-steps${passed ? ' is-passed' : ''}`}>
      <li className={steps.plane ? 'is-complete' : ''}>Create: plane</li>
      <li className={steps.pointP ? 'is-complete' : ''}>Create: Point P</li>
      <li className={steps.pointQ ? 'is-complete' : ''}>Create: any point Q on the plane</li>
      <li className={steps.difference ? 'is-complete' : ''}>
        Compute: P - Q with the Vector Arithmetic block.
      </li>
      <li className={steps.distance ? 'is-complete' : ''}>
        Compute: distance by projecting P - Q onto n and taking Vector Magnitude. Alternatively, you
        can use the dot product of (P - Q) and n because n is a unit vector. This gives the distance
        from P to the plane.
      </li>
    </ol>
  )
}

/** Reads the computed distance out of whichever block produced it. */
function readDistance(objects) {
  const distanceObject = objects.find(
    (object) =>
      object?.userData?.geoType === 'point_plane_distance_dot' ||
      object?.userData?.geoType === 'point_plane_distance_projection_magnitude',
  )
  const scalarObjects = objects.filter(
    (object) => object?.userData?.geoType === 'scalar_arithmetic_result',
  )
  // Prefer a scalar block whose value already matches, so an unrelated scalar
  // elsewhere in the workspace cannot masquerade as the answer.
  const scalarAnswer = scalarObjects.find((object) =>
    closeNumber(object.userData?.value, CORRECT_DISTANCE, 0.01),
  )
  const distance = Number(distanceObject?.userData?.distance ?? scalarAnswer?.userData?.value)
  return Number.isFinite(distance) ? distance : null
}

function evaluate({ objects, workspace }) {
  const distance = readDistance(objects)
  const distanceIsCorrect = distance !== null && closeNumber(distance, CORRECT_DISTANCE, 0.01)
  const passed = distanceIsCorrect && hasValidDistanceComputation(workspace)

  const hasPointP = workspaceHasPointPVector(workspace)
  const hasPointQ = hasPointQOnExercisePlane(objects)

  return {
    passed,
    // The answer card goes green on a correct VALUE, before the working is
    // checked; `passed` additionally requires the student to have built the
    // computation rather than typed the number in.
    correct: distanceIsCorrect,
    incorrect: distance !== null && !distanceIsCorrect,
    answer: { type: 'distance', value: distance },
    steps: {
      plane: hasExercisePlane(objects),
      pointP: hasPointP,
      pointQ: hasPointQ,
      difference: hasPointP && hasPointQ && hasPointDifferenceBlock(workspace),
      distance: passed,
    },
  }
}

export default {
  number: 5,
  kind: 'distance',
  Givens,
  Steps,
  evaluate,
  decorateObjects: addExercisePointPIfNeeded,
  reusableBlockTemplate: {
    defaultName: 'Distance from point to plane',
    description: 'Save a reusable distance block with open inputs for any point and any plane.',
    source: 'exercise',
    xmlText: POINT_PLANE_DISTANCE_BLOCK_XML,
  },
}
