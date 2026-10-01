import THREE from '@/utils/three'
import * as Blockly from 'blockly/core'
import { pipelineStepChain } from './shared/transformChecks'
import {
  POINT_VECTOR_BLOCK_TYPES,
  closeNumber,
  getInputBlock,
  vec3FromBlock,
  vectorsAreParallel,
} from './shared/blockQueries'
import { seedBackgroundBlocks } from './shared/seedBackgroundBlocks'

// The high-clutter holistic task: lines threaded through solids (collision
// accents) and crossing in front of one another (halos), among decorative
// objects. Part A moves a line with a pipeline; Part B uses a cross product.

const TEAPOT_SIZE = 1
// The Utah teapot's spout tip in its own frame at size 1, measured off
// THREE.TeapotGeometry (the vertex with the largest x). It scales with size.
const SPOUT_TIP = new THREE.Vector3(2.18, 0.57, 0)
const SPHERE_S = { centre: new THREE.Vector3(4, 0, -4), radius: 0.8 }
const CUBE_K = { centre: new THREE.Vector3(-3, 0, 3), side: 1.2 }
const L1 = { point: new THREE.Vector3(-5, 3, 4), direction: new THREE.Vector3(1, 0, 0) }
// Part A's pipeline: through the origin first, then turned about Y, so it runs
// through K, the origin (the teapot) and S.
const L1_SHIFT = L1.point.clone().multiplyScalar(-1).setX(0)
const L1_TURN_DEGREES = 45
const L1_TARGET_DIRECTION = new THREE.Vector3(1, 0, -1)
// Tilted, so N = VA x VB is not horizontal: across L1 in the floor plane, it
// would point straight at the default camera.
const L2_DIRECTION = new THREE.Vector3(0, 1, 1)
// Part B: N runs along VA x VB through the teapot's centre, and the teapot moves
// 2n along it. L2 is placed where that leaves the spout tip, so both hold at once.
const N_DIRECTION = L1_TARGET_DIRECTION.clone().cross(L2_DIRECTION)
const TEAPOT_TARGET = N_DIRECTION.clone().multiplyScalar(2)
const SPOUT_AT_TARGET = TEAPOT_TARGET.clone().add(SPOUT_TIP.clone().multiplyScalar(TEAPOT_SIZE))
// Given where L2 crosses the floor plane (y = 0), which reads better than the tip.
const L2_POINT = SPOUT_AT_TARGET.clone().addScaledVector(
  L2_DIRECTION,
  -SPOUT_AT_TARGET.y / L2_DIRECTION.y,
)

const ON_LINE = 0.02
const TOUCHING = 0.05

const IDS = {
  teapot: 'ex-teapot',
  l1: 'ex-L1',
  l2: 'ex-L2',
  sphere: 'ex-S',
  cube: 'ex-K',
}
const DECOR_IDS = ['ex-bg-sphere-1']
// Decoration that has since been cut, removed from workspaces saved with it.
const RETIRED_IDS = ['ex-bg-sphere-2', 'ex-bg-cube-1', 'ex-bg-line-1', 'ex-bg-line-2']

const fields = ({ x, y, z }) =>
  `<field name="X">${x}</field><field name="Y">${y}</field><field name="Z">${z}</field>`
const point = (id, v) => `<block type="linalg_point" id="${id}">${fields(v)}</block>`
const vector = (id, v) => `<block type="linalg_vec3"${id ? ` id="${id}"` : ''}>${fields(v)}</block>`
const scalar = (id, n) =>
  `<block type="scalar" id="${id}"><field name="scalar">${n}</field></block>`
const xml = (blocks) => `<xml xmlns="https://developers.google.com/blockly/xml">${blocks}</xml>`

const teapotXml = (x, y) => `
  <block type="geo_teapot" id="${IDS.teapot}" x="${x}" y="${y}">
    <value name="SIZE_INPUT">${scalar(`${IDS.teapot}-size`, TEAPOT_SIZE)}</value>
    <value name="CENTRE">${point(`${IDS.teapot}-centre`, new THREE.Vector3())}</value>
  </block>`
const lineXml = (id, from, along, x, y) => `
  <block type="geo_vector" id="${id}"${x == null ? '' : ` x="${x}" y="${y}"`}>
    <value name="POS">${point(`${id}-pos`, from)}</value>
    <value name="DIR">${vector(`${id}-dir`, along)}</value>
  </block>`
