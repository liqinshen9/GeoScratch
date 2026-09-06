import {
  getTransformTargetObject,
  hasPipelineConnectedToTeapot,
  hasTargetTeapotBlock,
  hasScaleStepForTeapot,
  hasRotateStepForTeapot,
  rotationMatches,
  scaleMatches,
} from './shared/transformChecks'
import * as Blockly from 'blockly/core'

const COMBINED_SCALE_FACTOR = 2
const COMBINED_ROTATE_AXIS = 'Y'
const COMBINED_ROTATE_DEGREES = 45

// Purely decorative "given" blocks for the Transform exercise, so the
// workspace/scene doesn't read as one lone teapot floating in an empty room.
// These are real geo_sphere/geo_cube/geo_vector blocks, dropped straight
// into the student's own workspace (via Blockly.Xml.domToWorkspace) so they
// appear as actual blocks the student can see and move, not just rendered
// shapes with no block behind them. Fixed ids let the injection effect below
// find and remove any earlier copies before reseeding, so a layout change
// here actually reaches workspaces that already have an older copy saved
// from a previous visit, instead of silently keeping the stale positions.
const EXERCISE_BACKGROUND_BLOCK_IDS = [
  'ex-bg-sphere-1',
  'ex-bg-sphere-2',
  'ex-bg-cube-1',
  'ex-bg-line-1',
]

const EXERCISE_BACKGROUND_XML = `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="geo_sphere" id="ex-bg-sphere-1" x="-350" y="-350">
    <value name="RADIUS_INPUT">
      <block type="scalar" id="ex-bg-sphere-1-radius">
        <field name="scalar">0.6</field>
      </block>
    </value>
    <value name="CENTRE">
      <block type="linalg_vec3" id="ex-bg-sphere-1-centre">
        <field name="X">-4</field>
        <field name="Y">0.6</field>
        <field name="Z">-3</field>
      </block>
    </value>
  </block>
  <block type="geo_sphere" id="ex-bg-sphere-2" x="50" y="-350">
    <value name="RADIUS_INPUT">
      <block type="scalar" id="ex-bg-sphere-2-radius">
        <field name="scalar">0.4</field>
      </block>
    </value>
    <value name="CENTRE">
      <block type="linalg_vec3" id="ex-bg-sphere-2-centre">
        <field name="X">3.5</field>
        <field name="Y">0.4</field>
        <field name="Z">-4</field>
      </block>
    </value>
  </block>
  <block type="geo_cube" id="ex-bg-cube-1" x="-350" y="50">
    <value name="SIDE_LENGTH_INPUT">
      <block type="scalar" id="ex-bg-cube-1-side-length">
        <field name="scalar">1.1</field>
      </block>
    </value>
    <value name="CENTRE">
      <block type="linalg_vec3" id="ex-bg-cube-1-centre">
        <field name="X">4</field>
        <field name="Y">0.55</field>
        <field name="Z">2.5</field>
      </block>
    </value>
  </block>
  <block type="geo_vector" id="ex-bg-line-1" x="50" y="50">
    <value name="POS">
      <block type="linalg_vec3" id="ex-bg-line-1-pos">
        <field name="X">-5</field>
        <field name="Y">0</field>
        <field name="Z">3</field>
      </block>
    </value>
    <value name="DIR">
      <block type="linalg_vec3" id="ex-bg-line-1-dir">
        <field name="X">1</field>
        <field name="Y">0</field>
        <field name="Z">-0.6</field>
      </block>
    </value>
  </block>
</xml>`

/**
 * Drops the decorative "given" blocks straight into the student's workspace.
 *
 * Re-entering the exercise restores previously-saved workspace XML, which may
 * hold an older copy of these blocks at outdated positions -- remove those by
 * id first, then reseed, so a layout change here always reaches an
 * already-saved workspace instead of silently keeping the stale positions.
 */
function seedWorkspace(workspace) {
  try {
    EXERCISE_BACKGROUND_BLOCK_IDS.map((id) => workspace.getBlockById(id))
      .filter(Boolean)
      .forEach((block) => block.dispose())
    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(EXERCISE_BACKGROUND_XML), workspace)
  } catch (err) {
    console.error('[GeoScratch] Failed to seed exercise background blocks:', err)
  }
}

function Givens() {
  return (
    <div className="exercise-given-values" aria-label="Given values">
      <section>
        <h3>Teapot</h3>
        <p>Centre = (0, 0, 0)</p>
        <p>Size = 1</p>
      </section>
      <section>
        <h3>Target</h3>
        <p>Scale factor = 2 (all axes)</p>
        <p>Rotate 45&deg; about the Y axis</p>
      </section>
    </div>
  )
}

function Steps({ steps, passed }) {
  return (
    <ol className={`exercise-task-steps${passed ? ' is-passed' : ''}`}>
      <li className={steps.teapot ? 'is-complete' : ''}>
        Create: Teapot at (0, 0, 0) with size Scalar 1.
      </li>
      <li className={steps.pipeline ? 'is-complete' : ''}>
        Build: a Transform Pipeline and connect its input to the Teapot.
      </li>
      <li className={steps.scale ? 'is-complete' : ''}>
        Add: a Scale Matrix (sx=2, sy=2, sz=2) as a step in the pipeline.
      </li>
      <li className={steps.rotate ? 'is-complete' : ''}>
        Add: a Rotation Matrix (axis Y, 45 degrees) as another step in the pipeline. Order does not
        matter.
      </li>
    </ol>
  )
}

function evaluate({ objects, workspace }) {
  const target = getTransformTargetObject(objects)
  const poseIsCorrect =
    scaleMatches(target, COMBINED_SCALE_FACTOR) &&
    rotationMatches(target, COMBINED_ROTATE_AXIS, COMBINED_ROTATE_DEGREES)
  const hasBothSteps =
    hasScaleStepForTeapot(workspace, COMBINED_SCALE_FACTOR) &&
    hasRotateStepForTeapot(workspace, COMBINED_ROTATE_AXIS, COMBINED_ROTATE_DEGREES)
  const passed = Boolean(target) && poseIsCorrect && hasBothSteps

  return {
    passed,
    // Green as soon as the object's pose is right; `passed` additionally
    // requires the pipeline step that produced it.
    correct: Boolean(target) && poseIsCorrect,
    incorrect: Boolean(target) && !poseIsCorrect,
    target,
    answer: { type: 'scaleAndRotation' },
    steps: {
      teapot: hasTargetTeapotBlock(workspace),
      pipeline: hasPipelineConnectedToTeapot(workspace),
      scale: hasScaleStepForTeapot(workspace, COMBINED_SCALE_FACTOR),
      rotate: hasRotateStepForTeapot(workspace, COMBINED_ROTATE_AXIS, COMBINED_ROTATE_DEGREES),
      both: passed,
    },
  }
}

export default {
  number: 3,
  kind: 'transform',
  Givens,
  Steps,
  evaluate,
  seedWorkspace,
}
