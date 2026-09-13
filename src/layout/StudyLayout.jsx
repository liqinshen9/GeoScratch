import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import ParticipantGate from '@/components/ParticipantGate/ParticipantGate'
import useThemeSync from '@/hooks/useThemeSync'
import useAuthStore from '@/store/useAuthStore'

// The study shell: same auth bootstrap and participant gate as Layout, but no
// header or navigation, so a participant has nowhere to go but the task.
export default function StudyLayout() {
  useThemeSync()

  useEffect(() => {
    useAuthStore.getState().bootstrap()
  }, [])

  return (
    <ParticipantGate>
      <main className="flex min-h-screen flex-col">
        <Outlet />
      </main>
    </ParticipantGate>
  )
}