const sphereXml = (id, centre, radius, x, y) => `
  <block type="geo_sphere" id="${id}" x="${x}" y="${y}">
    <value name="RADIUS_INPUT">${scalar(`${id}-radius`, radius)}</value>
    <value name="CENTRE">${point(`${id}-centre`, centre)}</value>
  </block>`
const cubeXml = (id, centre, side, x, y) => `
  <block type="geo_cube" id="${id}" x="${x}" y="${y}">
    <value name="SIDE_LENGTH_INPUT">${scalar(`${id}-side`, side)}</value>
    <value name="CENTRE">${point(`${id}-centre`, centre)}</value>
  </block>`

// Blocks the student plugs into their own pipelines: added only when missing,
// never reset, or a reload would pull them back out of the student's work.
const WORKING_GIVENS = {
  [IDS.teapot]: teapotXml(-760, -300),
  [IDS.l1]: lineXml(IDS.l1, L1.point, L1.direction, -760, -60),
}
// Given and decorative blocks the student only looks at: reset on every entry,
// so a layout change here reaches saved workspaces.
// Kept to the decoration the cues need: a sphere on N (a collision accent).
const FIXED_BLOCKS = xml(`
  ${lineXml(IDS.l2, L2_POINT, L2_DIRECTION, -760, 120)}
  ${sphereXml(IDS.sphere, SPHERE_S.centre, SPHERE_S.radius, -760, 300)}
  ${cubeXml(IDS.cube, CUBE_K.centre, CUBE_K.side, -760, 450)}
  ${sphereXml('ex-bg-sphere-1', N_DIRECTION.clone().multiplyScalar(-3), 0.6, -1100, -300)}
`)
const FIXED_IDS = [IDS.l2, IDS.sphere, IDS.cube, ...DECOR_IDS]

function addMissingWorkingGivens(workspace) {
  const missing = Object.entries(WORKING_GIVENS).filter(([id]) => !workspace.getBlockById(id))
  if (!missing.length) return
  try {
    Blockly.Xml.domToWorkspace(
      Blockly.utils.xml.textToDom(xml(missing.map(([, block]) => block).join(''))),
      workspace,
    )
  } catch (err) {
    console.error('[GeoScratch] Failed to add the exercise givens:', err)
  }
}

function seedWorkspace(workspace) {
  seedBackgroundBlocks(workspace, [...FIXED_IDS, ...RETIRED_IDS], FIXED_BLOCKS)
  addMissingWorkingGivens(workspace)
}

// Also after Clear, or a restore of a workspace saved before these givens
// existed: every given comes back, and none is moved.
function ensureWorkspace(workspace) {
  addMissingWorkingGivens(workspace)
  const missingFixed = FIXED_IDS.some((id) => !workspace.getBlockById(id))
  const retiredPresent = RETIRED_IDS.some((id) => workspace.getBlockById(id))
  if (missingFixed || retiredPresent)
    seedBackgroundBlocks(workspace, [...FIXED_IDS, ...RETIRED_IDS], FIXED_BLOCKS)
}

// The worked solution, loaded by the dev-only "Fill solution" control. It
// carries the working givens by id, so seeding afterwards adds only the rest.
const SOLUTION_XML = xml(`
  <block type="transform_pipeline" x="60" y="-320">
    <value name="INPUT">${lineXml(IDS.l1, L1.point, L1.direction)}</value>
    <statement name="STEPS">
      <block type="trans_matrix">
        <field name="TX">${L1_SHIFT.x}</field><field name="TY">${L1_SHIFT.y}</field><field name="TZ">${L1_SHIFT.z}</field>
        <next>
          <block type="rot_matrix"><field name="AXIS">Y</field><field name="DEGREES">${L1_TURN_DEGREES}</field></block>
        </next>
      </block>
    </statement>
  </block>
  <block type="geo_vector" x="60" y="140">
    <value name="POS"><block type="linalg_point">${fields(new THREE.Vector3())}</block></value>
    <value name="DIR">
      <block type="vector_cross_product">
        <value name="U">${vector(null, L1_TARGET_DIRECTION)}</value>
        <value name="V">${vector(null, L2_DIRECTION)}</value>
      </block>
    </value>
  </block>
  <block type="vector_scale" x="60" y="360">
    <value name="K"><block type="scalar"><field name="scalar">2</field></block></value>
    <value name="V">${vector(null, N_DIRECTION)}</value>
  </block>
  <block type="transform_pipeline" x="60" y="560">
    <value name="INPUT">${teapotXml()}</value>
    <statement name="STEPS">
      <block type="trans_matrix">
        <field name="TX">${TEAPOT_TARGET.x}</field><field name="TY">${TEAPOT_TARGET.y}</field><field name="TZ">${TEAPOT_TARGET.z}</field>
      </block>
    </statement>
  </block>
`)

