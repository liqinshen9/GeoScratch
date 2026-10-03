import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import useAuthStore, { hasCompletedStudy } from '@/store/useAuthStore'
import { parseResearchId, parseStudySlot } from '@/study/session/researchId'
import { buildSessionPlan } from '@/study/session/sessionPlan'
import { logStudyEvent, recordSessionPlan, sessionContext } from '@/study/session/studyEvents'

// A participant's emailed link (scripts/studyLinks.mjs) carries the slot and
// a pregenerated research ID.
function readStudyLink(search) {
  const params = new URLSearchParams(search)
  const slot = parseStudySlot(params.get('slot'))
  const researchId = parseResearchId(params.get('id'))
  return slot && researchId ? { slot, researchId } : null
}

async function beginSession(startStudySession, { slot, researchId }) {
  const res = await startStudySession({ slot, researchId })
  if (!res.ok) return res
  recordSessionPlan(buildSessionPlan({ researchId, slot }))
  logStudyEvent('session_start', null, { slot, ...sessionContext() })
  return res
}

/**
 * The /study shell's gate. Only a study link starts a session, so every
 * research ID comes from the pregenerated sheet. Nothing below it renders
 * until that is done. See docs/architecture/study-session.md.
 */
export default function StudyGate({ children }) {
  const status = useAuthStore((s) => s.status)
  const study = useAuthStore((s) => s.study)
  const startStudySession = useAuthStore((s) => s.startStudySession)
  const finishedResearchId = useAuthStore((s) => s.finishedResearchId)

  const [error, setError] = useState(null)

  const { search } = useLocation()
  const link = useMemo(() => readStudyLink(search), [search])
  const linkStarted = useRef(null)
  const ready = status === 'ready' || status === 'offline'
  // Reopening the link resumes this device's session for that ID; any other
  // session on the device is replaced. A link this browser already finished
  // never starts again.
  const linkCompleted = Boolean(link) && hasCompletedStudy(link.researchId)
  const linkPending = link && !linkCompleted && study?.researchId !== link.researchId
  useEffect(() => {
    if (!ready || !linkPending || linkStarted.current === link.researchId) return
    linkStarted.current = link.researchId
    beginSession(startStudySession, link).then((res) => {
      if (!res.ok) setError('Could not start the session. Check the connection and reload.')
    })
  }, [ready, linkPending, link, startStudySession])

  // Before the status checks: finishing signs out, which leaves status idle.
  if (finishedResearchId) {
    return (
      <EndScreen title="All done">
        Thank you for taking part. Feel free to close this tab.
      </EndScreen>
    )
  }
  if (linkCompleted) {
    return (
      <EndScreen title="Already completed">
        You have already completed this study on this browser. Thank you for taking part.
      </EndScreen>
    )
  }

  // A deployed study must never run untracked: without the backend nothing is
  // recorded, and nothing on screen would say so.
  if (status === 'offline' && !import.meta.env.DEV) {
    return (
      <FullScreen>
        <p className="max-w-md text-center text-base text-muted-foreground">
          The study is not available right now. Please contact the researcher.
        </p>
      </FullScreen>
    )
  }

  if (status === 'idle' || status === 'signing-in') {
    return (
      <FullScreen>
        <p className="text-base text-muted-foreground">Connecting…</p>
      </FullScreen>
    )
  }

  if (status === 'error') {
    return (
      <FullScreen>
        <p className="max-w-md text-center text-base text-muted-foreground">
          Could not reach the study server. Reload to try again.
        </p>
      </FullScreen>
    )
  }

  if (linkPending) {
    return (
      <FullScreen>
        <p className="text-base text-muted-foreground">{error ?? 'Starting…'}</p>
      </FullScreen>
    )
  }

  if (study?.researchId) return children

  if (new URLSearchParams(search).has('id')) {
    return (
      <FullScreen>
        <p className="max-w-md text-center text-base text-muted-foreground">
          This study link is not valid. Please check it was copied in full.
        </p>
      </FullScreen>
    )
  }

  return (
    <FullScreen>
      <div className="flex max-w-md flex-col gap-3 text-center text-base leading-relaxed">
        <h1 className="text-2xl font-semibold tracking-tight">GeoScratch study</h1>
        <p className="text-muted-foreground">
          Please open the study link from your invitation email. It starts your session.
        </p>
      </div>
    </FullScreen>
  )
}

function EndScreen({ title, children }) {
  return (
    <FullScreen>
      <div className="flex max-w-md flex-col gap-3 text-base leading-relaxed">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p>{children}</p>
      </div>
    </FullScreen>
  )
}

export function FullScreen({ children }) {
  return <div className="flex min-h-screen flex-1 items-center justify-center p-6">{children}</div>
}
