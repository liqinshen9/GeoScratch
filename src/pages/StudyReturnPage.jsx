import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FullScreen } from '@/components/StudyGate/StudyGate'
import useStudySession from '@/study/session/useStudySession'

// /study/return: where every Qualtrics survey's end-of-survey redirect lands,
// in the tab the questionnaire was opened in. Advancing the cursor here is
// enough: the GeoScratch tab picks it up from localStorage. The session
// advances only past the survey this browser handed off to (acceptReturn), so
// reloading this URL cannot skip a step.

export default function StudyReturnPage() {
  const { study, receiveReturn } = useStudySession()
  const [params] = useSearchParams()
  const returnedId = params.get('participantID')
  const mismatch = Boolean(returnedId && study && returnedId !== study.researchId)
  const handled = useRef(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (handled.current || mismatch || !study) return
    handled.current = true
    receiveReturn({ participant_id: returnedId })
    setDone(true)
    // Only succeeds for a tab a script opened with no history; the message
    // below covers every other case.
    window.close()
  }, [mismatch, study, returnedId, receiveReturn])

  if (mismatch) {
    return (
      <FullScreen>
        <p className="max-w-md text-center text-base">
          This questionnaire was for research ID <strong>{returnedId}</strong>, but this browser is
          running <strong>{study.researchId}</strong>. Please contact the researcher.
        </p>
      </FullScreen>
    )
  }

  if (!done) return null
  return (
    <FullScreen>
      <div className="flex max-w-md flex-col items-center gap-3 text-center text-base">
        <h2 className="text-xl font-semibold">Thank you</h2>
        <p>Your answers are saved. Close this tab and go back to the GeoScratch tab.</p>
      </div>
    </FullScreen>
  )
}
