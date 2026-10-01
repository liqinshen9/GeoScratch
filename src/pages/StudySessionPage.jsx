import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { FullScreen } from '@/components/StudyGate/StudyGate'
import useStudySession from '@/study/session/useStudySession'
import { STEP_KINDS, surveyUrl } from '@/study/session/sessionPlan'
import { holisticTaskCapMs, RENDER_MODES } from '@/study/session/holistic'
import { getExercise } from '@/data/exercises'

// /study: routes the participant to wherever the session cursor points, and
// owns the screens between tasks (welcome, questionnaire handoff, finish).
// See docs/architecture/study-session.md.

const SURVEY_COPY = {
  demographic: 'First, a short questionnaire about you and your background.',
  perBlock: 'Please answer a short questionnaire about the block you just finished.',
  holistic: 'Please answer a short questionnaire about the task you just finished.',
  post: 'Last step: a questionnaire about the whole session.',
}

export default function StudySessionPage() {
  const { study, plan, cursor, step, start, handOffToSurvey, receiveReturn } = useStudySession()

  // The first step is itself a questionnaire, so the welcome screen must hold
  // off the effect below or it would start that step and skip the welcome.
  const welcome = cursor.stepIndex === 0 && cursor.startedAt?.[0] == null
  const surveyStepIndex = !welcome && step?.kind === STEP_KINDS.SURVEY ? step.stepIndex : null
  useEffect(() => {
    if (surveyStepIndex != null) start(surveyStepIndex)
  }, [surveyStepIndex, start])

  if (!plan || !step) return null

  if (welcome) {
    return (
      <Screen researchId={study.researchId}>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
        <p>Your research ID is</p>
        <p className="font-mono text-4xl font-semibold tracking-[0.2em]">{study.researchId}</p>
        <p className="text-muted-foreground">
          It links your answers to what you do in GeoScratch, and it is not connected to your name.
        </p>
        <Button className="h-11 text-base" onClick={() => start(0)}>
          Begin
        </Button>
      </Screen>
    )
  }

  if (step.kind === STEP_KINDS.PHASE1_BLOCK) return <Navigate to="/study/phase1" replace />
  if (step.kind === STEP_KINDS.HOLISTIC) {
    // A task's clock starts on its Start button, not when the exercise opens.
    if (cursor.startedAt?.[step.stepIndex] != null) {
      return <Navigate to={`/exercise/${step.exerciseId}`} replace />
    }
    return (
      <HolisticBriefing
        key={step.stepIndex}
        task={step}
        taskCount={plan.steps.filter((s) => s.kind === STEP_KINDS.HOLISTIC).length}
        researchId={study.researchId}
        onStart={() => start(step.stepIndex)}
      />
    )
  }

  if (step.kind === STEP_KINDS.SURVEY) {
    const waiting = cursor.awaiting?.stepIndex === step.stepIndex
    const href = surveyUrl(step)
    if (!href) {
      return (
        <Screen researchId={study.researchId}>
          <h2 className="text-xl font-semibold">Questionnaire</h2>
          <p className="text-muted-foreground">
            This questionnaire&apos;s link is not set yet ({step.survey}).
          </p>
          <ManualContinue
            onConfirm={() => {
              handOffToSurvey(step.stepIndex)
              receiveReturn({ manual: true, link_unset: true })
            }}
          />
        </Screen>
      )
    }
    return (
      <Screen researchId={study.researchId}>
        <h2 className="text-xl font-semibold">Questionnaire</h2>
        <p>{SURVEY_COPY[step.survey]}</p>
        {waiting ? (
          <p className="text-muted-foreground">
            The questionnaire is open in another tab. When you submit it, this page moves on by
            itself.
          </p>
        ) : (
          <p className="text-muted-foreground">It opens in a new tab.</p>
        )}
        <Button asChild variant={waiting ? 'outline' : 'default'} className="h-11 text-base">
          <a
            href={href}
            target="_blank"
            rel="noopener"
            onClick={() => handOffToSurvey(step.stepIndex)}
          >
            {waiting ? 'Open it again' : 'Open questionnaire'}
          </a>
        </Button>
        {waiting && <ManualContinue onConfirm={() => receiveReturn({ manual: true })} />}
        {import.meta.env.DEV && (
          <button
            type="button"
            className="text-left text-xs underline"
            onClick={() => {
              handOffToSurvey(step.stepIndex)
              receiveReturn({ manual: true, dev_skip: true })
            }}
          >
            Skip questionnaire (dev)
          </button>
        )}
      </Screen>
    )
  }

  return <Finished researchId={study.researchId} />
}

