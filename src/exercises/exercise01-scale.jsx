import {
  getTransformTargetObject,
  hasPipelineConnectedToTeapot,
  hasTargetTeapotBlock,
  hasScaleStepForTeapot,
  scaleMatches,
} from './shared/transformChecks'

const SCALE_FACTOR = 3

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
        <p>Scale factor = 3 (all axes)</p>
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
        Add: a Scale Matrix (sx=3, sy=3, sz=3) as a step in the pipeline.
      </li>
    </ol>
  )
}

function evaluate({ objects, workspace }) {
  const target = getTransformTargetObject(objects)
  const poseIsCorrect = scaleMatches(target, SCALE_FACTOR)
  const passed = Boolean(target) && poseIsCorrect && hasScaleStepForTeapot(workspace, SCALE_FACTOR)

  return {
    passed,
    // Green as soon as the object's pose is right; `passed` additionally
    // requires the pipeline step that produced it.
    correct: Boolean(target) && poseIsCorrect,
    // An object exists but has the wrong pose -- distinct from "not built yet",
    // which should not read as a wrong answer.
    incorrect: Boolean(target) && !poseIsCorrect,
    target,
    answer: { type: 'scale' },
    steps: {
      teapot: hasTargetTeapotBlock(workspace),
      pipeline: hasPipelineConnectedToTeapot(workspace),
      scale: hasScaleStepForTeapot(workspace, SCALE_FACTOR) && passed,
    },
  }
}

export default {
  number: 1,
  kind: 'transform',
  Givens,
  Steps,
  evaluate,
}
