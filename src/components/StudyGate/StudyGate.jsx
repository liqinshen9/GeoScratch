import { useState } from 'react'
import useAuthStore from '@/store/useAuthStore'
import { parseStudySlot } from '@/study/session/researchId'
import { buildSessionPlan } from '@/study/session/sessionPlan'
import { logStudyEvent, recordSessionPlan, sessionContext } from '@/study/session/studyEvents'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const SETTINGS = [
  { value: 'lab', label: 'Lab machine' },
  { value: 'remote', label: 'Remote (own device)' },
]

/**
 * The /study shell's gate. The researcher enters the counterbalancing slot and
 * the study setting; GeoScratch generates the research ID. Nothing below it
 * renders until that is done. See docs/architecture/study-session.md.
 */
export default function StudyGate({ children }) {
  const status = useAuthStore((s) => s.status)
  const study = useAuthStore((s) => s.study)
  const startStudySession = useAuthStore((s) => s.startStudySession)

  const [slotText, setSlotText] = useState('')
  const [setting, setSetting] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

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

  if (study?.researchId) return children

  const submit = async (e) => {
    e.preventDefault()
    const slot = parseStudySlot(slotText)
    if (!slot) {
      setError('Enter the participant slot number (1, 2, 3, ...).')
      return
    }
    if (!setting) {
      setError('Choose where this session is running.')
      return
    }
    setBusy(true)
    setError(null)
    const res = await startStudySession({ slot, setting })
    setBusy(false)
    if (!res.ok) {
      setError('Could not start the session. Check the connection and try again.')
      return
    }
    recordSessionPlan(buildSessionPlan({ researchId: res.researchId, slot }))
    logStudyEvent('session_start', null, { slot, ...sessionContext(setting) })
  }

  return (
    <FullScreen>
      <form
        onSubmit={submit}
        className="flex w-full max-w-md flex-col gap-5 rounded-xl border bg-background p-8 shadow-sm"
      >
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">New study session</h1>
          <p className="text-base text-muted-foreground">
            For the researcher. A research ID is generated when the session starts.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="study-slot" className="text-base">
            Participant slot
          </Label>
          <Input
            id="study-slot"
            autoFocus
            inputMode="numeric"
            autoComplete="off"
            className="h-11 text-base md:text-base"
            value={slotText}
            onChange={(e) => setSlotText(e.target.value)}
            aria-invalid={Boolean(error)}
          />
          <p className="text-sm text-muted-foreground">
            Sets the condition order. Use each number once, in order.
          </p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-base font-medium">Setting</legend>
          {SETTINGS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-base">
              <input
                type="radio"
                name="study-setting"
                value={option.value}
                checked={setting === option.value}
                onChange={() => setSetting(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        {status === 'offline' && (
          <p className="text-sm text-muted-foreground">
            No backend configured: this session will not be recorded.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy} className="h-11 text-base">
          {busy ? 'Starting…' : 'Start session'}
        </Button>
      </form>
    </FullScreen>
  )
}

export function FullScreen({ children }) {
  return <div className="flex min-h-screen flex-1 items-center justify-center p-6">{children}</div>
}
