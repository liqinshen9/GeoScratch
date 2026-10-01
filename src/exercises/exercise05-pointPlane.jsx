import THREE from '@/utils/three'
import { createVectorNotationRuntime } from '@/utils/vectorNotation'
import { createPointMarker } from '@/utils/pointMarker'
import {
  blockMatchesVec3,
  closeNumber,
  findAnswerGeometry,
  getInputBlock,
  objectOrChildMatches,
  planeNormalFromBlock,
  vec3FromBlock,
  vectorMatches,
  vectorsAreParallel,
  POINT_VECTOR_BLOCK_TYPES,
} from './shared/blockQueries'

const POINT_P = new THREE.Vector3(4, 5, -3)
const PLANE_POINT_A = new THREE.Vector3(-2, -3, 1)
const PLANE_NORMAL = new THREE.Vector3(0.5, 2, 0.5)
// Given rather than picked: Show Point on Object picks at random, so every
// participant would build a different scene. Lies on the plane, away from P's
// foot, so P - Q leans clear of the normal.
const POINT_Q = new THREE.Vector3(-7, -2, 2)
// Derived, not typed: |n| is sqrt(4.5), so the distance is not a round number
// and hardcoding it would drift the moment any of the three above changed.
const CORRECT_DISTANCE =
  Math.abs(POINT_P.clone().sub(PLANE_POINT_A).dot(PLANE_NORMAL)) / PLANE_NORMAL.length()
// planeNormalFromBlock returns the UNIT normal, mirroring what the renderer
// draws, so a comparison against it has to be unit too. This was invisible
// while PLANE_NORMAL happened to be a unit vector.
const PLANE_NORMAL_UNIT = PLANE_NORMAL.clone().normalize()

const POINT_MARKER_FALLBACK_COLOR = '#94a3b8'

const vectorNotation = createVectorNotationRuntime()

// The worked solution, loaded by the dev-only "Fill solution" control. Kept
// beside the checker so a change to what counts as correct is made next to the
// blocks that are supposed to satisfy it.
const xyzFields = (v) =>
  `<field name="X">${v.x}</field><field name="Y">${v.y}</field><field name="Z">${v.z}</field>`

const SOLUTION_XML = `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="linalg_point" x="420" y="60">${xyzFields(POINT_P)}</block>
  <block type="linalg_point" x="420" y="120">${xyzFields(POINT_Q)}</block>
  <block type="parametric_plane" x="60" y="60">
    <value name="point">
      <block type="linalg_point">${xyzFields(PLANE_POINT_A)}</block>
    </value>
    <value name="norm">
      <block type="linalg_vec3">${xyzFields(PLANE_NORMAL)}</block>
    </value>
  </block>
  <block type="vector_magnitude" x="60" y="220">
    <value name="V">
      <block type="vector_project">
        <value name="U">
          <block type="vector_arithmetic">
            <field name="OP">subtract</field>
            <value name="U">
              <block type="linalg_vec3">${xyzFields(POINT_P)}</block>
            </value>
            <value name="V">
              <block type="linalg_vec3">${xyzFields(POINT_Q)}</block>
            </value>
          </block>
        </value>
        <value name="V">
          <block type="linalg_vec3">${xyzFields(PLANE_NORMAL)}</block>
        </value>
      </block>
    </value>
  </block>
</xml>`

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

function findPointBlock(workspace, point, types = POINT_VECTOR_BLOCK_TYPES) {
  if (!workspace) return null
  for (const type of types) {
    const match = workspace
      .getBlocksByType(type, false)
      .find((block) => blockMatchesVec3(block, point))
    if (match) return match
  }
  return null
}

function isPointBlockAt(block, point) {
  return POINT_VECTOR_BLOCK_TYPES.includes(block?.type) && blockMatchesVec3(block, point)
}

const isPointOnlyAt = (point) => (block) =>
  block?.type === 'linalg_point' && blockMatchesVec3(block, point)
const isVectorOnlyAt = (point) => (block) =>
  block?.type === 'linalg_vec3' && blockMatchesVec3(block, point)

const hasBlock = (workspace, matches) => (workspace?.getAllBlocks(false) ?? []).some(matches)

function isExercisePlaneBlock(block) {
  return (
    block?.type === 'parametric_plane' &&
    blockMatchesVec3(getInputBlock(block, 'point'), PLANE_POINT_A) &&
    vectorMatches(planeNormalFromBlock(block), PLANE_NORMAL_UNIT)
  )
}

function isExercisePointQBlock(block) {
  return (
    blockMatchesVec3(block, POINT_Q) ||
    (block?.type === 'geo_show_point_on_object' &&
      isExercisePlaneBlock(getInputBlock(block, 'OBJECT')))
  )
}

function isPointPBlock(block) {
  return blockMatchesVec3(block, POINT_P)
}

