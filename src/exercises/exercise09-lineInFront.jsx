import { seedBackgroundBlocks } from './shared/seedBackgroundBlocks'

// A "look and answer" exercise: two crossing lines are prefilled as real blocks
// and the student picks which one is in front. The choices live in the `mcq`
// descriptor; ExercisePage renders them via shared/PerceptualQuestion.

const SEED_BLOCK_IDS = ['q9-line-a', 'q9-line-b']

// Where the two lines effectively sit; camera-space distance from the default
// view ([0, 25, 50]) decides which reads as "in front".
const LINE_A_POINT = [0, 0, 3]
const LINE_B_POINT = [0, 0, -3]
const distToDefaultCamera = ([x, y, z]) => Math.hypot(0 - x, 25 - y, 50 - z)
const CORRECT_ID = distToDefaultCamera(LINE_A_POINT) < distToDefaultCamera(LINE_B_POINT) ? 'a' : 'b'

const CHOICES = [
  { id: 'a', label: 'The first line (L1)' },
  { id: 'b', label: 'The second line (L2)' },
]

const SEED_XML = `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="geo_vector" id="q9-line-a" x="-350" y="-350">
    <value name="POS">
      <block type="linalg_vec3" id="q9-line-a-pos">
        <field name="X">${LINE_A_POINT[0]}</field>
        <field name="Y">${LINE_A_POINT[1]}</field>
        <field name="Z">${LINE_A_POINT[2]}</field>
      </block>
    </value>
    <value name="DIR">
      <block type="linalg_vec3" id="q9-line-a-dir">
        <field name="X">1</field><field name="Y">0</field><field name="Z">0</field>
      </block>
    </value>
  </block>
  <block type="geo_vector" id="q9-line-b" x="50" y="-350">
    <value name="POS">
      <block type="linalg_vec3" id="q9-line-b-pos">
        <field name="X">${LINE_B_POINT[0]}</field>
        <field name="Y">${LINE_B_POINT[1]}</field>
        <field name="Z">${LINE_B_POINT[2]}</field>
      </block>
    </value>
    <value name="DIR">
      <block type="linalg_vec3" id="q9-line-b-dir">
        <field name="X">1</field><field name="Y">0.3</field><field name="Z">0</field>
      </block>
    </value>
  </block>
</xml>`

function seedWorkspace(workspace) {
  seedBackgroundBlocks(workspace, SEED_BLOCK_IDS, SEED_XML)
}

const mcq = {
  prompt: 'The two lines cross. Which line passes in front of the other?',
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
  id: 'line-in-front',
  kind: 'perceptual',
  mcq,
  Givens,
  Steps,
  evaluate,
  seedWorkspace,
}
