import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import Scene3D from '@/components/Scene3D/Scene3D'
import { Button } from '@/components/ui/button'
import useAuthStore from '@/store/useAuthStore'
import useSettingsStore from '@/store/useSettingsStore'
import usePhase1TrackingStore from '@/store/usePhase1TrackingStore'
import { getTechnique } from '@/study/phase1/conditions'
import { getStudyStimulusSet, findStimulus } from '@/study/phase1/stimuli'
import { resolveSequence } from '@/study/phase1/sequence'
import { buildStimulusScene } from '@/study/phase1/buildStimulusScene'
import { targetLabelKeys, toggleLabelKeys } from '@/study/phase1/labelToggle'
import {
  FLOW,
  FLOW_ACTIONS,
  createFlowReducer,
  initialFlowState,
  currentTrial,
  progressCursor,
} from '@/study/phase1/phase1Flow'
import { VIEWPORT, FIXATION_MS, FEEDBACK_MS } from '@/study/phase1/stimulusConfig'
import '@/components/EditorShell/editor-shell.css'
import './StudyPhase1Page.css'

// The Phase 1 perceptual trial runner. See docs/architecture/study-phase1.md.

const EMPTY_OBJECTS = []
const PANEL_WIDTH = 300
const MIN_WINDOW = { width: VIEWPORT.width + PANEL_WIDTH + 96, height: VIEWPORT.height + 48 }

const progressKey = (code) => `geoscratch:phase1-progress:${code}`

