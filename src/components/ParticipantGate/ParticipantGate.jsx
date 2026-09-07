import { useState } from 'react'
import useAuthStore from '@/store/useAuthStore'
import { isValidParticipantCode } from '@/lib/participantCode'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Wraps the routed app. Until a participant code is set, nothing else renders.
 * When the backend is not configured the app runs untracked with a small
 * indicator. See docs/architecture/backend.md.
 */
export default function ParticipantGate({ children }) {
  const status = useAuthStore((s) => s.status)
  const participantCode = useAuthStore((s) => s.participantCode)
  const profileCode = useAuthStore((s) => s.profile?.participant_code)
  const setParticipantCode = useAuthStore((s) => s.setParticipantCode)

  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (status === 'offline') {
    return (
      <>
        {children}
        <div
          className="fixed bottom-2 left-2 z-50 rounded bg-muted px-2 py-1 text-xs text-muted-foreground shadow"
          title="No backend configured: exercise attempts are not being recorded."
        >
          tracking off
        </div>
      </>
    )
  }

  if (status === 'idle' || status === 'signing-in') {
    return <FullScreen>Connecting…</FullScreen>
  }

  if (status === 'error') {
    return (
      <FullScreen>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Could not reach the study server. Reload to try again; your work is not lost.
        </p>
      </FullScreen>
    )
  }

  const hasCode = Boolean(profileCode || participantCode)
  if (hasCode) return children

  const submit = async (e) => {
    e.preventDefault()
    if (!isValidParticipantCode(value)) {
      setError('Enter the code you were given (at least 2 characters).')
      return
    }
    setBusy(true)
    setError(null)
    const res = await setParticipantCode(value)
    setBusy(false)
    if (!res.ok) setError('Could not save that code. Check your connection and try again.')
  }

  return (
    <FullScreen>
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">Welcome to GeoScratch</h1>
          <p className="text-sm text-muted-foreground">Enter your participant code to begin.</p>
        </div>
        <Label htmlFor="participant-code">Participant code</Label>
        <Input
          id="participant-code"
          autoFocus
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={Boolean(error)}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Start'}
        </Button>
      </form>
    </FullScreen>
  )
}

function FullScreen({ children }) {
  return <div className="flex min-h-[60vh] flex-1 items-center justify-center p-6">{children}</div>
}
