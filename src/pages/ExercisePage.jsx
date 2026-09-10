import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import THREE from '@/utils/three'
import BlocksCanvas from '@/components/BlocksCanvas/BlocksCanvas'
import Scene3D from '@/components/Scene3D/Scene3D'
import EditorColumnHeaders from '@/components/EditorShell/EditorColumnHeaders'
import { ArrowLeft, ArrowRight, AllApplication, CheckOne } from '@icon-park/react'
import useSceneStore from '@/store/useSceneStore'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import useSettingsStore from '@/store/useSettingsStore'
import {
  getExercise,
  orderedExercises,
  getAdjacentExercises,
  getSectionForExercise,
} from '@/data/exercises'
import { getExerciseModule } from '@/exercises'
import PerceptualQuestion from '@/exercises/shared/PerceptualQuestion'
import useExerciseTracking from '@/hooks/useExerciseTracking'
import ExerciseRewards from './ExerciseRewards'
import { getSolvedExerciseIds, isExerciseUnlocked } from '@/utils/exerciseProgress'

import '@/components/EditorShell/editor-shell.css'
import './ExercisePage.css'

/** @param {number} n */
const fixed2 = (n) => n.toFixed(2)

/**
 * The pass/fail readout under the task list. Transform exercises show the
 * object's live pose (there is no single number to check); distance exercises
 * show the computed scalar.
 */
function AnswerCard({ result, className }) {
  const { answer, target } = result

  if (answer.type === 'position') {
    return (
      <div className={className}>
        <span>Current position:</span>
        <strong>
          {target
            ? `(${fixed2(target.position.x)}, ${fixed2(target.position.y)}, ${fixed2(target.position.z)})`
            : ''}
        </strong>
      </div>
    )
  }

  if (answer.type === 'scale' || answer.type === 'scaleAndRotation') {
    const euler = target ? new THREE.Euler().setFromQuaternion(target.quaternion, 'XYZ') : null
    const deg = (radians) => THREE.MathUtils.radToDeg(radians).toFixed(1)

    return (
      <div className={className}>
        <span>Current scale:</span>
        <strong>
          {target
            ? `(${fixed2(target.scale.x)}, ${fixed2(target.scale.y)}, ${fixed2(target.scale.z)})`
            : ''}
        </strong>
        {answer.type === 'scaleAndRotation' && (
          <>
            <span>Current rotation (X, Y, Z):</span>
            <strong>{euler ? `(${deg(euler.x)}°, ${deg(euler.y)}°, ${deg(euler.z)}°)` : ''}</strong>
          </>
        )}
      </div>
    )
  }

  return (
    <div className={className}>
      <span>Your answer:</span>
      <strong>{answer.value !== null ? Number(answer.value.toFixed(3)) : ''}</strong>
    </div>
  )
}

export default function ExercisePage() {
  const { exerciseId } = useParams()
  const exercise = getExercise(exerciseId) ?? orderedExercises()[0]
  if (!isExerciseUnlocked(exercise.id)) {
    return <Navigate to={`/exercises/${getSectionForExercise(exercise.id).unit.id}`} replace />
  }
  return <ExerciseEditor key={exercise.id} />
}