function loadProgress(code) {
  try {
    const raw = window.localStorage.getItem(progressKey(code))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveProgress(code, cursor) {
  try {
    window.localStorage.setItem(progressKey(code), JSON.stringify(cursor))
  } catch (err) {
    console.error('[GeoScratch] Failed to save Phase 1 progress:', err)
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

export default function StudyPhase1Page() {
  const participantCode = useAuthStore(
    (s) => s.profile?.participant_code || s.participantCode || '',
  )
  const stimulusSet = useMemo(() => getStudyStimulusSet(), [])
  const sequence = useMemo(
    () => resolveSequence(participantCode, stimulusSet),
    [participantCode, stimulusSet],
  )
  return (
    <Phase1Session
      key={participantCode}
      participantCode={participantCode}
      sequence={sequence}
      stimulusSet={stimulusSet}
    />
  )
}

function Phase1Session({ participantCode, sequence, stimulusSet }) {
  const authStatus = useAuthStore((s) => s.status)
  const recordTrial = usePhase1TrackingStore((s) => s.recordTrial)
  const recordSequence = usePhase1TrackingStore((s) => s.recordSequence)
  const reducer = useMemo(() => createFlowReducer(sequence), [sequence])
  const [state, dispatch] = useReducer(reducer, null, () =>
    initialFlowState(sequence, loadProgress(participantCode)),
  )
  const [trialScene, setTrialScene] = useState(null)
  const [labelsOff, setLabelsOff] = useState(() => new Set())
  const labelTogglesRef = useRef(0)
  const presentedRef = useRef(null)
  const windowFits = useWindowFits(MIN_WINDOW)

  const block = sequence.blocks[state.blockIndex] ?? null
  const technique = block ? getTechnique(block.technique) : null
  const trial = currentTrial(sequence, state)

  useEffect(() => {
    if (authStatus === 'ready') recordSequence(sequence)
  }, [authStatus, sequence, recordSequence])

  useEffect(() => {
    if (technique) useSettingsStore.getState().setExerciseOverrides(technique.settings)
  }, [technique])

  useEffect(() => () => useSettingsStore.getState().clearExerciseOverrides(), [])

  useEffect(() => {
    if (state.status !== FLOW.INTRO) saveProgress(participantCode, progressCursor(state))
  }, [participantCode, state])

  // Fixation doubles as build time: the scene is built while the cross shows,
  // so construction cost never lands inside a measured reaction time.
  useEffect(() => {
    if (state.status !== FLOW.FIXATION || !trial || !technique) return
    const startedAt = performance.now()
    presentedRef.current = null
    // Label keys come from block ids, and a stimulus returns under every
    // technique, so a label hidden now must not stay hidden later.
    labelTogglesRef.current = 0
    setLabelsOff(new Set())
    useSettingsStore.getState().setExerciseOverrides(technique.settings)
    const stimulus = findStimulus(stimulusSet, trial.stimulusId)
    try {
      setTrialScene({ ...buildStimulusScene(stimulus), stimulus, trial })
    } catch (err) {
      console.error('[GeoScratch] Failed to build Phase 1 stimulus:', err)
      setTrialScene({ error: true, stimulus, trial })
    }
    const wait = Math.max(0, FIXATION_MS - (performance.now() - startedAt))
    const timer = setTimeout(() => dispatch({ type: FLOW_ACTIONS.FIXATION_DONE }), wait)
    return () => clearTimeout(timer)
  }, [state.status, trial, technique, stimulusSet])

  useEffect(() => {
    if (state.status !== FLOW.FEEDBACK) return
    const timer = setTimeout(() => dispatch({ type: FLOW_ACTIONS.FEEDBACK_DONE }), FEEDBACK_MS)
    return () => clearTimeout(timer)
  }, [state.status])

  const handlePresented = useCallback((perf) => {
    presentedRef.current = { perf, iso: new Date().toISOString() }
  }, [])

  const stimulusVisible = state.status === FLOW.TRIAL || state.status === FLOW.FEEDBACK
  const objects = stimulusVisible && trialScene?.objects ? trialScene.objects : EMPTY_OBJECTS
  const canAnswer =
    state.status === FLOW.TRIAL && windowFits && Boolean(trialScene?.objects) && !trialScene.error

  // Clicking A or B hides or shows its label, so an unsure participant can check
  // which label is which. Only clicks before the answer are counted.
  const handleObjectClick = useCallback(
    (object) => {
      if (!stimulusVisible) return
      const keys = targetLabelKeys(trialScene?.stimulus, object)
      if (!keys.length) return
      if (state.status === FLOW.TRIAL) labelTogglesRef.current += 1
      setLabelsOff((current) => toggleLabelKeys(current, keys))
    },
    [stimulusVisible, trialScene, state.status],
  )

  const hiddenLabelKeys = useMemo(
    () => new Set([...(trialScene?.hiddenLabelKeys ?? []), ...labelsOff]),
    [trialScene, labelsOff],
  )

  const answer = (response) => {
    if (!canAnswer || !presentedRef.current) return
    const answeredPerf = performance.now()
    recordTrial({
      blockIndex: state.blockIndex,
      technique: block.technique,
      trial: trialScene.trial,
      stimulus: trialScene.stimulus,
      response,
      presentedPerf: presentedRef.current.perf,
      answeredPerf,
      presentedAtIso: presentedRef.current.iso,
      settingsSnapshot: useSettingsStore.getState().settings,
      viewport: VIEWPORT,
      devicePixelRatio: window.devicePixelRatio,
      labelToggles: labelTogglesRef.current,
    })
    presentedRef.current = null
    dispatch({ type: FLOW_ACTIONS.ANSWER, response })
  }

  const blockCount = sequence.blocks.length
  const trialCount = block?.trials.length ?? 0
  const feedbackCorrect =
    state.status === FLOW.FEEDBACK && state.lastResponse === trialScene?.stimulus?.nearer

  return (
    <div className="study-phase1">
      <div
        className="study-phase1__stage"
        style={{ width: VIEWPORT.width, height: VIEWPORT.height }}
      >
        <Scene3D
          objects={objects}
          interactive={false}
          onPresented={handlePresented}
          hiddenLabelKeys={hiddenLabelKeys}
          onObjectClick={handleObjectClick}
        />

        {state.status === FLOW.FIXATION && (
          <div className="study-phase1__fixation" aria-hidden="true">
            +
          </div>
        )}

        {state.status === FLOW.INTRO && (
          <Overlay>
            <h1 className="text-2xl font-semibold tracking-tight">Which one is in front?</h1>
            <p>
              Each scene shows several objects. Two of them are labelled <strong>A</strong> and{' '}
              <strong>B</strong>, and they cross each other on the screen: either two lines cross,
              or a point sits over a line. They never touch. Where they cross, one passes in front
              of the other. Decide which one is in front, then click its button on the right. Answer
              as quickly and as accurately as you can.
            </p>
            <p>
              Not sure which label is which? Click a labelled line or point to hide or show its
              label.
            </p>
            <p>
              There are {blockCount} blocks. The way the scene is drawn changes between blocks. The
              first few trials of each block are practice and tell you whether you were right.
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
            <p>
              {state.trialIndex > 0
                ? 'Pick up where you left off.'
                : 'The first trials are practice, with feedback.'}
            </p>
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
            <p>Please answer the short questionnaire for this block, then continue.</p>
            <Button
              className="h-11 text-base"
              onClick={() => dispatch({ type: FLOW_ACTIONS.CONTINUE })}
            >
              Continue
            </Button>
          </Overlay>
        )}

        {state.status === FLOW.DONE && (
          <Overlay>
            <h2 className="text-xl font-semibold">This part is complete</h2>
            <p>Thank you. Let the researcher know you have finished.</p>
          </Overlay>
        )}

        {trialScene?.error && stimulusVisible && (
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

      <aside className="study-phase1__panel" style={{ width: PANEL_WIDTH }}>
        <p className="text-base font-medium">Where A and B cross, which one is in front?</p>
        <div className="flex flex-col gap-3">
          {['A', 'B'].map((choice) => (
            <Button
              key={choice}
              variant="outline"
              className="h-12 text-base"
              disabled={!canAnswer}
              onClick={() => answer(choice)}
            >
              {choice} is in front
            </Button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Unsure which label is which? Click a labelled line or point to hide or show its label.
        </p>
        <p
          className={`study-phase1__feedback ${feedbackCorrect ? 'is-correct' : 'is-incorrect'}`}
          aria-live="polite"
        >
          {state.status === FLOW.FEEDBACK ? (feedbackCorrect ? 'Correct' : 'Incorrect') : ''}
        </p>
        {block && state.status !== FLOW.DONE && (
          <p className="text-sm text-muted-foreground">
            Block {state.blockIndex + 1} of {blockCount}
            {trial && state.status !== FLOW.BLOCK_INTRO
              ? ` · Trial ${Math.min(state.trialIndex + 1, trialCount)} of ${trialCount}${trial.practice ? ' (practice)' : ''}`
              : ''}
          </p>
        )}
      </aside>
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
