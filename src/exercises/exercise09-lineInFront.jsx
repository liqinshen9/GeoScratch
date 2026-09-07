import * as Blockly from 'blockly/core'
import { useState } from 'react'

// A "look and answer" exercise: two crossing lines are prefilled as real blocks
// and the student picks which one is in front. Same module contract as every
// other exercise.

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
  try {
    SEED_BLOCK_IDS.map((id) => workspace.getBlockById(id))
      .filter(Boolean)
      .forEach((block) => block.dispose())
    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(SEED_XML), workspace)
  } catch (err) {
    console.error('[GeoScratch] Failed to seed question blocks:', err)
  }
}

function Givens() {
  const [picked, setPicked] = useState(null)
  return (
    <div aria-label="Question" style={{ display: 'grid', gap: '0.75rem' }}>
      <p style={{ fontSize: '0.95rem', lineHeight: 1.4 }}>
        The two lines cross. Which line passes in front of the other?
      </p>
      <div style={{ display: 'grid', gap: '0.4rem' }}>
        {CHOICES.map((choice) => (
          <label
            key={choice.id}
            style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.95rem' }}
          >
            <input
              type="radio"
              name="question-9"
              checked={picked === choice.id}
              onChange={() => setPicked(choice.id)}
            />
            {choice.label}
          </label>
        ))}
      </div>
      {picked && (
        <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>
          {picked === CORRECT_ID ? 'Correct.' : 'Not quite — try looking again.'}
        </p>
      )}
    </div>
  )
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
  number: 9,
  kind: 'perceptual',
  Givens,
  Steps,
  evaluate,
  seedWorkspace,
}
