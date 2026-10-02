import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Scene3D from '@/components/Scene3D/Scene3D'
import { Button } from '@/components/ui/button'
import useAuthStore from '@/store/useAuthStore'
import useSettingsStore from '@/store/useSettingsStore'
import usePhase1TrackingStore from '@/store/usePhase1TrackingStore'
import { getTechnique } from '@/study/phase1/conditions'
import { getStudyStimulusSet, findStimulus } from '@/study/phase1/stimuli'
import { resolveSequence } from '@/study/phase1/sequence'
import useStudySession from '@/study/session/useStudySession'
import { STEP_KINDS } from '@/study/session/sessionPlan'
import { useStudyDevTools } from '@/study/session/devTools'
import { buildStimulusScene } from '@/study/phase1/buildStimulusScene'
import { targetLabelKeys, toggleLabelKeys } from '@/study/phase1/labelToggle'
import { questionPrompt, choiceLabel, probeBandStyle } from '@/study/phase1/questionCopy'
import { targetShadowVisibility } from '@/study/phase1/shadowVisibility'
import {
  FLOW,
  FLOW_ACTIONS,
  createFlowReducer,
  initialFlowState,
  currentTrial,
  progressCursor,
} from '@/study/phase1/phase1Flow'
import { VIEWPORT, CAMERA, FIXATION_MS, FEEDBACK_MS } from '@/study/phase1/stimulusConfig'
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

