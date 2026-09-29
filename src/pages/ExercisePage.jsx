import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Blockly from 'blockly/core'
import { useNavigate, useParams } from 'react-router-dom'
import THREE from '@/utils/three'
import BlocksCanvas from '@/components/BlocksCanvas/BlocksCanvas'
import Scene3D from '@/components/Scene3D/Scene3D'
import { positionFromOrbit, DEFAULT_CAMERA_VIEW } from '@/components/Scene3D/sceneConstants'
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
import { fillSolution } from '@/exercises/shared/fillSolution'
import { applyGivenNames } from '@/exercises/shared/givenNames'
import useExerciseTracking from '@/hooks/useExerciseTracking'
import { markExerciseSolved, unmarkExerciseSolved } from '@/utils/exerciseProgress'
import { useCurrentStudyTask } from '@/study/session/useStudySession'
import { configurationSettings, RENDER_MODES } from '@/study/session/holistic'
import StudyTaskBar from '@/components/StudyTaskBar/StudyTaskBar'

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

export default function ExercisePage({
  exerciseId: fixedExerciseId,
  standalone = false,
  workspaceId,
  settingsOverrides,
  showAnswerHighlight = true,
  hideAnimationTransport = false,
  transformObjects,
  toggleLabelsOnLeftClick = false,
}) {
  const { objects, autoRender, setPendingObjects, setObjects } = useSceneStore()
  const { workspace } = useWorkspaceStore()
  const setExerciseOverrides = useSettingsStore((s) => s.setExerciseOverrides)
  const clearExerciseOverrides = useSettingsStore((s) => s.clearExerciseOverrides)
  const navigate = useNavigate()
  const { exerciseId: routeExerciseId } = useParams()
  const [workspaceMaximized, setWorkspaceMaximized] = useState(false)
  const [perceptualPicked, setPerceptualPicked] = useState(null)
  const [stepFeedbackRevision, setStepFeedbackRevision] = useState(0)
  const clearWorkspaceRef = useRef(() => {})
  const editorShellRef = useRef(null)

  // The URL is the source of truth for which exercise is open;
  // /exercise with no param (or an unknown id) defaults to the first one.
  const activeExerciseConfig = getExercise(fixedExerciseId ?? routeExerciseId) ?? orderedExercises()[0]
  const activeExercise = activeExerciseConfig.id
  const exercise = getExerciseModule(activeExercise)
  const cameraPosition = useMemo(
    () => positionFromOrbit({ ...DEFAULT_CAMERA_VIEW, ...exercise.cameraView }),
    [exercise],
  )

  useEffect(() => {
    setStepFeedbackRevision((revision) => revision + 1)
    if (!workspace) return undefined

    const editableEvents = new Set([
      Blockly.Events.BLOCK_CHANGE,
      Blockly.Events.BLOCK_CREATE,
      Blockly.Events.BLOCK_DELETE,
      Blockly.Events.BLOCK_MOVE,
    ])
    const clearSubmittedFeedback = (event) => {
      if (editableEvents.has(event?.type)) {
        setStepFeedbackRevision((revision) => revision + 1)
      }
    }
    workspace.addChangeListener(clearSubmittedFeedback)
    return () => workspace.removeChangeListener(clearSubmittedFeedback)
  }, [activeExercise, workspace])

  useEffect(() => {
    if (!workspace || !exercise.givenNames) return undefined
    const apply = (event) => {
      if (event?.isUiEvent) return
      applyGivenNames(workspace, exercise.givenNames)
    }
    apply()
    workspace.addChangeListener(apply)
    return () => workspace.removeChangeListener(apply)
  }, [exercise, workspace])

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
  const passed = result.passed || (isPerceptual && perceptualPicked === exercise.mcq?.correctId)

  // Study mode: this exercise is the session's current holistic task. The
  // condition's settings win over the exercise's own, navigation is hidden,
  // and a static condition hides every animation control.
  // See docs/architecture/study-session.md#holistic-tasks.
  const currentTask = useCurrentStudyTask()
  const studyTask =
    !standalone && currentTask?.exerciseId === activeExercise ? currentTask : null
  const hideAnimation = Boolean(studyTask) && studyTask.mode !== RENDER_MODES.ANIMATED

  const tracking = useExerciseTracking(activeExercise, exercise.kind)
  useEffect(() => {
    tracking.reportResult(result)
  })

  // Mirror the solve state into localStorage so the exercise browser shows
  // progress. A pass records it. It comes back off once we've seen this
  // exercise pass on this visit and it then stops passing -- so editing a
  // solved workspace so it no longer works un-ticks it, while merely opening it
  // (empty/still-restoring, never passed yet this visit) leaves the tick alone.
  const sawPassThisVisit = useRef(false)
  useEffect(() => {
    sawPassThisVisit.current = false
  }, [activeExercise])
  useEffect(() => {
    if (passed) {
      sawPassThisVisit.current = true
      markExerciseSolved(activeExercise)
    } else if (sawPassThisVisit.current || (isPerceptual && perceptualPicked != null)) {
      unmarkExerciseSolved(activeExercise)
    }
  }, [passed, activeExercise, isPerceptual, perceptualPicked])

  const handleSelectExercise = useCallback(
    (id) => {
      navigate(`/exercise/${id}`)
      setWorkspaceMaximized(false)
      setPendingObjects([])
      setObjects([])
    },
    [navigate, setObjects, setPendingObjects],
  )

  const handleWorkspaceMaximizedChange = useCallback((maximized) => {
    const shell = editorShellRef.current
    if (maximized && shell) {
      const headerHeight = shell.querySelector('.editor-header-row')?.getBoundingClientRect().height
      if (headerHeight) shell.style.setProperty('--exercise-header-height', `${headerHeight}px`)
    }
    setWorkspaceMaximized(maximized)
  }, [])

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
  const studyConfiguration = studyTask?.configuration
  const studySettings = useMemo(
    () => (studyConfiguration ? configurationSettings(studyConfiguration) : null),
    [studyConfiguration],
  )
  useEffect(() => {
    setExerciseOverrides({ ...exercise.settingsOverrides, ...settingsOverrides, ...studySettings })
    return () => clearExerciseOverrides()
  }, [exercise, settingsOverrides, studySettings, setExerciseOverrides, clearExerciseOverrides])

  const handleObjectsChange = useCallback(
    (objs) => {
      const exerciseObjects = exercise.decorateObjects
        ? exercise.decorateObjects(objs, workspace)
        : objs
      const finalObjects = transformObjects?.(exerciseObjects) ?? exerciseObjects
      setPendingObjects(finalObjects)
      if (autoRender) setObjects(finalObjects)
    },
    [exercise, autoRender, setPendingObjects, setObjects, transformObjects, workspace],
  )

  // The exercise names the object holding its answer; the scene glows it green
  // or red. `correct` is the value being right, which is deliberately not the
  // same as `passed` -- that additionally requires the working to be built.
  const answerHighlight = useMemo(
    () => ({
      target: result.target,
      state: result.correct ? 'correct' : result.incorrect ? 'incorrect' : null,
    }),
    [result.target, result.correct, result.incorrect],
  )

  const { Givens, Steps } = exercise

  return (
    <div className="exercise-page exercise-page--editor" data-exercise-id={activeExercise}>
      <main
        ref={editorShellRef}
        className={`editor-shell editor-shell--with-leading exercise-editor-shell${
          workspaceMaximized ? ' editor-shell--maximized' : ''
        }`}
      >
        <EditorColumnHeaders
          leadingHeader={
            <div className="exercise-column-heading">
              <h2>Exercise</h2>
              {!studyTask && !standalone && (
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
                    disabled={!nextExercise}
                    title="Next exercise"
                    aria-label="Next exercise"
                  >
                    <ArrowRight theme="outline" size="13" fill="currentColor" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          }
          workspace={workspace}
          workspaceMaximized={workspaceMaximized}
          preserveColumns
          hideAnimationTransport={hideAnimationTransport || hideAnimation}
          onWorkspaceMaximizedChange={handleWorkspaceMaximizedChange}
          onClearWorkspace={() => clearWorkspaceRef.current()}
        />

        <div className="editor-body-row">
          <aside
            className={`exercise-task-panel${passed ? ' is-passed' : ''}`}
            aria-hidden={workspaceMaximized}
          >
            <div className="exercise-task-panel__top">
              {placement && !studyTask && !standalone && (
                <p className="exercise-task-panel__crumb">
                  {placement.unit.title} · {placement.section.title}
                </p>
              )}
              <h1>
                <strong>{activeExerciseConfig.title}</strong>
              </h1>
            </div>

            <Givens />
            {isPerceptual && exercise.mcq && (
              <PerceptualQuestion
                mcq={exercise.mcq}
                onPick={tracking.recordMcqAnswer}
                onPickedChange={setPerceptualPicked}
              />
            )}
            <Steps
              steps={result.steps}
              partialSteps={result.partialSteps}
              partialMessages={result.partialMessages}
              feedbackRevision={stepFeedbackRevision}
              passed={passed}
            />
            {!isPerceptual && !exercise.hideAnswerCard && (
              <AnswerCard result={result} className={answerCardClass} />
            )}
            {exercise.AnimationButton && !hideAnimation ? (
              <div className={`exercise-completion-row${passed ? ' is-passed' : ''}`}>
                {passed && (
                  <div className="exercise-pass-banner" role="status">
                    <CheckOne theme="filled" size="18" fill="currentColor" aria-hidden="true" />
                    <span>Passed</span>
                  </div>
                )}
                <exercise.AnimationButton objects={objects} workspace={workspace} />
              </div>
            ) : (
              passed && (
                <div className="exercise-pass-banner" role="status">
                  <CheckOne theme="filled" size="18" fill="currentColor" aria-hidden="true" />
                  <span>Passed</span>
                </div>
              )
            )}
            {/* Dev only: import.meta.env.DEV is false in the study build, so
                  the control is compiled out rather than merely hidden. */}
            {import.meta.env?.DEV && exercise.solutionXml && (
              <button
                type="button"
                className="exercise-debug-fill"
                onClick={() =>
                  fillSolution(workspace, exercise.solutionXml, exercise.seedWorkspace)
                }
              >
                Fill solution (dev)
              </button>
            )}
            {studyTask && <StudyTaskBar task={studyTask} passed={passed} />}
          </aside>

          <BlocksCanvas
            key={workspaceId ?? `exercise-${activeExercise}`}
            id={workspaceId ?? `exercise-${activeExercise}`}
            workspaceMaximized={workspaceMaximized}
            preserveColumns
            reusableBlockTemplate={
              exercise.getReusableBlockTemplate?.({ workspace, result }) ??
              (result.passed ? exercise.reusableBlockTemplate : null)
            }
            onObjectsChange={handleObjectsChange}
            onRegisterClear={(fn) => {
              clearWorkspaceRef.current = fn
            }}
          />
          <Scene3D
            objects={objects}
            answer={showAnswerHighlight ? answerHighlight : undefined}
            toggleLabelsOnLeftClick={toggleLabelsOnLeftClick}
          />
        </div>
      </main>
    </div>
  )
}
