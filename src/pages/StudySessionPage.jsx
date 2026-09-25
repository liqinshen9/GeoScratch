import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { FullScreen } from '@/components/StudyGate/StudyGate'
import useAuthStore from '@/store/useAuthStore'
import useStudySession from '@/study/session/useStudySession'
import { STEP_KINDS, surveyUrl } from '@/study/session/sessionPlan'

// /study: routes the participant to wherever the session cursor points, and
// owns the screens between tasks (welcome, questionnaire handoff, finish).
// See docs/architecture/study-session.md.

const SURVEY_COPY = {
  perBlock: 'Please answer a short questionnaire about the block you just finished.',
  holistic: 'Please answer a short questionnaire about the task you just finished.',
  post: 'Last step: a questionnaire about the whole session.',
}

export default function StudySessionPage() {
  const { study, plan, cursor, step, start, handOffToSurvey, receiveReturn } = useStudySession()
  const navigate = useNavigate()

  const surveyStepIndex = step?.kind === STEP_KINDS.SURVEY ? step.stepIndex : null
  useEffect(() => {
    if (surveyStepIndex != null) start(surveyStepIndex)
  }, [surveyStepIndex, start])

  if (!plan || !step) return null

  const welcome = cursor.stepIndex === 0 && cursor.startedAt?.[0] == null
  if (welcome) {
    return (
      <Screen researchId={study.researchId}>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
        <p>Your research ID is</p>
        <p className="font-mono text-4xl font-semibold tracking-[0.2em]">{study.researchId}</p>
        <p className="text-muted-foreground">
          The researcher will note it down. It links your answers to what you do in GeoScratch, and
          it is not connected to your name.
        </p>
        <Button
          className="h-11 text-base"
          onClick={() => {
            start(0)
            navigate('/study/phase1')
          }}
        >
          Begin
        </Button>
      </Screen>
    )
  }

  if (step.kind === STEP_KINDS.PHASE1_BLOCK) return <Navigate to="/study/phase1" replace />
  if (step.kind === STEP_KINDS.HOLISTIC) return <Navigate to="/study/task" replace />

  if (step.kind === STEP_KINDS.SURVEY) {
    const waiting = cursor.awaiting?.stepIndex === step.stepIndex
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
            href={surveyUrl(step)}
            target="_blank"
            rel="noopener"
            onClick={() => handOffToSurvey(step.stepIndex)}
          >
            {waiting ? 'Open it again' : 'Open questionnaire'}
          </a>
        </Button>
        {waiting && <ManualContinue onConfirm={() => receiveReturn({ manual: true })} />}
      </Screen>
    )
  }

  return <Finished researchId={study.researchId} />
}

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
        Researcher: the questionnaire was submitted but this page did not move on
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
  const resetIdentity = useAuthStore((s) => s.resetIdentity)
  const [confirming, setConfirming] = useState(false)
  return (
    <Screen researchId={researchId}>
      <h2 className="text-xl font-semibold">All done</h2>
      <p>Thank you for taking part. Please let the researcher know you have finished.</p>
      {confirming ? (
        <div className="flex gap-3">
          <Button variant="destructive" onClick={() => resetIdentity()}>
            End this session
          </Button>
          <Button variant="outline" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setConfirming(true)}>
          Researcher: start the next participant
        </Button>
      )}
    </Screen>
  )
}

function Screen({ researchId, children }) {
  return (
    <FullScreen>
      <div className="flex max-w-lg flex-col items-start gap-4 text-base leading-relaxed">
        {children}
      </div>
      <p className="fixed bottom-3 right-4 font-mono text-xs text-muted-foreground">{researchId}</p>
    </FullScreen>
  )
}