// Before each holistic task: the first one opens with an introduction to the
// editor, since participants have not used it before. See
// docs/architecture/study-session.md#holistic-tasks.
function HolisticBriefing({ task, taskCount, researchId, onStart }) {
  const intro = task.conditionIndex === 0 ? HOLISTIC_INTRO : []
  const [page, setPage] = useState(0)
  const back = page > 0 && (
    <Button variant="outline" className="h-11 text-base" onClick={() => setPage(page - 1)}>
      Back
    </Button>
  )

  if (page < intro.length) {
    const { title, width, body } = intro[page]
    return (
      <Screen researchId={researchId} width={width}>
        <h2 className="text-xl font-semibold">{title}</h2>
        {body({ taskCount })}
        <div className="flex gap-3">
          {back}
          <Button className="h-11 text-base" onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      </Screen>
    )
  }

  const minutes = Math.round(holisticTaskCapMs(task.exerciseId) / 60000)
  return (
    <Screen researchId={researchId}>
      <p className="text-muted-foreground">
        Task {task.conditionIndex + 1} of {taskCount}
      </p>
      <h2 className="text-xl font-semibold">{getExercise(task.exerciseId)?.title}</h2>
      <p>You have {minutes} minutes for this task.</p>
      {task.mode === RENDER_MODES.ANIMATED && (
        <p>
          In this task, &#9654;&#xFE0E; above the 3D view plays your blocks step by step. Try it as
          you build.
        </p>
      )}
      <p className="text-muted-foreground">The clock starts when you press Start.</p>
      <div className="flex gap-3">
        {back}
        <Button className="h-11 text-base" onClick={onStart}>
          Start
        </Button>
      </div>
    </Screen>
  )
}

const HOLISTIC_INTRO = [
  {
    title: 'Part two: building with blocks',
    body: ({ taskCount }) => (
      <>
        <p>
          That is the end of the first part. In this part you use GeoScratch to solve {taskCount}{' '}
          geometry tasks by building them out of blocks.
        </p>
        <p>
          Each task has a time limit, and after each one there is a short questionnaire, as before.
        </p>
        <p>
          As in the first part, the way the scene is drawn changes from task to task. In some tasks
          you can also play your blocks as an animation.
        </p>
        <p>
          The next pages show how the editor works. Take your time: the clock for a task only starts
          when you press Start.
        </p>
      </>
    ),
  },
  {
    title: 'The editor',
    width: 'max-w-3xl',
    body: () => (
      <>
        <img
          src="/study/editor.png"
          alt="The GeoScratch editor: the Exercise panel, the Toolbox, the Workspace with a few blocks, and the 3D View showing a teapot."
          width={1280}
          height={720}
          className="w-full rounded-lg border"
        />
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <strong>Exercise</strong> describes the task: the values you are given and a list of
            steps. A step turns green once your blocks do it. Your time and the Continue button are
            at the bottom.
          </li>
          <li>
            <strong>Toolbox</strong> holds the blocks, grouped into Create, Transform and Compute.
            Click a group to open it.
          </li>
          <li>
            <strong>Workspace</strong> is where you build.
          </li>
          <li>
            <strong>3D View</strong> shows what your blocks make. It updates as soon as you change a
            block.
          </li>
        </ul>
      </>
    ),
  },
  {
    title: 'Working with blocks',
    body: () => (
      <ul className="flex list-disc flex-col gap-2 pl-5">
        <li>Click a block in the toolbox, or drag it out, to add it to the workspace.</li>
        <li>
          Blocks fit together like puzzle pieces. Drag a block onto a slot of another block and let
          go when it snaps in. Dragging a block also moves the blocks attached to it.
        </li>
        <li>
          To change a number, click it and type. Some blocks have a &#9662; menu, for example to
          pick an axis.
        </li>
        <li>
          Some Compute blocks have a <strong>show</strong> button that opens up their result.
        </li>
        <li>
          To remove a block, drag it to the bin in the corner of the workspace, or click it and
          press Delete. Ctrl+Z undoes a change.
        </li>
        <li>Right-click a block for more options, such as Duplicate.</li>
      </ul>
    ),
  },
  {
    title: 'The 3D view and your time',
    body: () => (
      <>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            Drag in the 3D view to turn it, right-drag to move it, and scroll to zoom. The Default
            view button in its bottom-right corner puts it back.
          </li>
          <li>Click an object to highlight the block that made it.</li>
        </ul>
        <p>
          The time left is shown under the steps. Continue unlocks once your blocks solve the task,
          or when the time runs out. If you get stuck, keep trying until the time is up: it is fine
          not to finish.
        </p>
      </>
    ),
  },
]

// For a survey whose redirect did not come back (not configured, or the tab was
// closed on Qualtrics' own end page). Logged as a manual return.
function ManualContinue({ onConfirm }) {
  const [confirming, setConfirming] = useState(false)
  if (!confirming) {
    return (
      <button
        type="button"
        className="text-sm text-muted-foreground underline"
        onClick={() => setConfirming(true)}
      >
        I submitted the questionnaire but this page did not move on
      </button>
    )
  }
  return (
    <div className="flex gap-3">
      <Button variant="outline" onClick={onConfirm}>
        Continue without the redirect
      </Button>
      <Button variant="ghost" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  )
}

function Finished({ researchId }) {
  return (
    <Screen researchId={researchId}>
      <h2 className="text-xl font-semibold">All done</h2>
      <p>Thank you for taking part. Feel free to close this tab.</p>
    </Screen>
  )
}

function Screen({ researchId, width = 'max-w-lg', children }) {
  return (
    <FullScreen>
      <div className={`flex w-full ${width} flex-col items-start gap-4 text-base leading-relaxed`}>
        {children}
      </div>
      <p className="fixed bottom-3 right-4 font-mono text-xs text-muted-foreground">{researchId}</p>
    </FullScreen>
  )
}