function clearProgress(code) {
  try {
    window.localStorage.removeItem(progressKey(code))
  } catch {
    // Nothing to clear if storage is unavailable.
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
  const session = useStudySession()
  const slot = session.study?.slot ?? null
  const stimulusSet = useMemo(() => getStudyStimulusSet(), [])
  const sequence = useMemo(
    () => resolveSequence(participantCode, stimulusSet, slot),
    [participantCode, stimulusSet, slot],
  )
  return (
    <Phase1Session
      key={participantCode}
      participantCode={participantCode}
      sequence={sequence}
      stimulusSet={stimulusSet}
      session={session.plan ? session : null}
    />
  )
}

/**
 * In a study session the session cursor, not this page's own, says which block
 * to run: a saved cursor still on the block before (the page unmounted on its
 * way to the block's questionnaire) moves on to the session's block.
 */
function resumeCursor(participantCode, sessionBlockIndex) {
  const saved = loadProgress(participantCode)
  if (sessionBlockIndex > (saved?.blockIndex ?? 0)) {
    return { blockIndex: sessionBlockIndex, trialIndex: 0 }
  }
  return saved
}

function Phase1Session({ participantCode, sequence, stimulusSet, session }) {
  const navigate = useNavigate()
  const sessionStep = session?.step
  const sessionBlockIndex =
    sessionStep?.kind === STEP_KINDS.PHASE1_BLOCK ? sessionStep.blockIndex : null
  const authStatus = useAuthStore((s) => s.status)
  const recordTrial = usePhase1TrackingStore((s) => s.recordTrial)
  const recordSequence = usePhase1TrackingStore((s) => s.recordSequence)
  const devTools = useStudyDevTools()
  const reducer = useMemo(
    () => createFlowReducer(sequence, { feedbackAlways: devTools }),
    [sequence, devTools],
  )
  const [state, dispatch] = useReducer(reducer, null, () =>
    initialFlowState(sequence, resumeCursor(participantCode, sessionBlockIndex ?? 0)),
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

  // Hand the finished block to its questionnaire. Progress is saved here, not
  // left to the effect above, because navigating away unmounts this page first.
  const finishBlockForSession = () => {
    const nextBlock = { blockIndex: state.blockIndex + 1, trialIndex: 0 }
    saveProgress(participantCode, nextBlock)
    session.complete(sessionStep.stepIndex, { technique: block.technique })
    navigate('/study')
  }

  // Dev only: past this block's questionnaire straight to the next block. In a
  // session the cursor jumps over the survey step; after the last block that
  // lands on the first holistic task, which /study routes to.
  const skipQuestionnaire = () => {
    if (!session) {
      dispatch({ type: FLOW_ACTIONS.CONTINUE })
      return
    }
    const next = session.plan.steps[sessionStep.stepIndex + 2]
    saveProgress(participantCode, { blockIndex: state.blockIndex + 1, trialIndex: 0 })
    session.jumpTo(next.stepIndex)
    if (next.kind === STEP_KINDS.PHASE1_BLOCK) dispatch({ type: FLOW_ACTIONS.CONTINUE })
    else navigate('/study')
  }

  // Dev only. In a session the session moves too, skipping the blocks and
  // questionnaires in between; resumeCursor would pull the page back otherwise.
  const skipToLastBlock = () => {
    const lastBlock = sequence.blocks.length - 1
    if (session) {
      const lastStep = session.plan.steps.find(
        (s) => s.kind === STEP_KINDS.PHASE1_BLOCK && s.blockIndex === lastBlock,
      )
      session.jumpTo(lastStep.stepIndex)
    }
    saveProgress(participantCode, { blockIndex: lastBlock, trialIndex: 0 })
    dispatch({ type: FLOW_ACTIONS.SKIP_TO_LAST_BLOCK })
  }

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
      shadowVisibility: targetShadowVisibility(trialScene.stimulus),
    })
    presentedRef.current = null
    dispatch({ type: FLOW_ACTIONS.ANSWER, response })
  }

  // The question is known as soon as the scene is built, which is during the
  // fixation cross: a participant reads what is being asked before the scene
  // appears, so the reaction time measures the judgement, not the reading. It
  // is blank between trials rather than left showing the last one.
  const questionShowing =
    state.status === FLOW.FIXATION || state.status === FLOW.TRIAL || state.status === FLOW.FEEDBACK
  const question = questionShowing ? (trialScene?.stimulus?.question ?? null) : null
  const bandStyle = stimulusVisible ? probeBandStyle(trialScene?.stimulus) : null

  const blockCount = sequence.blocks.length
  const trialCount = block?.trials.length ?? 0
  const feedbackCorrect =
    state.status === FLOW.FEEDBACK && state.lastResponse === trialScene?.stimulus?.nearer

  if (session && sessionBlockIndex == null) return <Navigate to="/study" replace />

  return (
    <div className="study-phase1">
      <div
        className="study-phase1__stage"
        style={{ width: VIEWPORT.width, height: VIEWPORT.height }}
      >
        <Scene3D
          objects={objects}
          interactive={false}
          cameraPosition={CAMERA.position}
          onPresented={handlePresented}
          hiddenLabelKeys={hiddenLabelKeys}
          showOrientationGizmo
          onObjectClick={handleObjectClick}
        />

        {stimulusVisible && bandStyle && (
          <div className="study-phase1__band" style={bandStyle} aria-hidden="true" />
        )}

        {state.status === FLOW.FIXATION && (
          <div className="study-phase1__fixation" aria-hidden="true">
            +
          </div>
        )}

        {state.status === FLOW.INTRO && (
          <Intro
            blockCount={blockCount}
            canStart={windowFits}
            onStart={() => dispatch({ type: FLOW_ACTIONS.START })}
          />
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
              onClick={() => {
                if (session) session.start(sessionStep.stepIndex)
                dispatch({ type: FLOW_ACTIONS.BEGIN_BLOCK })
              }}
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
              onClick={() =>
                session ? finishBlockForSession() : dispatch({ type: FLOW_ACTIONS.CONTINUE })
              }
            >
              Continue
            </Button>
            {devTools && (
              <Button variant="outline" className="h-11 text-base" onClick={skipQuestionnaire}>
                Skip questionnaire (dev)
              </Button>
            )}
          </Overlay>
        )}

        {state.status === FLOW.DONE && (
          <Overlay>
            <h2 className="text-xl font-semibold">This part is complete</h2>
            <p>Thank you. Feel free to close this tab.</p>
          </Overlay>
        )}

        {trialScene?.error && stimulusVisible && (
          <Overlay>
            <p>Something went wrong drawing this scene. Please contact the researcher.</p>
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
        {/* Six lines reserved, the longest prompt's height at 16px (a
            sphere-sphere distance question), so the buttons below never move
            when the question changes length. */}
        <p className="min-h-[9em] text-base leading-normal font-medium whitespace-pre-line">
          {question ? questionPrompt(trialScene.stimulus) : 'The question appears here each trial.'}
        </p>
        <div className="flex flex-col gap-3">
          {['A', 'B'].map((choice) => (
            <Button
              key={choice}
              variant="outline"
              className="h-auto min-h-[4.25em] py-2 text-base leading-normal whitespace-normal hover:bg-primary/10 hover:text-foreground"
              disabled={!canAnswer}
              onClick={() => answer(choice)}
            >
              {question ? choiceLabel(trialScene.stimulus, choice) : choice}
            </Button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Unsure which label is which? Click a labelled object to hide or show its label.
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

        {/* Dev build or test cohort only. Skipping logs nothing -- a row is
            only written when a trial is answered. */}
        {devTools && (
          <div className="study-phase1__dev">
            <div className="study-phase1__dev-row">
              <span className="study-phase1__dev-label">dev</span>
              <span className="study-phase1__dev-technique">
                {technique ? `${technique.id} · ${technique.label}` : 'no block'}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                session ? finishBlockForSession() : dispatch({ type: FLOW_ACTIONS.SKIP_BLOCK })
              }
            >
              Skip to next block
            </button>
            <button type="button" onClick={skipToLastBlock}>
              Skip to final block
            </button>
            <button
              type="button"
              disabled={state.trialIndex < 1}
              onClick={() => dispatch({ type: FLOW_ACTIONS.PREVIOUS_TRIAL })}
            >
              Previous trial
            </button>
            <button
              type="button"
              disabled={![FLOW.FIXATION, FLOW.TRIAL, FLOW.FEEDBACK].includes(state.status)}
              onClick={() => dispatch({ type: FLOW_ACTIONS.NEXT_TRIAL })}
            >
              Next trial
            </button>
            <button
              type="button"
              onClick={() => {
                clearProgress(participantCode)
                dispatch({ type: FLOW_ACTIONS.RESTART })
              }}
            >
              Back to the start
            </button>
          </div>
        )}
      </aside>
    </div>
  )
}

function Overlay({ children, width = 'max-w-lg' }) {
  return (
    <div className="study-phase1__overlay">
      <div className={`flex w-full ${width} flex-col items-start gap-4 text-base leading-relaxed`}>
        {children}
      </div>
    </div>
  )
}

// The cue pictures come from /study/showcase?cue=... (scripts/surveyScreenshots.mjs).
const CUE_FIGURES = [
  {
    src: '/study/cue-halo.png',
    alt: 'Line B has a small gap on either side of line A where A passes in front of it.',
    title: 'Halo',
    text: 'Where one line passes in front of another, the line behind is cut away on either side of it. Here B is broken where A crosses it, so A is in front.',
  },
  {
    src: '/study/cue-accent.png',
    alt: 'Line A is drawn dashed where it runs through a cube.',
    title: 'Collision accent',
    text: 'Where a line passes through a solid object, the part inside the object is drawn dashed. Here line A runs through the cube.',
  },
  {
    src: '/study/cue-rings.png',
    alt: 'Line A drawn with alternating dark and grey rings.',
    title: 'Ringed tubes',
    text: 'Some blocks draw lines as ringed tubes. One dark ring and one grey ring together are one unit long, so you can count them to measure along a line, and they look shorter the farther away that part of the line is. Vectors are ringed the same way, in their own colour, starting from the tail.',
  },
]

function Intro({ blockCount, canStart, onStart }) {
  const [page, setPage] = useState(0)
  const back = (
    <Button variant="outline" className="h-11 text-base" onClick={() => setPage(page - 1)}>
      Back
    </Button>
  )
  const next = (
    <Button className="h-11 text-base" onClick={() => setPage(page + 1)}>
      Next
    </Button>
  )

  if (page === 0) {
    return (
      <Overlay>
        <h1 className="text-2xl font-semibold tracking-tight">Which one is closer to you?</h1>
        <p>
          Each scene shows several objects. Two of them are labelled <strong>A</strong> and{' '}
          <strong>B</strong>, and the question names them by kind, such as &ldquo;Line A&rdquo; or
          &ldquo;Sphere B&rdquo;. <strong>A</strong> and <strong>B</strong> never touch each other,
          though either of them may pass through the other objects around them.
        </p>
        <p>
          When <strong>A</strong> and <strong>B</strong> overlap on the screen, you are asked which
          one is <strong>in front</strong> where they overlap. When they do not overlap, a shaded
          vertical band marks part of the screen, and you are asked which one is{' '}
          <strong>closer to you</strong> inside that band. A line runs on for ever, so the question
          is only ever about that one place.
        </p>
        <p>
          Some trials add <strong>Point C</strong>, sitting on a line, and ask which of{' '}
          <strong>A</strong> and <strong>B</strong> is <strong>closer to C</strong> in space, not on
          the screen. For a line that means its nearest point, for a sphere its surface, and for a
          vector its tip.
        </p>
        <div className="flex gap-3">{next}</div>
      </Overlay>
    )
  }

  const figure = CUE_FIGURES[page - 1]
  if (figure) {
    return (
      <Overlay width="max-w-[512px]">
        <h2 className="text-xl font-semibold">{figure.title}</h2>
        <p>
          The way the scene is drawn changes between blocks. Some blocks add one of these markings.
        </p>
        {/* At its rendered size (px, not rem), so the marking is as large as in a trial. */}
        <img
          src={figure.src}
          alt={figure.alt}
          width={512}
          height={300}
          className="rounded-lg border"
        />
        {/* Every caption shares one grid cell, so the box is as tall as the longest
            and the image and buttons stay put from page to page. */}
        <div className="grid">
          {CUE_FIGURES.map((f) => (
            <p
              key={f.src}
              aria-hidden={f !== figure}
              className={`col-start-1 row-start-1 ${f === figure ? '' : 'invisible'}`}
            >
              {f.text}
            </p>
          ))}
        </div>
        <div className="flex gap-3">
          {back}
          {next}
        </div>
      </Overlay>
    )
  }

  return (
    <Overlay>
      <h2 className="text-xl font-semibold">Before you start</h2>
      <p>
        Answer with the buttons on the right, as quickly and as accurately as you can. Not sure
        which label is which? Click a labelled object to hide or show its label.
      </p>
      <p>
        In many trials the answer will not be obvious. That is expected: if you are not sure, go
        with your best guess.
      </p>
      <p>
        There are {blockCount} blocks. The first few trials of each block are practice and tell you
        whether you were right.
      </p>
      <div className="flex gap-3">
        {back}
        <Button className="h-11 text-base" disabled={!canStart} onClick={onStart}>
          Start
        </Button>
      </div>
    </Overlay>
  )
}
