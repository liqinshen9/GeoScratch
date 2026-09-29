import THREE from '@/utils/three'
import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import usePivotPlaybackStore from '@/store/usePivotPlaybackStore'
import useSettingsStore from '@/store/useSettingsStore'
import { installPivotStepAnimation } from './shared/pivotStepAnimation'
import { pipelineStepChain, rotationMatches } from './shared/transformChecks'
import {
  POINT_VECTOR_BLOCK_TYPES,
  closeNumber,
  blockMatchesVec3,
  getInputBlock,
  scalarInputMatches,
  vectorMatches,
} from './shared/blockQueries'
import { createPointMarker } from '@/utils/pointMarker'
import { formatVectorLive } from '@/utils/vectorNotation'
import { COLOR_ROLES } from '@/store/colorPresets'

const CENTRE = new THREE.Vector3(1, 1, 1)
const POINT = new THREE.Vector3(0, 2, 2)
function cubeMatches(block) {
  return (
    block?.type === 'geo_cube' &&
    blockMatchesVec3(getInputBlock(block, 'CENTRE'), CENTRE) &&
    scalarInputMatches(block, 'SIDE_LENGTH_INPUT', 2, 1)
  )
}
function cubeHasRequiredInputs(block) {
  return (
    block?.type === 'geo_cube' &&
    POINT_VECTOR_BLOCK_TYPES.includes(getInputBlock(block, 'CENTRE')?.type) &&
    getInputBlock(block, 'SIDE_LENGTH_INPUT')?.type === 'scalar'
  )
}
function pointMatches(block) {
  return block?.type === 'linalg_point' && blockMatchesVec3(block, POINT)
}
function pairMatches(block) {
  if (block?.type === 'geo_special_cube') return true
  return (
    block?.type === 'geo_object_with_point' &&
    cubeMatches(getInputBlock(block, 'OBJECT')) &&
    pointMatches(getInputBlock(block, 'POINT'))
  )
}
function translateMatches(block, value) {
  return (
    block?.type === 'trans_matrix' &&
    ['TX', 'TY', 'TZ'].every((field) => closeNumber(block.getFieldValue(field), value))
  )
}

function Diagram({ output }) {
  const project = ([x, y, z]) => [130 + x * 52 - z * 30, 205 - y * 55 + z * 20]
  const vertices = [
    [0, 0, 0],
    [2, 0, 0],
    [2, 2, 0],
    [0, 2, 0],
    [0, 0, 2],
    [2, 0, 2],
    [2, 2, 2],
    [0, 2, 2],
  ]
  const polygon = (indices) => indices.map((i) => project(vertices[i]).join(',')).join(' ')
  const p = project(output ? [2, 2, 2] : [0, 2, 2])
  const c = project([1, 1, 1])
  return (
    <svg
      viewBox="0 0 330 295"
      role="img"
      aria-label={output ? 'Output cube: P at (2, 2, 2)' : 'Input cube: upper-left P at (0, 2, 2)'}
      style={{ width: '100%', maxWidth: 185, display: 'block' }}
    >
      <rect width="330" height="295" fill="#f8fafc" />
      {[
        [3, 0, 0],
        [0, 3, 0],
        [0, 0, 3],
      ].map((end, i) => {
        const a = project([0, 0, 0])
        const b = project(end)
        return (
          <g key={i}>
            <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#475569" />
            <text x={b[0] + 5} y={b[1]} fontSize="14">
              {['X', 'Y', 'Z'][i]}
            </text>
          </g>
        )
      })}
      <polygon
        points={polygon([0, 1, 2, 3])}
        fill="#e4cce9"
        stroke="#475569"
        strokeDasharray="4 3"
      />
      <polygon points={polygon([1, 5, 6, 2])} fill="#9256a0" stroke="#334155" />
      <polygon points={polygon([3, 2, 6, 7])} fill="#c99ad3" stroke="#334155" />
      <polygon points={polygon([4, 5, 6, 7])} fill="#af70bc" fillOpacity="0.8" stroke="#334155" />
      <circle cx={c[0]} cy={c[1]} r="4" fill="#334155" />
      <text x={c[0] + 8} y={c[1] + 18} fontSize="12">
        C (1, 1, 1)
      </text>
      <circle cx={p[0]} cy={p[1]} r="7" fill="#e63946" stroke="white" strokeWidth="2" />
      <text x={p[0] - 20} y={p[1] - 14} fontSize="13" fill="#b91c1c">
        P {output ? '(2, 2, 2)' : '(0, 2, 2)'}
      </text>
    </svg>
  )
}
// Non-breaking, so a narrow panel never wraps a coordinate mid-tuple.
const tuple = (...values) => `(${values.join(',\u00a0')})`

