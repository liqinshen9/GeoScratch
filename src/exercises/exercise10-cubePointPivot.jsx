import THREE from '@/utils/three'
import { useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import usePivotPlaybackStore from '@/store/usePivotPlaybackStore'
import { installPivotStepAnimation } from './shared/pivotStepAnimation'
import { pipelineStepChain, rotationMatches } from './shared/transformChecks'
import { closeNumber, blockMatchesVec3, getInputBlock, scalarInputMatches, vectorMatches } from './shared/blockQueries'
import { createPointMarker } from '@/utils/pointMarker'
import { formatVectorLive } from '@/utils/vectorNotation'
import { COLOR_ROLES } from '@/store/colorPresets'

const CENTRE = new THREE.Vector3(1, 1, 1)
const POINT = new THREE.Vector3(0, 2, 2)
function cubeMatches(block) {
  return block?.type === 'geo_cube' && blockMatchesVec3(getInputBlock(block, 'CENTRE'), CENTRE) && scalarInputMatches(block, 'SIDE_LENGTH_INPUT', 2, 1)
}
function pointMatches(block) {
  return block?.type === 'linalg_point' && blockMatchesVec3(block, POINT)
}
function pairMatches(block) {
  if (block?.type === 'geo_special_cube') return true
  return block?.type === 'geo_object_with_point' && cubeMatches(getInputBlock(block, 'OBJECT')) && pointMatches(getInputBlock(block, 'POINT'))
}
function translateMatches(block, value) {
  return block?.type === 'trans_matrix' && ['TX', 'TY', 'TZ'].every((field) => closeNumber(block.getFieldValue(field), value))
}

function Diagram({ output }) {
  const project = ([x, y, z]) => [130 + x * 52 - z * 30, 205 - y * 55 + z * 20]
  const vertices = [[0,0,0],[2,0,0],[2,2,0],[0,2,0],[0,0,2],[2,0,2],[2,2,2],[0,2,2]]
  const polygon = (indices) => indices.map((i) => project(vertices[i]).join(',')).join(' ')
  const p = project(output ? [2,2,2] : [0,2,2])
  const c = project([1,1,1])
  return <svg viewBox="0 0 330 295" role="img" aria-label={output ? 'Output cube: P at (2, 2, 2)' : 'Input cube: upper-left P at (0, 2, 2)'} style={{ width: '100%', maxWidth: 185, display: 'block' }}>
    <rect width="330" height="295" fill="#f8fafc" />
    {[[3,0,0],[0,3,0],[0,0,3]].map((end, i) => { const a = project([0,0,0]); const b = project(end); return <g key={i}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#475569" /><text x={b[0]+5} y={b[1]} fontSize="14">{['X','Y','Z'][i]}</text></g> })}
    <polygon points={polygon([0,1,2,3])} fill="#e4cce9" stroke="#475569" strokeDasharray="4 3" />
    <polygon points={polygon([1,5,6,2])} fill="#9256a0" stroke="#334155" />
    <polygon points={polygon([3,2,6,7])} fill="#c99ad3" stroke="#334155" />
    <polygon points={polygon([4,5,6,7])} fill="#af70bc" fillOpacity="0.8" stroke="#334155" />
    <circle cx={c[0]} cy={c[1]} r="4" fill="#334155" /><text x={c[0]+8} y={c[1]+18} fontSize="12">C (1, 1, 1)</text>
    <circle cx={p[0]} cy={p[1]} r="7" fill="#e63946" stroke="white" strokeWidth="2" />
    <text x={p[0]-20} y={p[1]-14} fontSize="13" fill="#b91c1c">P {output ? '(2, 2, 2)' : '(0, 2, 2)'}</text>
  </svg>
}
function Givens() {
  return <div className="exercise-given-values" aria-label="Input and output images">
    <section><p>Given is a cube with side length 2 as illustrated in the image below</p><Diagram /></section>
    <section><p>please manipulate blocks in the toolbox to rotate this cube as illustrated in the image below.</p><Diagram output /></section>
  </div>
}
function Steps({ steps, passed }) {
  const tasks = [
    ['cube', 'Create: a Cube with Scalar 2 for side length and Vector (1, 1, 1) for its centre.'],
    ['point', 'Create: a Point at the input corner P = (0, 2, 2).'],
    ['pair', 'My Blocks: save the cube and point as a composite block in My Blocks. Name it however you like. Then select it from My Blocks.'],
    ['pipeline', 'Transform: connect the new block you created to a Transform Pipeline.'],
    ['toOrigin', 'Transform: translate by the negative of center C, (-1, -1, -1). The goal is to move the block to the origin.'],
    ['rotate', 'Transform: Rotate around Y axis by 90 degrees.'],
    ['back', 'Transform: translate (1, 1, 1) back to its original center C.'],
  ]
  return <ol className={`exercise-task-steps${passed ? ' is-passed' : ''}`}>{tasks.map(([key, text]) => <li key={key} className={steps[key] ? 'is-complete' : ''}>{text}</li>)}</ol>
}
function evaluate({ objects, workspace }) {
  const blocks = (type) => workspace?.getBlocksByType(type, false) ?? []
  const pipeline = blocks('transform_pipeline').find((b) => pairMatches(getInputBlock(b, 'INPUT')))
  const chain = pipelineStepChain(pipeline)
  const pairBlock = getInputBlock(pipeline, 'INPUT')
  const special = blocks('geo_special_cube').length > 0
  const target = objects.find((o) => o?.userData?.geoType === 'object_with_point' && (!pairBlock || o.userData.srcBlockId === pairBlock.id))
  const cube = target?.children.find((o) => o.userData?.geoType === 'geo_cube')
  const marker = target?.children.find((o) => o.userData?.geoType === 'attached_corner_point')
  target?.updateMatrixWorld(true)
  const poseIsCorrect = Boolean(cube && marker) && vectorMatches(cube.getWorldPosition(new THREE.Vector3()), CENTRE) && vectorMatches(marker.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(2, 2, 2)) && rotationMatches(target, 'Y', 90)
  const steps = {
    cube: special || blocks('geo_cube').some(cubeMatches),
    point: special || blocks('linalg_point').some(pointMatches),
    pair: special,
    pipeline: Boolean(pipeline),
    toOrigin: translateMatches(chain[0], -1),
    rotate: chain[1]?.type === 'rot_matrix' && chain[1].getFieldValue('AXIS') === 'Y' && closeNumber(chain[1].getFieldValue('DEGREES'), 90),
    back: translateMatches(chain[2], 1),
  }
  return { passed: poseIsCorrect && chain.length === 3 && Object.values(steps).every(Boolean), correct: poseIsCorrect, incorrect: false, target, answer: { type: 'scaleAndRotation' }, steps }
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
    xmlText: '<xml xmlns="https://developers.google.com/blockly/xml"><block type="geo_special_cube" /></xml>',
  }
}
function decorateObjects(objects, workspace) {
  for (const pipeline of workspace?.getBlocksByType('transform_pipeline', false) ?? []) {
    const input = getInputBlock(pipeline, 'INPUT')
    if (input?.type !== 'geo_special_cube') continue
    const object = objects.find((o) => o.userData?.srcBlockId === input.id)
    if (!object) continue
    const cube = object.children.find((child) => child.userData?.geoType === 'geo_cube')
    if (cube && !object.userData.pivotCenterMarker) {
      const color = window.GeoScratchColors.forRole(COLOR_ROLES.ACCENT)
      const centerMarker = createPointMarker({ color, geoType: 'pivot_center_point' })
      centerMarker.position.copy(cube.position)
      centerMarker.visible = false
      object.add(centerMarker)
      object.userData.pivotCenterMarker = centerMarker
      // A normal label on the top-level group, shown only while the marker is.
      object.userData.labelAnchors = {
        ...object.userData.labelAnchors,
        c: { type: 'local', position: cube.position.toArray() },
      }
      object.userData.labels = [
        ...(object.userData.labels ?? []),
        {
          anchor: 'c',
          name: 'C',
          get value() { return formatVectorLive(centerMarker.getWorldPosition(new THREE.Vector3())) },
          color,
          revealed: () => centerMarker.visible,
        },
      ]
    }
    installPivotStepAnimation(object, pipelineStepChain(pipeline), workspace)
  }
  return objects
}
function AnimationButton({ objects, workspace }) {
  const target = objects.find((o) => typeof o?.userData?.animateSteps === 'function')
  useEffect(() => () => {
    usePivotPlaybackStore.getState().stop()
    workspace?.highlightBlock?.(null)
  }, [workspace])
  return <button type="button" className="exercise-step-animation" disabled={!target} onClick={() => {
    usePivotPlaybackStore.getState().play(target)
  }}><FontAwesomeIcon icon="fa-solid fa-play" /> Show animation</button>
}
export default { id: 'cube-point-pivot-rotation', kind: 'transform', hideAnswerCard: true, Givens, Steps, evaluate, solutionXml, getReusableBlockTemplate, decorateObjects, AnimationButton, settingsOverrides: {
  cubeShowEdges: true,
  objectsReceiveShadows: false,
  primitivesCastShadows: false,
  pointShadowsEnabled: false,
  cameraShadowsEnabled: false,
  objectHighlightStyle: 'glow',
  showLabels: true,
  labelDetail: 'nameAndValue',
} }
