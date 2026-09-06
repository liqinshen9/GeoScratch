import {
  getTransformTargetObject,
  hasPipelineConnectedToTeapot,
  hasTargetTeapotBlock,
  hasTranslateStepForTeapot,
  translationMatches,
} from './shared/transformChecks'

const TRANSLATE_X = 3
const TRANSLATE_Y = 0
const TRANSLATE_Z = 0

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
        <p>Translate by (3, 0, 0)</p>
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
      <li className={steps.translate ? 'is-complete' : ''}>
        Add: a Translation Matrix (x=3, y=0, z=0) as a step in the pipeline.
      </li>
    </ol>
  )
}

function evaluate({ objects, workspace }) {
  const target = getTransformTargetObject(objects)
  const poseIsCorrect = translationMatches(target, TRANSLATE_X, TRANSLATE_Y, TRANSLATE_Z)
  const hasStep = hasTranslateStepForTeapot(workspace, TRANSLATE_X, TRANSLATE_Y, TRANSLATE_Z)
  const passed = Boolean(target) && poseIsCorrect && hasStep

  return {
    passed,
    // Green as soon as the object's pose is right; `passed` additionally
    // requires the pipeline step that produced it.
    correct: Boolean(target) && poseIsCorrect,
    incorrect: Boolean(target) && !poseIsCorrect,
    target,
    answer: { type: 'position' },
    steps: {
      teapot: hasTargetTeapotBlock(workspace),
      pipeline: hasPipelineConnectedToTeapot(workspace),
      translate: hasStep && passed,
    },
  }
}

export default {
  number: 4,
  kind: 'transform',
  Givens,
  Steps,
  evaluate,
}