function Givens() {
  return (
    <div className="exercise-given-values" aria-label="Input and output images">
      <section>
        <h3>Start</h3>
        <p className="exercise-given-prose">
          A cube with side length 2 and centre C = {tuple(1, 1, 1)}. P is the corner at{' '}
          {tuple(0, 2, 2)}.
        </p>
        <Diagram />
      </section>
      <section>
        <h3>Goal</h3>
        <p className="exercise-given-prose">
          Use the blocks in the toolbox to rotate the cube so that it ends up as shown below.
        </p>
        <Diagram output />
      </section>
    </div>
  )
}
function Steps({ steps, partialSteps, partialMessages, feedbackRevision, passed }) {
  const [checkedSteps, setCheckedSteps] = useState({})
  const pendingCheckRef = useRef(0)

  useEffect(() => {
    setCheckedSteps({})
  }, [feedbackRevision])

  useEffect(
    () => () => {
      window.clearTimeout(pendingCheckRef.current)
    },
    [],
  )

  const checkStep = (key) => {
    window.clearTimeout(pendingCheckRef.current)
    pendingCheckRef.current = window.setTimeout(() => {
      setCheckedSteps((checked) => ({ ...checked, [key]: true }))
    }, 100)
  }

  const tasks = [
    ['cube', `Create: a Cube C with side length Scalar 2 and centre Point ${tuple(1, 1, 1)}.`],
    ['point', `Create: a Point P = ${tuple(0, 2, 2)}, the corner of the cube.`],
    [
      'pair',
      'My Blocks: save the cube and P together as one block, with any name you like. Then drag your new block out of My Blocks into the workspace.',
    ],
    [
      'cleanup',
      'Clean up: drag the original Cube and Point blocks to the bin, so only your new block is left.',
    ],
    ['pipeline', "Transform: connect your new block to a Transform Pipeline's input."],
    [
      'toOrigin',
      `Transform: translate by -C = ${tuple(-1, -1, -1)}. This moves the centre of the cube to the origin.`,
    ],
    ['rotate', 'Transform: rotate 90 degrees about the Y axis.'],
    [
      'back',
      `Transform: translate by C = ${tuple(1, 1, 1)}. This moves the centre back to where it started.`,
    ],
  ]
  const currentKey = tasks.find(([key]) => !steps[key])?.[0]
  return (
    <ol className={`exercise-task-steps${passed ? ' is-passed' : ''}`}>
      {tasks.map(([key, text]) => {
        const isCurrent = key === currentKey && !passed
        const wasChecked = isCurrent && checkedSteps[key]
        return (
          <li key={key} className={steps[key] ? 'is-complete' : wasChecked ? 'is-partial' : ''}>
            {text}
            {isCurrent && (
              <div className="exercise-step-actions">
                <button
                  type="button"
                  className="exercise-step-check"
                  onClick={() => checkStep(key)}
                >
                  Check
                </button>
                {wasChecked && (
                  <span className="exercise-step-feedback" role="status">
                    {partialSteps?.[key]
                      ? partialMessages?.[key] || 'One of the values does not match the diagram.'
                      : 'This step is not complete yet.'}
                  </span>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
function evaluate({ objects, workspace }) {
  const blocks = (type) => workspace?.getBlocksByType(type, false) ?? []
  const pipeline = blocks('transform_pipeline').find((b) => pairMatches(getInputBlock(b, 'INPUT')))
  const chain = pipelineStepChain(pipeline)
  const pairBlock = getInputBlock(pipeline, 'INPUT')
  const special = blocks('geo_special_cube').length > 0
  const target = objects.find(
    (o) =>
      o?.userData?.geoType === 'object_with_point' &&
      (!pairBlock || o.userData.srcBlockId === pairBlock.id),
  )
  const cube = target?.children.find((o) => o.userData?.geoType === 'geo_cube')
  const marker = target?.children.find((o) => o.userData?.geoType === 'attached_corner_point')
  target?.updateMatrixWorld(true)
  const poseIsCorrect =
    Boolean(cube && marker) &&
    vectorMatches(cube.getWorldPosition(new THREE.Vector3()), CENTRE) &&
    vectorMatches(marker.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(2, 2, 2)) &&
    rotationMatches(target, 'Y', 90)
  const hasOriginalCubeAndPoint =
    blocks('geo_cube').some(cubeMatches) ||
    blocks('linalg_point').some(pointMatches) ||
    blocks('geo_object_with_point').some(pairMatches)
  const steps = {
    cube: special || blocks('geo_cube').some(cubeMatches),
    point: special || blocks('linalg_point').some(pointMatches),
    pair: special,
    cleanup: special && !hasOriginalCubeAndPoint,
    pipeline: Boolean(pipeline),
    toOrigin: translateMatches(chain[0], -1),
    rotate:
      chain[1]?.type === 'rot_matrix' &&
      chain[1].getFieldValue('AXIS') === 'Y' &&
      closeNumber(chain[1].getFieldValue('DEGREES'), 90),
    back: translateMatches(chain[2], 1),
  }
  const partialSteps = {
    cube: !steps.cube && blocks('geo_cube').some(cubeHasRequiredInputs),
    point:
      !steps.point &&
      blocks('linalg_point').some((block) => block.getParent?.()?.type !== 'geo_cube'),
    toOrigin: !steps.toOrigin && chain[0]?.type === 'trans_matrix',
    rotate: !steps.rotate && chain[1]?.type === 'rot_matrix',
    back: !steps.back && chain[2]?.type === 'trans_matrix',
  }
  const partialMessages = {
    rotate:
      partialSteps.rotate && chain[1].getFieldValue('AXIS') !== 'Y'
        ? 'The rotation axis does not match the diagram.'
        : null,
  }
  return {
    passed: poseIsCorrect && chain.length === 3 && Object.values(steps).every(Boolean),
    correct: poseIsCorrect,
    incorrect: false,
    target,
    answer: { type: 'scaleAndRotation' },
    steps,
    partialSteps,
    partialMessages,
  }
}
const solutionXml = `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="transform_pipeline" x="60" y="60"><value name="INPUT"><block type="geo_special_cube" /></value><statement name="STEPS"><block type="trans_matrix"><field name="TX">-1</field><field name="TY">-1</field><field name="TZ">-1</field><next><block type="rot_matrix"><field name="AXIS">Y</field><field name="DEGREES">90</field><next><block type="trans_matrix"><field name="TX">1</field><field name="TY">1</field><field name="TZ">1</field></block></next></block></next></block></statement></block>
</xml>`
function getReusableBlockTemplate({ workspace }) {
  const cubes = workspace?.getBlocksByType('geo_cube', false) ?? []
  const points = workspace?.getBlocksByType('linalg_point', false) ?? []
  if (!cubes.some(cubeMatches) || !points.some(pointMatches)) return null
  return {
    defaultName: 'special block',
    description: 'Save the cube and its corner point together as special block.',
    source: 'exercise',
    xmlText:
      '<xml xmlns="https://developers.google.com/blockly/xml"><block type="geo_special_cube" /></xml>',
  }
}
function addPivotCentre(object) {
  const cube = object.children.find((child) => child.userData?.geoType === 'geo_cube')
  if (!cube || object.userData.pivotCenterMarker) return
  const color = window.GeoScratchColors.forRole(COLOR_ROLES.ACCENT)
  const centerMarker = createPointMarker({ color, geoType: 'pivot_center_point' })
  centerMarker.position.copy(cube.position)
  centerMarker.visible = false
  object.add(centerMarker)
  object.userData.pivotCenterMarker = centerMarker
  // On the top-level group, since a nested cube's own label does not render.
  object.userData.labelAnchors = {
    ...object.userData.labelAnchors,
    c: { type: 'local', position: cube.position.toArray() },
  }
  object.userData.labels = [
    ...(object.userData.labels ?? []),
    {
      anchor: 'c',
      name: 'C',
      get value() {
        return formatVectorLive(centerMarker.getWorldPosition(new THREE.Vector3()))
      },
      color,
      revealed: () =>
        centerMarker.visible || Boolean(useSettingsStore.getState().settings.cubeShowCentre),
    },
  ]
}
function decorateObjects(objects, workspace) {
  const pipelines = workspace?.getBlocksByType('transform_pipeline', false) ?? []
  for (const special of workspace?.getBlocksByType('geo_special_cube', false) ?? []) {
    const object = objects.find((o) => o.userData?.srcBlockId === special.id)
    if (!object) continue
    addPivotCentre(object)
    const pipeline = pipelines.find((p) => getInputBlock(p, 'INPUT')?.id === special.id)
    if (pipeline) installPivotStepAnimation(object, pipelineStepChain(pipeline), workspace)
  }
  return objects
}
function AnimationButton({ objects, workspace }) {
  const target = objects.find((o) => typeof o?.userData?.animateSteps === 'function')
  useEffect(
    () => () => {
      usePivotPlaybackStore.getState().stop()
      workspace?.highlightBlock?.(null)
    },
    [workspace],
  )
  return (
    <button
      type="button"
      className="exercise-step-animation"
      disabled={!target}
      onClick={() => {
        usePivotPlaybackStore.getState().play(target)
      }}
    >
      <FontAwesomeIcon icon="fa-solid fa-play" /> Show animation
    </button>
  )
}
export default {
  id: 'cube-point-pivot-rotation',
  kind: 'transform',
  hideAnswerCard: true,
  Givens,
  Steps,
  evaluate,
  solutionXml,
  getReusableBlockTemplate,
  decorateObjects,
  AnimationButton,
  // The cube, not its centre point, is C: a plugged-in point draws no label,
  // and the cube's label shows its centre, so it reads C = (1, 1, 1).
  givenNames: [
    { name: 'C', matches: cubeMatches },
    { name: 'P', matches: pointMatches },
  ],
  settingsOverrides: {
    cubeShowEdges: true,
    cubeShowCentre: true,
    objectsReceiveShadows: false,
    primitivesCastShadows: false,
    pointShadowsEnabled: false,
    cameraShadowsEnabled: false,
    objectHighlightStyle: 'glow',
    showLabels: true,
    labelDetail: 'nameAndValue',
  },
}