function isNormalVectorBlock(block) {
  return blockMatchesVec3(block, PLANE_NORMAL)
}

// Projecting onto any multiple of n gives the same projection.
function isNormalDirectionBlock(block) {
  return vectorsAreParallel(vec3FromBlock(block), PLANE_NORMAL)
}

function isPointDifferenceBlock(block) {
  return (
    block?.type === 'vector_arithmetic' &&
    block.getFieldValue('OP') === 'subtract' &&
    isPointPBlock(getInputBlock(block, 'U')) &&
    isExercisePointQBlock(getInputBlock(block, 'V'))
  )
}

// Q - P has the right length, but not accepted: the projection draws its
// perpendicular from the arrow's head, which would then be Q, on the plane.
function isReversedDifferenceBlock(block) {
  return (
    block?.type === 'vector_arithmetic' &&
    block.getFieldValue('OP') === 'subtract' &&
    isExercisePointQBlock(getInputBlock(block, 'U')) &&
    isPointPBlock(getInputBlock(block, 'V'))
  )
}

function objectIsAt(object, point) {
  const position = object?.userData?.point ?? object?.position
  return (
    position?.isVector3 &&
    closeNumber(position.x, point.x) &&
    closeNumber(position.y, point.y) &&
    closeNumber(position.z, point.z)
  )
}

function createExercisePointMarker(point, name, geoType) {
  // Colour comes off the window surface rather than a static import so this
  // module stays importable outside the browser (its checker logic is
  // unit-tested in a node environment).
  const color =
    window.GeoScratchColors?.forInstance('point', `exercise:point-plane-distance:${geoType}`) ??
    POINT_MARKER_FALLBACK_COLOR
  const marker = createPointMarker({ color, geoType })

  marker.position.copy(point)
  marker.userData.labelAnchors = {
    p: { type: 'world', position: [point.x, point.y, point.z] },
  }
  marker.userData.labels = [
    {
      anchor: 'p',
      name,
      value: vectorNotation.formatVector(point),
      distanceFactor: 8,
      offset: [0.12, 0.12, 0],
      color,
    },
  ]

  return marker
}

// A Point block plugged into a socket draws no glyph of its own, so the
// exercise supplies the markers for P and Q. Each is labelled with its block's
// own name rather than a hardcoded letter, so the scene and the workspace agree.
function addExercisePointMarkers(objects, workspace) {
  const markers = [
    [POINT_P, 'P', 'exercise_point_p'],
    [POINT_Q, 'Q', 'exercise_point_q'],
  ].flatMap(([point, fallback, geoType]) => {
    const block = findPointBlock(workspace, point, ['linalg_point'])
    if (!block || objects.some((object) => objectIsAt(object, point))) return []
    const marker = createExercisePointMarker(
      point,
      window.geoNaming?.nameFor(block.id) || fallback,
      geoType,
    )
    return [marker]
  })
  return markers.length ? [...objects, ...markers] : objects
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

function hasProjectionOntoNormalBlock(workspace) {
  if (!workspace) return false
  return workspace
    .getBlocksByType('vector_project', false)
    .some(
      (block) =>
        isPointDifferenceBlock(getInputBlock(block, 'U')) &&
        isNormalDirectionBlock(getInputBlock(block, 'V')),
    )
}

function hasProjectionDistanceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_magnitude', false).some((block) => {
    const projectBlock = getInputBlock(block, 'V')
    return (
      projectBlock?.type === 'vector_project' &&
      isPointDifferenceBlock(getInputBlock(projectBlock, 'U')) &&
      isNormalDirectionBlock(getInputBlock(projectBlock, 'V'))
    )
  })
}

// Projection only. The dot product of (P - Q) and n equals the distance just
// when |n| = 1, and this plane's normal is (0.5, 2, 0.5), so |n| is sqrt(4.5).
// A student taking that route would read 17 instead of 8.01, fail the value
// check, and have nothing to tell them why.
function hasValidDistanceComputation(workspace) {
  return hasProjectionDistanceBlock(workspace)
}

const givenVector = (v) => `(${v.x}, ${v.y}, ${v.z})`

function Givens() {
  return (
    <div className="exercise-given-values" aria-label="Given values">
      <section>
        <h3>Plane S</h3>
        <p>Point A = {givenVector(PLANE_POINT_A)}</p>
        <p>Normal vector n = {givenVector(PLANE_NORMAL)}</p>
      </section>
      <section>
        <h3>Points</h3>
        <p>P = {givenVector(POINT_P)}</p>
        <p>Q = {givenVector(POINT_Q)}, a point on the plane</p>
      </section>
      <section>
        <h3>Vectors</h3>
        <p>VP = {givenVector(POINT_P)}</p>
        <p>VQ = {givenVector(POINT_Q)}</p>
      </section>
    </div>
  )
}