function ExerciseEditor() {
  const { objects, autoRender, setPendingObjects, setObjects } = useSceneStore()
  const { workspace } = useWorkspaceStore()
  const setExerciseOverrides = useSettingsStore((s) => s.setExerciseOverrides)
  const clearExerciseOverrides = useSettingsStore((s) => s.clearExerciseOverrides)
  const navigate = useNavigate()
  const { exerciseId } = useParams()
  const [workspaceMaximized, setWorkspaceMaximized] = useState(false)
  const [perceptualPicked, setPerceptualPicked] = useState(null)
  const clearWorkspaceRef = useRef(() => {})

  // The URL is the source of truth for which exercise is open;
  // /exercise with no param (or an unknown id) defaults to the first one.
  const activeExerciseConfig = getExercise(exerciseId) ?? orderedExercises()[0]
  const activeExercise = activeExerciseConfig.id
  const exercise = getExerciseModule(activeExercise)
  const handlePerceptualPicked = useCallback(
    (value) => {
      setPerceptualPicked({ exerciseId: activeExercise, value })
    },
    [activeExercise],
  )

  const { previous: previousExercise, next: nextExercise } = getAdjacentExercises(activeExercise)
  const placement = getSectionForExercise(activeExercise)
  const unit = placement?.unit

  // Everything the page needs to know about progress comes from one call into
  // the exercise's own checker.
  const result = exercise.evaluate({ objects, workspace })
  const answerCardClass = `exercise-answer-card${result.correct ? ' is-correct' : ''}${
    result.incorrect ? ' is-incorrect' : ''
  }`

  // Perceptual exercises have no checker pass -- a correct MCQ pick is the pass.
  const isPerceptual = exercise.kind === 'perceptual'
  const passed =
    result.passed ||
    (isPerceptual &&
      perceptualPicked?.exerciseId === activeExercise &&
      perceptualPicked.value === exercise.mcq?.correctId)

  const tracking = useExerciseTracking(activeExercise, exercise.kind)
  const solved = getSolvedExerciseIds()
  if (passed) solved.add(activeExercise)
  const canGoNext = nextExercise && isExerciseUnlocked(nextExercise.id, solved)
  useEffect(() => {
    tracking.reportResult(result)
  })

  const handleSelectExercise = useCallback(
    (id) => {
      if (!isExerciseUnlocked(id)) return
      navigate(`/exercise/${id}`)
      setWorkspaceMaximized(false)
      setPendingObjects([])
      setObjects([])
    },
    [navigate, setObjects, setPendingObjects],
  )

  // Clear a stale MCQ pick when moving between exercises.
  useEffect(() => {
    setPerceptualPicked(null)
  }, [activeExercise])

  // Sets up starter blocks for exercises that have seedWorkspace
  useEffect(() => {
    if (exercise.seedWorkspace && workspace && workspace.rendered) {
      exercise.seedWorkspace(workspace)
    }
  }, [exercise, workspace])

  // An exercise can force certain settings while it is open (its
  // settingsOverrides export); reverted when the student leaves or switches.
  useEffect(() => {
    setExerciseOverrides(exercise.settingsOverrides ?? {})
    return () => clearExerciseOverrides()
  }, [exercise, setExerciseOverrides, clearExerciseOverrides])

  const handleObjectsChange = useCallback(
    (objs) => {
      const exerciseObjects = exercise.decorateObjects
        ? exercise.decorateObjects(objs, workspace)
        : objs
      setPendingObjects(exerciseObjects)
      if (autoRender) setObjects(exerciseObjects)
    },
    [exercise, autoRender, setPendingObjects, setObjects, workspace],
  )

  const { Givens, Steps } = exercise

  return (
    <div className="exercise-page exercise-page--editor">
      <main
        className={`editor-shell editor-shell--with-leading exercise-editor-shell${
          workspaceMaximized ? ' editor-shell--maximized' : ''
        }`}
      >
        <EditorColumnHeaders
          leadingHeader={
            <div className="exercise-column-heading">
              <h2>{unit?.title?.replace(/^Unit\s*\d+:\s*/i, '') ?? 'Exercise'}</h2>
              <div className="exercise-column-heading__nav" aria-label="Exercise navigation">
                <button
                  type="button"
                  className="exercise-nav-button exercise-nav-button--wide"
                  onClick={() => navigate(unit ? `/exercises/${unit.id}` : '/exercises')}
                  title="Browse all exercises"
                  aria-label="Browse all exercises"
                >
                  <AllApplication
                    theme="outline"
                    size="13"
                    fill="currentColor"
                    aria-hidden="true"
                  />
                  <span>Browse</span>
                </button>
                <button
                  type="button"
                  className="exercise-nav-button"
                  onClick={() => previousExercise && handleSelectExercise(previousExercise.id)}
                  disabled={!previousExercise}
                  title="Previous exercise"
                  aria-label="Previous exercise"
                >
                  <ArrowLeft theme="outline" size="13" fill="currentColor" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="exercise-nav-button"
                  onClick={() => nextExercise && handleSelectExercise(nextExercise.id)}
                  disabled={!canGoNext}
                  title="Next exercise"
                  aria-label="Next exercise"
                >
                  <ArrowRight theme="outline" size="13" fill="currentColor" aria-hidden="true" />
                </button>
              </div>
            </div>
          }
          workspace={workspace}
          workspaceMaximized={workspaceMaximized}
          onWorkspaceMaximizedChange={setWorkspaceMaximized}
          onClearWorkspace={() => clearWorkspaceRef.current()}
        />

        <div className="editor-body-row">
          {!workspaceMaximized && (
            <aside className={`exercise-task-panel${passed ? ' is-passed' : ''}`}>
              <div className="exercise-task-panel__top">
                <h1>
                  <strong>{activeExerciseConfig.title}</strong>
                </h1>
                {unit && (
                  <ExerciseRewards
                    key={activeExercise}
                    unit={unit}
                    activeExercise={activeExercise}
                    passed={passed}
                  />
                )}
              </div>

              <Givens />
              {isPerceptual && exercise.mcq && (
                <PerceptualQuestion
                  key={activeExercise}
                  mcq={exercise.mcq}
                  onPick={tracking.recordMcqAnswer}
                  onPickedChange={handlePerceptualPicked}
                />
              )}
              <Steps steps={result.steps} passed={passed} />
              {!isPerceptual && <AnswerCard result={result} className={answerCardClass} />}
              {passed && (
                <div className="exercise-pass-banner" role="status">
                  <CheckOne theme="filled" size="18" fill="currentColor" aria-hidden="true" />
                  <span>Passed</span>
                  <button
                    type="button"
                    className="exercise-pass-next"
                    onClick={() =>
                      nextExercise ? handleSelectExercise(nextExercise.id) : navigate('/exercises')
                    }
                    title={nextExercise ? 'Next exercise' : 'Choose another track'}
                    aria-label={nextExercise ? 'Next exercise' : 'Choose another track'}
                  >
                    <ArrowRight theme="outline" size="18" fill="currentColor" />
                  </button>
                </div>
              )}
            </aside>
          )}

          <BlocksCanvas
            key={`exercise-${activeExercise}`}
            id={`exercise-${activeExercise}`}
            workspaceMaximized={workspaceMaximized}
            reusableBlockTemplate={result.passed ? exercise.reusableBlockTemplate : null}
            onObjectsChange={handleObjectsChange}
            onRegisterClear={(fn) => {
              clearWorkspaceRef.current = fn
            }}
          />
          <Scene3D objects={objects} />
        </div>
      </main>
    </div>
  )
}