const distanceToLine = (p, origin, direction) =>
  p.clone().sub(origin).cross(direction.clone().normalize()).length()

function lineObject(objects, predicate) {
  return (
    objects.find((o) => o?.userData?.geoType === 'geo_vector_line' && predicate(o.userData)) ?? null
  )
}

const lineThrough = (line, ...points) =>
  Boolean(line?.origin?.isVector3 && line?.direction?.isVector3) &&
  points.every((p) => distanceToLine(p, line.origin, line.direction) <= ON_LINE)

const isL1Block = (block) =>
  block?.id === IDS.l1 ||
  (block?.type === 'geo_vector' &&
    vec3FromBlock(getInputBlock(block, 'POS'))?.distanceTo(L1.point) < 1e-6 &&
    vectorsAreParallel(vec3FromBlock(getInputBlock(block, 'DIR')), L1.direction))

function l1Pipeline(workspace) {
  return (
    workspace
      ?.getBlocksByType('transform_pipeline', false)
      .find((pipeline) => isL1Block(getInputBlock(pipeline, 'INPUT'))) ?? null
  )
}

// The first step alone already puts L1 through the origin.
function firstStepThroughOrigin(pipeline) {
  const step = pipelineStepChain(pipeline)[0]
  if (step?.type !== 'trans_matrix') return false
  const shift = new THREE.Vector3(
    Number(step.getFieldValue('TX')),
    Number(step.getFieldValue('TY')),
    Number(step.getFieldValue('TZ')),
  )
  return distanceToLine(new THREE.Vector3(), L1.point.clone().add(shift), L1.direction) <= ON_LINE
}

const directionOf = (block) =>
  block?.type === 'geo_vector' ? vec3FromBlock(getInputBlock(block, 'DIR')) : vec3FromBlock(block)

function isNormalCrossProduct(block) {
  if (block?.type !== 'vector_cross_product') return false
  const p = directionOf(getInputBlock(block, 'U'))
  const q = directionOf(getInputBlock(block, 'V'))
  return (
    (vectorsAreParallel(p, L1_TARGET_DIRECTION) && vectorsAreParallel(q, L2_DIRECTION)) ||
    (vectorsAreParallel(p, L2_DIRECTION) && vectorsAreParallel(q, L1_TARGET_DIRECTION))
  )
}

const isLineN = (data) =>
  !String(data.srcBlockId).startsWith('ex-') &&
  lineThrough(data, new THREE.Vector3()) &&
  vectorsAreParallel(data.direction, N_DIRECTION)

// A Vector block holding n's value, read off the Cross Product's show button.
const isVectorVN = (block) =>
  block?.type === 'linalg_vec3' && vec3FromBlock(block)?.distanceTo(N_DIRECTION) < 1e-6

// Scale Vector with 2 and n, either as VN or the Cross Product itself.
function isDoubledN(block) {
  const k = getInputBlock(block, 'K')
  const v = getInputBlock(block, 'V')
  return (
    k?.type === 'scalar' &&
    closeNumber(k.getFieldValue('scalar'), 2) &&
    (isNormalCrossProduct(v) || isVectorVN(v))
  )
}

function givenTeapot(objects) {
  return (
    objects.find(
      (o) =>
        o?.userData?.geoType === 'geo_teapot' &&
        o.userData.srcBlockId === IDS.teapot &&
        closeNumber(o.userData.size, TEAPOT_SIZE),
    ) ?? null
  )
}

// Part B is about moving the teapot with a pipeline. Editing its centre to 2n
// puts it in the same place, but skips the transform (and leaves an animated
// participant nothing to play), so that is flagged rather than passed.
function teapotMoveHint(workspace, placed) {
  const teapotBlock = workspace?.getBlockById(IDS.teapot)
  const centre = vec3FromBlock(getInputBlock(teapotBlock, 'CENTRE'))
  if (centre && centre.lengthSq() > 1e-12) {
    return `Leave T's centre at ${tuple(new THREE.Vector3())} and move the teapot with a Transform Pipeline instead.`
  }
  const inPipeline = (workspace?.getBlocksByType('transform_pipeline', false) ?? []).some(
    (pipeline) => getInputBlock(pipeline, 'INPUT')?.id === IDS.teapot,
  )
  if (placed && !inPipeline) {
    return 'The teapot is in the right place, but move it with a Transform Pipeline, as this step asks.'
  }
  return null
}

