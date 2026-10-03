import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import Header from '@/components/Header/Header'
import ParticipantGate from '@/components/ParticipantGate/ParticipantGate'
import useThemeSync from '@/hooks/useThemeSync'
import useAuthStore from '@/store/useAuthStore'
import useStudySession, { useCurrentStudyTask } from '@/study/session/useStudySession'

export default function Layout() {
  useThemeSync()
  const { pathname } = useLocation()

  // During a study session's holistic task, the task's exercise is the only
  // page: anything else (a typed URL, the back button) returns to it. Until
  // the task is started, its briefing on /study comes first.
  const { cursor } = useStudySession()
  const studyTask = useCurrentStudyTask()
  const studyTaskPath = !studyTask
    ? null
    : cursor.startedAt?.[studyTask.stepIndex] != null
      ? `/exercise/${studyTask.exerciseId}`
      : '/study'

  // Outside a study session the normal app signs nobody in and logs nothing.
  const inStudy = useAuthStore((s) => Boolean(s.study))
  useEffect(() => {
    useAuthStore.getState().bootstrap({ studyOnly: true })
  }, [inStudy])

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
