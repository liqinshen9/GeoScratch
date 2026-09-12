import {
  getTransformTargetObject,
  hasPipelineConnectedToTeapot,
  hasTargetTeapotBlock,
  hasRotateStepForTeapot,
  rotationMatches,
} from './shared/transformChecks'
import { teapotPipelineSolution } from './shared/fillSolution'

const ROTATE_AXIS = 'Z'
const ROTATE_DEGREES = 90

// The worked solution, loaded by the dev-only "Fill solution" control.
const SOLUTION_XML = teapotPipelineSolution(
  `<block type="rot_matrix"><field name="AXIS">Z</field><field name="DEGREES">90</field></block>`,
)

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
        <p>Rotate 90&deg; about the Z axis</p>
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
      <li className={steps.rotate ? 'is-complete' : ''}>
        Add: a Rotation Matrix (axis Z, 90 degrees) as a step in the pipeline.
      </li>
    </ol>
  )
}

function evaluate({ objects, workspace }) {
  const target = getTransformTargetObject(objects)
  const poseIsCorrect = rotationMatches(target, ROTATE_AXIS, ROTATE_DEGREES)
  const hasStep = hasRotateStepForTeapot(workspace, ROTATE_AXIS, ROTATE_DEGREES)
  const passed = Boolean(target) && poseIsCorrect && hasStep

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
      rotate: hasStep && passed,
    },
  }
}

export default {
  id: 'rotate-object',
  kind: 'transform',
  Givens,
  Steps,
  evaluate,
  solutionXml: SOLUTION_XML,
}