function evaluate({ objects, workspace }) {
  const pipeline = l1Pipeline(workspace)
  const l1 = lineObject(objects, (data) => data.srcBlockId === IDS.l1)?.userData
  const l2 = lineObject(objects, (data) => data.srcBlockId === IDS.l2)?.userData
  const teapot = givenTeapot(objects)
  teapot?.updateMatrixWorld(true)
  const centre = teapot?.getWorldPosition(new THREE.Vector3())
  // The geometry is built at its size, so the tip sits at SPOUT_TIP x size locally.
  const tip = teapot?.localToWorld(SPOUT_TIP.clone().multiplyScalar(TEAPOT_SIZE))
  const lineN = { origin: new THREE.Vector3(), direction: N_DIRECTION }
  const teapotPlaced =
    Boolean(centre && tip && l2) &&
    lineThrough(lineN, centre) &&
    distanceToLine(tip, l2.origin, l2.direction) <= TOUCHING
  const teapotHint = teapotMoveHint(workspace, teapotPlaced)

  const steps = {
    pipelineL1: Boolean(pipeline),
    throughOrigin: Boolean(pipeline) && firstStepThroughOrigin(pipeline),
    throughTargets:
      Boolean(pipeline) && lineThrough(l1, SPHERE_S.centre, CUBE_K.centre, new THREE.Vector3()),
    vectors: [isVectorVA, isVectorVB].every((matches) =>
      (workspace?.getAllBlocks(false) ?? []).some(matches),
    ),
    crossProduct: (workspace?.getBlocksByType('vector_cross_product', false) ?? []).some(
      isNormalCrossProduct,
    ),
    vectorN: (workspace?.getAllBlocks(false) ?? []).some(isVectorVN),
    lineN: Boolean(lineObject(objects, isLineN)),
    doubled: (workspace?.getBlocksByType('vector_scale', false) ?? []).some(isDoubledN),
    teapot: teapotPlaced && !teapotHint,
  }
  const passed = Object.values(steps).every(Boolean)
  return {
    passed,
    correct: passed,
    incorrect: false,
    target: teapot,
    answer: { type: 'placement' },
    steps,
    partialSteps: { teapot: Boolean(teapotHint) },
    partialMessages: { teapot: teapotHint },
  }
}

// Named as soon as it exists, before it is plugged into the Cross Product, but
// never a line's own direction: L2's is parallel to VB.
const isLooseOrCrossed = (block) => {
  const parentType = block.getParent?.()?.type
  return !parentType || parentType === 'vector_cross_product'
}
const isGivenVector = (direction) => (block) =>
  POINT_VECTOR_BLOCK_TYPES.includes(block?.type) &&
  isLooseOrCrossed(block) &&
  vectorsAreParallel(vec3FromBlock(block), direction)
const isVectorVA = isGivenVector(L1_TARGET_DIRECTION)
const isVectorVB = isGivenVector(L2_DIRECTION)

function hasAncestorOfType(block, type) {
  for (let parent = block?.getParent?.(); parent; parent = parent.getParent()) {
    if (parent.type === type) return true
  }
  return false
}

// Where an animatable object falls in the task: Part A's pipeline, then n and
// 2n, then the teapot's pipeline. Null for anything the task does not ask for.
function taskStage(object, workspace) {
  const { srcBlockId } = object.userData
  if (srcBlockId === IDS.l1) return 0
  if (srcBlockId === IDS.teapot) return 3
  const block = workspace?.getBlockById(String(srcBlockId))
  // A Cross Product plugged straight into Scale Vector plays inside 2n's reveal.
  if (isNormalCrossProduct(block) && !hasAncestorOfType(block, 'vector_scale')) return 1
  if (block?.type === 'vector_scale' && isDoubledN(block)) return 2
  return null
}

// Play with nothing selected runs the whole task in order, not one block of it.
function animationSequence(objects, workspace) {
  return objects
    .filter((object) => typeof object?.userData?.animate === 'function')
    .map((object) => ({ object, stage: taskStage(object, workspace) }))
    .filter(({ stage }) => stage != null)
    .sort((a, b) => a.stage - b.stage)
    .map(({ object }) => object)
}

const tuple = ({ x, y, z }) => `(${[x, y, z].map((n) => Number(n.toFixed(2))).join(', ')})`

