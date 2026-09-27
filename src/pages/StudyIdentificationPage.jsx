import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Scene3D from '@/components/Scene3D/Scene3D'
import { Button } from '@/components/ui/button'
import useSettingsStore from '@/store/useSettingsStore'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import { LABEL_DETAIL_LEVELS } from '@/store/namingConfig'
import { getTechnique } from '@/study/phase1/conditions'
import { buildSceneFromXml } from '@/study/phase1/buildStimulusScene'
import { CAMERA } from '@/study/phase1/stimulusConfig'
import {
  FLOW,
  FLOW_ACTIONS,
  createFlowReducer,
  initialFlowState,
  currentTrial,
  progressCursor,
} from '@/study/phase1/phase1Flow'
import useStudySession from '@/study/session/useStudySession'
import { STEP_KINDS } from '@/study/session/sessionPlan'
import { recordIdentificationTrial } from '@/study/session/studyEvents'
import { getIdentificationScenes, findScene } from '@/study/identification/scenes'
import { resolveIdentificationSequence } from '@/study/identification/sequence'
import { identificationToXml, targetBlockId } from '@/study/identification/identificationToXml'
import {
  IDENTIFICATION_CELLS,
  FIXATION_MS,
  FEEDBACK_MS,
  WORKSPACE_WIDTH,
  IDENTIFY_VIEWPORT as VIEWPORT,
} from '@/study/identification/identificationConfig'
import ReadOnlyWorkspace from '@/study/identification/ReadOnlyWorkspace'
import '@/components/EditorShell/editor-shell.css'
import './StudyPhase1Page.css'
import './StudyIdentificationPage.css'

// The identification task (highlighting x labels) that opens the holistic
// section. See docs/architecture/study-session.md#identification-task.

const EMPTY_OBJECTS = []
const MIN_WINDOW = { width: WORKSPACE_WIDTH + VIEWPORT.width + 96, height: VIEWPORT.height + 160 }

const progressKey = (id) => `geoscratch:identify-progress:${id}`

