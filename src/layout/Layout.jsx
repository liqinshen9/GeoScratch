import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import Header from '@/components/Header/Header'
import ParticipantGate from '@/components/ParticipantGate/ParticipantGate'
import useThemeSync from '@/hooks/useThemeSync'
import useAuthStore from '@/store/useAuthStore'
import { useCurrentStudyTask } from '@/study/session/useStudySession'

export default function Layout() {
  useThemeSync()
  const { pathname } = useLocation()

  // During a study session's holistic task, the task's exercise is the only
  // page: anything else (a typed URL, the back button) returns to it.
  const studyTask = useCurrentStudyTask()
  const studyTaskPath = studyTask ? `/exercise/${studyTask.exerciseId}` : null

  useEffect(() => {
    useAuthStore.getState().bootstrap()
  }, [])

  return (
    <ParticipantGate>
      <div className="app-container flex flex-col h-dvh overflow-hidden">
        <Header studyMode={Boolean(studyTask)} />

        <main className="flex-1 min-h-0 flex flex-col">
          {studyTaskPath && pathname !== studyTaskPath ? (
            <Navigate to={studyTaskPath} replace />
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </ParticipantGate>
  )
}
