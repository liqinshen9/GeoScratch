import { seedBackgroundBlocks } from './shared/seedBackgroundBlocks'

// A "look and answer" exercise: the scene is prefilled with real blocks and the
// student picks an answer instead of building. The choices live in the `mcq`
// descriptor; ExercisePage renders them via shared/PerceptualQuestion and logs
// the pick. Same module contract as every other exercise otherwise.

const SEED_BLOCK_IDS = ['q8-cube', 'q8-sphere']

// Camera-space distances for the default view ([0, 25, 50]) decide the answer.
const CUBE_CENTRE = [4, 0.55, 2.5]
const SPHERE_CENTRE = [-4, 0.6, -3]
const distToDefaultCamera = ([x, y, z]) => Math.hypot(0 - x, 25 - y, 50 - z)
const CORRECT_ID =
  distToDefaultCamera(CUBE_CENTRE) < distToDefaultCamera(SPHERE_CENTRE) ? 'cube' : 'sphere'

const CHOICES = [
  { id: 'cube', label: 'The cube' },
  { id: 'sphere', label: 'The sphere' },
  { id: 'same', label: 'They are the same distance away' },
]

const SEED_XML = `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="geo_cube" id="q8-cube" x="-350" y="-350">
    <value name="SIDE_LENGTH_INPUT">
      <block type="scalar" id="q8-cube-size"><field name="scalar">1.4</field></block>
    </value>
    <value name="CENTRE">
      <block type="linalg_vec3" id="q8-cube-centre">
        <field name="X">${CUBE_CENTRE[0]}</field>
        <field name="Y">${CUBE_CENTRE[1]}</field>
        <field name="Z">${CUBE_CENTRE[2]}</field>
      </block>
    </value>
  </block>
  <block type="geo_sphere" id="q8-sphere" x="50" y="-350">
    <value name="RADIUS_INPUT">
      <block type="scalar" id="q8-sphere-radius"><field name="scalar">0.9</field></block>
    </value>
    <value name="CENTRE">
      <block type="linalg_vec3" id="q8-sphere-centre">
        <field name="X">${SPHERE_CENTRE[0]}</field>
        <field name="Y">${SPHERE_CENTRE[1]}</field>
        <field name="Z">${SPHERE_CENTRE[2]}</field>
      </block>
    </value>
  </block>
</xml>`

function seedWorkspace(workspace) {
  seedBackgroundBlocks(workspace, SEED_BLOCK_IDS, SEED_XML)
}

const mcq = {
  prompt: 'Which object is closer to the camera?',
  choices: CHOICES,
  correctId: CORRECT_ID,
}

// The question UI is rendered by ExercisePage from `mcq`; Givens/Steps stay as
// no-op components to keep the shared module contract.
function Givens() {
  return null
}

function Steps() {
  return null
}

function evaluate() {
  return {
    passed: false,
    correct: false,
    incorrect: false,
    steps: {},
    answer: { value: null },
  }
}

export default {
  id: 'closer-object',
  kind: 'perceptual',
  mcq,
  Givens,
  Steps,
  evaluate,
  seedWorkspace,
}