function loadProgress(id) {
  try {
    const raw = window.localStorage.getItem(progressKey(id))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveProgress(id, cursor) {
  try {
    window.localStorage.setItem(progressKey(id), JSON.stringify(cursor))
  } catch (err) {
    console.error('[GeoScratch] Failed to save identification progress:', err)
  }
}

/** T1's complete settings, so nothing on the device leaks in, plus the cell's labels. */
function cellSettings(cell) {
  return {
    ...getTechnique('T1').settings,
    showLabels: cell.labels,
    labelDetail: LABEL_DETAIL_LEVELS.NAME_ONLY,
  }
}

function useWindowFits({ width, height }) {
  const [fits, setFits] = useState(() => window.innerWidth >= width && window.innerHeight >= height)
  useEffect(() => {
    const onResize = () => setFits(window.innerWidth >= width && window.innerHeight >= height)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [width, height])
  return fits
}

export default function StudyIdentificationPage() {
  const session = useStudySession()
  const scenes = useMemo(() => getIdentificationScenes(), [])
  const step = session.step
  const researchId = session.study?.researchId
  const sequence = useMemo(
    () =>
      researchId ? resolveIdentificationSequence(researchId, session.study.slot, scenes) : null,
    [researchId, session.study?.slot, scenes],
  )
  if (step?.kind !== STEP_KINDS.IDENTIFICATION || !sequence) {
    return <Navigate to="/study" replace />
  }
  return (
    <IdentificationSession
      key={researchId}
      researchId={researchId}
      sequence={sequence}
      scenes={scenes}
      session={session}
    />
  )
}

function IdentificationSession({ researchId, sequence, scenes, session }) {
  const navigate = useNavigate()
  const stepIndex = session.step.stepIndex
  const reducer = useMemo(() => createFlowReducer(sequence), [sequence])
  const [state, dispatch] = useReducer(reducer, null, () =>
    initialFlowState(sequence, loadProgress(researchId)),
  )
  const [trialScene, setTrialScene] = useState(null)
  const [wrongFlash, setWrongFlash] = useState(false)
  const presentedRef = useRef(null)
  const wrongRef = useRef([])
  const windowFits = useWindowFits(MIN_WINDOW)

  const block = sequence.blocks[state.blockIndex] ?? null
  const cell = block ? IDENTIFICATION_CELLS.find((c) => c.id === block.cell) : null
  const trial = currentTrial(sequence, state)

  useEffect(() => {
    if (state.status !== FLOW.INTRO) saveProgress(researchId, progressCursor(state))
  }, [researchId, state])

  useEffect(
    () => () => {
      useSettingsStore.getState().clearExerciseOverrides()
      useWorkspaceStore.getState().setSelectedBlockId(null)
    },
    [],
  )

  const { complete } = session
  useEffect(() => {
    if (state.status !== FLOW.DONE) return
    complete(stepIndex, { cell_order: sequence.cellOrder })
    navigate('/study')
  }, [state.status, complete, stepIndex, sequence.cellOrder, navigate])

  // Fixation doubles as build time, as in Phase 1: settings first (builders
  // and block colours read them), then the scene.
  useEffect(() => {
    if (state.status !== FLOW.FIXATION || !trial || !cell) return
    const startedAt = performance.now()
    presentedRef.current = null
    wrongRef.current = []
    setWrongFlash(false)
    useWorkspaceStore.getState().setSelectedBlockId(null)
    useSettingsStore.getState().setExerciseOverrides(cellSettings(cell))
    const scene = findScene(scenes, trial.sceneId)
    const xml = identificationToXml(scene)
    try {
      setTrialScene({ objects: buildSceneFromXml(xml), xml, scene, trial })
    } catch (err) {
      console.error('[GeoScratch] Failed to build identification scene:', err)
      setTrialScene({ error: true, scene, trial })
    }
    const wait = Math.max(0, FIXATION_MS - (performance.now() - startedAt))
    const timer = setTimeout(() => dispatch({ type: FLOW_ACTIONS.FIXATION_DONE }), wait)
    return () => clearTimeout(timer)
  }, [state.status, trial, cell, scenes])

  const visible = state.status === FLOW.TRIAL || state.status === FLOW.FEEDBACK
  const target = trialScene?.scene ? targetBlockId(trialScene.scene) : null

  // The highlight condition is exactly what selecting the block does in the
  // editor: the shared selection drives SelectionHighlight.
  useEffect(() => {
    useWorkspaceStore.getState().setSelectedBlockId(visible && cell?.highlight ? target : null)
  }, [visible, cell, target])

  useEffect(() => {
    if (state.status !== FLOW.FEEDBACK) return
    const timer = setTimeout(() => dispatch({ type: FLOW_ACTIONS.FEEDBACK_DONE }), FEEDBACK_MS)
    return () => clearTimeout(timer)
  }, [state.status])

  const handlePresented = useCallback((perf) => {
    presentedRef.current = { perf, iso: new Date().toISOString() }
  }, [])

  const handleObjectClick = (object) => {
    if (state.status !== FLOW.TRIAL || !presentedRef.current || !windowFits) return
    const clicked = object?.userData?.srcBlockId
    if (!clicked) return
    if (clicked !== target) {
      wrongRef.current.push(clicked)
      setWrongFlash(true)
      return
    }
    recordIdentificationTrial({
      block_index: state.blockIndex,
      cell: cell.id,
      highlight: cell.highlight,
      labels: cell.labels,
      scene_set: block.sceneSet,
      trial_index: trial.trialIndex,
      is_practice: trial.practice,
      scene_id: trialScene.scene.id,
      scene_seed: sequence.scenesSeed,
      scene_kind: trialScene.scene.kind,
      target_block_id: target,
      errors: wrongRef.current.length,
      wrong_block_ids: wrongRef.current,
      rt_ms: performance.now() - presentedRef.current.perf,
      presented_at: presentedRef.current.iso,
      viewport_w: VIEWPORT.width,
      viewport_h: VIEWPORT.height,
      device_pixel_ratio: window.devicePixelRatio,
    })
    presentedRef.current = null
    setWrongFlash(false)
    dispatch({ type: FLOW_ACTIONS.ANSWER, response: clicked })
  }

  const blockCount = sequence.blocks.length
  const trialCount = block?.trials.length ?? 0
  const objects = visible && trialScene?.objects ? trialScene.objects : EMPTY_OBJECTS

  return (
    <div className="study-identify">
      <header className="study-identify__prompt">
        <p className="text-base font-medium">
          {visible
            ? 'Click the object in the scene that the outlined block makes.'
            : 'Find the object the outlined block makes.'}
        </p>
        <p
          className={`study-phase1__feedback ${state.status === FLOW.FEEDBACK ? 'is-correct' : 'is-incorrect'}`}
          aria-live="polite"
        >
          {state.status === FLOW.FEEDBACK
            ? 'Correct'
            : wrongFlash && visible
              ? 'Not that one. Try again.'
              : ''}
        </p>
        {block && state.status !== FLOW.DONE && (
          <p className="text-sm text-muted-foreground">
            Block {state.blockIndex + 1} of {blockCount}
            {trial && state.status !== FLOW.BLOCK_INTRO && state.status !== FLOW.BLOCK_END
              ? ` · Trial ${Math.min(state.trialIndex + 1, trialCount)} of ${trialCount}${trial.practice ? ' (practice)' : ''}`
              : ''}
          </p>
        )}
      </header>

      <div className="study-identify__row">
        <div
          className="study-identify__blocks"
          style={{ width: WORKSPACE_WIDTH, height: VIEWPORT.height }}
        >
          <ReadOnlyWorkspace
            xml={trialScene?.error ? null : trialScene?.xml}
            targetId={target}
            hidden={!visible}
          />
        </div>

        <div
          className="study-phase1__stage"
          style={{ width: VIEWPORT.width, height: VIEWPORT.height }}
        >
          <Scene3D
            objects={objects}
            interactive={false}
            cameraPosition={CAMERA.position}
            onPresented={handlePresented}
            onObjectClick={handleObjectClick}
            showOrientationGizmo
          />

          {state.status === FLOW.FIXATION && (
            <div className="study-phase1__fixation" aria-hidden="true">
              +
            </div>
          )}

          {state.status === FLOW.INTRO && (
            <Overlay>
              <h1 className="text-2xl font-semibold tracking-tight">Which object is it?</h1>
              <p>
                On the left are the blocks that make the objects in the scene. One block is
                outlined. Click the object in the scene that this block makes, as quickly and as
                accurately as you can. If you pick the wrong one, keep going until you find it.
              </p>
              <p>
                There are {blockCount} short blocks. In some of them the scene helps you, with
                labels or by highlighting the object. The first trials of each block are practice.
              </p>
              <Button
                className="h-11 text-base"
                disabled={!windowFits}
                onClick={() => dispatch({ type: FLOW_ACTIONS.START })}
              >
                Start
              </Button>
            </Overlay>
          )}

          {state.status === FLOW.BLOCK_INTRO && (
            <Overlay>
              <h2 className="text-xl font-semibold">
                Block {state.blockIndex + 1} of {blockCount}
              </h2>
              <Button
                className="h-11 text-base"
                disabled={!windowFits}
                onClick={() => dispatch({ type: FLOW_ACTIONS.BEGIN_BLOCK })}
              >
                {state.trialIndex > 0 ? 'Continue block' : 'Begin block'}
              </Button>
            </Overlay>
          )}

          {state.status === FLOW.BLOCK_END && (
            <Overlay>
              <h2 className="text-xl font-semibold">
                Block {state.blockIndex + 1} of {blockCount} complete
              </h2>
              <Button
                className="h-11 text-base"
                onClick={() => dispatch({ type: FLOW_ACTIONS.CONTINUE })}
              >
                Continue
              </Button>
            </Overlay>
          )}

          {trialScene?.error && visible && (
            <Overlay>
              <p>Something went wrong drawing this scene. Please tell the researcher.</p>
            </Overlay>
          )}

          {!windowFits && (
            <Overlay>
              <p>
                Please make your browser window larger (at least {MIN_WINDOW.width} x{' '}
                {MIN_WINDOW.height} pixels) to continue.
              </p>
            </Overlay>
          )}
        </div>
      </div>

      {/* Dev only: never built into what a participant runs. */}
      {import.meta.env.DEV && (
        <div className="study-phase1__dev study-identify__dev">
          <div className="study-phase1__dev-row">
            <span className="study-phase1__dev-label">dev</span>
            <span className="study-phase1__dev-technique">
              {cell ? `cell: ${cell.id} · set ${block.sceneSet + 1}` : 'no block'}
            </span>
          </div>
          <button type="button" onClick={() => dispatch({ type: FLOW_ACTIONS.SKIP_BLOCK })}>
            Skip to next block
          </button>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: FLOW_ACTIONS.SKIP_TO_LAST_BLOCK })
              dispatch({ type: FLOW_ACTIONS.SKIP_BLOCK })
            }}
          >
            Skip the task
          </button>
        </div>
      )}
    </div>
  )
}

function Overlay({ children }) {
  return (
    <div className="study-phase1__overlay">
      <div className="flex max-w-lg flex-col items-start gap-4 text-base leading-relaxed">
        {children}
      </div>
    </div>
  )
}