function Givens() {
  return (
    <div className="exercise-given-values" aria-label="Given values">
      <section>
        <h3>Objects</h3>
        <p>Teapot T: centre {tuple(new THREE.Vector3())}, size 1</p>
        <p>Sphere S: centre {tuple(SPHERE_S.centre)}</p>
        <p>Cube K: centre {tuple(CUBE_K.centre)}</p>
        <p>Spout tip: T + {tuple(SPOUT_TIP)}</p>
      </section>
      <section>
        <h3>Lines</h3>
        <p>
          L1: position {tuple(L1.point)}, direction {tuple(L1.direction)}
        </p>
        <p>
          L2: position {tuple(L2_POINT)}, direction {tuple(L2_DIRECTION)}
        </p>
      </section>
    </div>
  )
}

const StepItem = ({ done, hint, children }) => (
  <li className={done ? 'is-complete' : hint ? 'is-partial' : ''}>
    {children}
    {!done && hint && (
      <div className="exercise-step-actions">
        <span className="exercise-step-feedback" role="status">
          {hint}
        </span>
      </div>
    )}
  </li>
)

function Steps({ steps, partialMessages, passed }) {
  const passedClass = passed ? ' is-passed' : ''
  return (
    <>
      <ol className={`exercise-task-steps${passedClass}`} data-part="Part A: thread L1">
        <StepItem done={steps.pipelineL1}>
          Build: a Transform Pipeline with line L1 as its input.
        </StepItem>
        <StepItem done={steps.throughOrigin}>
          Transform: translate L1 by {tuple(L1_SHIFT)}, so it passes through the origin.
        </StepItem>
        <StepItem done={steps.throughTargets}>
          Transform: then rotate it {L1_TURN_DEGREES} degrees about the Y axis, so it runs through
          S, K and the teapot.
        </StepItem>
      </ol>
      <ol className={`exercise-task-steps${passedClass}`} data-part="Part B: move the teapot">
        <StepItem done={steps.vectors}>
          Create: two Vector blocks, VA = {tuple(L1_TARGET_DIRECTION)}, L1&apos;s new direction, and
          VB = {tuple(L2_DIRECTION)}, L2&apos;s direction.
        </StepItem>
        <StepItem done={steps.crossProduct}>
          Compute: n = VA &times; VB with the Cross Product block.
        </StepItem>
        <StepItem done={steps.vectorN}>
          Create: a Vector block VN using the values of n. Press show on the Cross Product to see
          them.
        </StepItem>
        <StepItem done={steps.lineN}>
          Create: line N through the teapot&apos;s centre {tuple(new THREE.Vector3())}, with the
          Cross Product n as its direction. You can plug the Cross Product straight into the
          line&apos;s Direction slot.
        </StepItem>
        <StepItem done={steps.doubled}>
          Compute: 2n with the Scale Vector block, a Scalar 2 and VN. Press show on Scale Vector to
          see 2n.
        </StepItem>
        <StepItem done={steps.teapot} hint={partialMessages?.teapot}>
          Transform: put the teapot in a Transform Pipeline and translate it by 2n, so its centre
          stays on N and its spout tip touches L2. You will have to type 2n&apos;s values into the
          Translate block by hand. Press show on Scale Vector to see them.
        </StepItem>
      </ol>
    </>
  )
}

export default {
  id: 'transform-object',
  kind: 'transform',
  hideAnswerCard: true,
  // Off the default 45 degrees, where L1 would read as horizontal and every line
  // across it, N included, as vertical on top of the Y axis.
  cameraView: { azimuthDeg: 30 },
  // Each part's pipeline has its steps in the order the task gives them.
  settingsOverrides: { pipelineStepAnimation: true },
  givenNames: [
    { name: 'T', matches: (block) => block.id === IDS.teapot },
    { name: 'S', matches: (block) => block.id === IDS.sphere },
    { name: 'K', matches: (block) => block.id === IDS.cube },
    { name: 'L1', matches: (block) => block.id === IDS.l1 },
    { name: 'L2', matches: (block) => block.id === IDS.l2 },
    { name: 'n', matches: isNormalCrossProduct },
    { name: 'VN', matches: isVectorVN },
    { name: '2n', matches: isDoubledN },
    {
      name: 'N',
      matches: (block) =>
        block.type === 'geo_vector' &&
        !String(block.id).startsWith('ex-') &&
        (getInputBlock(block, 'DIR')?.type === 'vector_cross_product' ||
          vectorsAreParallel(vec3FromBlock(getInputBlock(block, 'DIR')), N_DIRECTION)),
    },
    { name: 'VA', matches: isVectorVA },
    { name: 'VB', matches: isVectorVB },
  ],
  Givens,
  Steps,
  evaluate,
  solutionXml: SOLUTION_XML,
  animationSequence,
  seedWorkspace,
  ensureWorkspace,
}
