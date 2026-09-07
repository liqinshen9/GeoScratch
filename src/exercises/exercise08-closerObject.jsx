import * as Blockly from 'blockly/core'
import { useState } from 'react'

// A "look and answer" exercise: the scene is prefilled with real blocks and the
// student picks an answer instead of building. Everything here uses the same
// module contract as every other exercise (seedWorkspace + Givens + Steps +
// evaluate).

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
      <p style={{ fontSize: '0.95rem', lineHeight: 1.4 }}>Which object is closer to the camera?</p>
      <div style={{ display: 'grid', gap: '0.4rem' }}>
        {CHOICES.map((choice) => (
          <label
            key={choice.id}
            style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.95rem' }}
          >
            <input
              type="radio"
              name="question-8"
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
  number: 8,
  kind: 'perceptual',
  Givens,
  Steps,
  evaluate,
  seedWorkspace,
}