function Steps({ steps, partialSteps, partialMessages, passed }) {
  const differenceClass = steps.difference
    ? 'is-complete'
    : partialSteps?.difference
      ? 'is-partial'
      : ''
  return (
    <ol className={`exercise-task-steps${passed ? ' is-passed' : ''}`}>
      <li className={steps.plane ? 'is-complete' : ''}>
        Create: plane S through A with normal vector n
      </li>
      <li className={steps.pointP ? 'is-complete' : ''}>Create: Point P</li>
      <li className={steps.pointQ ? 'is-complete' : ''}>
        Create: Point Q, this will be on the plane.
      </li>
      <li className={steps.vectors ? 'is-complete' : ''}>
        Create: Vector VP and Vector VQ, ending at P and Q.
      </li>
      <li className={differenceClass}>
        Compute: VP - VQ with the Vector Arithmetic block.
        {partialSteps?.difference && (
          <div className="exercise-step-actions">
            <span className="exercise-step-feedback" role="status">
              {partialMessages.difference}
            </span>
          </div>
        )}
      </li>
      <li className={steps.projection ? 'is-complete' : ''}>
        Project: VP - VQ onto n with the Vector Project block. Hint: right-click n and Duplicate it.
      </li>
      <li className={steps.distance ? 'is-complete' : ''}>
        Compute: the Vector Magnitude of that projection. This is the distance from P to the plane.
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
  if (!Number.isFinite(distance)) return { distance: null, target: null }
  return { distance, target: findAnswerGeometry(objects) ?? distanceObject ?? scalarAnswer ?? null }
}

function evaluate({ objects, workspace }) {
  const { distance, target } = readDistance(objects)
  const distanceIsCorrect = distance !== null && closeNumber(distance, CORRECT_DISTANCE, 0.01)
  const passed = distanceIsCorrect && hasValidDistanceComputation(workspace)

  const hasPointP = hasBlock(workspace, isPointOnlyAt(POINT_P))
  const hasPointQ = hasBlock(workspace, isPointOnlyAt(POINT_Q)) || hasPointQOnExercisePlane(objects)
  const vectors =
    hasBlock(workspace, isVectorOnlyAt(POINT_P)) && hasBlock(workspace, isVectorOnlyAt(POINT_Q))
  const difference = hasPointDifferenceBlock(workspace)
  const reversedDifference =
    !difference &&
    (workspace?.getBlocksByType('vector_arithmetic', false) ?? []).some(isReversedDifferenceBlock)

  return {
    passed,
    // The answer card goes green on a correct VALUE, before the working is
    // checked; `passed` additionally requires the student to have built the
    // computation rather than typed the number in.
    correct: distanceIsCorrect,
    incorrect: distance !== null && !distanceIsCorrect,
    target,
    answer: { type: 'distance', value: distance },
    steps: {
      plane: hasExercisePlane(objects),
      pointP: hasPointP,
      pointQ: hasPointQ,
      vectors,
      difference,
      // The projection ticks on its own, before the magnitude finishes the job.
      projection: hasProjectionOntoNormalBlock(workspace),
      distance: passed,
    },
    partialSteps: { difference: reversedDifference },
    partialMessages: {
      difference: reversedDifference
        ? 'This is VQ - VP. Swap the two vectors so it is VP - VQ, from Q on the plane to P.'
        : null,
    },
  }
}

export default {
  id: 'point-plane-distance',
  kind: 'distance',
  // Far enough out to see the plane meet the room's walls, which is what shows
  // it has no edge of its own.
  cameraView: { distance: 48 },
  // From this far out the room's front edges cross the scene.
  // VP - VQ rests from Q to P, where the projection needs it, as with two Points.
  settingsOverrides: { showBoxFrontWireframe: false, vectorDifferenceAsPositions: true },
  givenNames: [
    { name: 'S', matches: isExercisePlaneBlock },
    { name: 'A', matches: (block) => isPointBlockAt(block, PLANE_POINT_A) },
    { name: 'n', matches: (block) => block.type === 'linalg_vec3' && isNormalVectorBlock(block) },
    { name: 'P', matches: isPointOnlyAt(POINT_P) },
    { name: 'Q', matches: isPointOnlyAt(POINT_Q) },
    { name: 'VP', matches: isVectorOnlyAt(POINT_P) },
    { name: 'VQ', matches: isVectorOnlyAt(POINT_Q) },
  ],
  Givens,
  Steps,
  evaluate,
  decorateObjects: addExercisePointMarkers,
  solutionXml: SOLUTION_XML,
  reusableBlockTemplate: {
    defaultName: 'Distance from point to plane',
    description: 'Save a reusable distance block with open inputs for any point and any plane.',
    source: 'exercise',
    xmlText: POINT_PLANE_DISTANCE_BLOCK_XML,
  },
}
