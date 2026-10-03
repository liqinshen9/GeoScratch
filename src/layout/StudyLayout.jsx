import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import StudyGate from '@/components/StudyGate/StudyGate'
import useThemeSync from '@/hooks/useThemeSync'
import useAuthStore from '@/store/useAuthStore'

// The study shell: same auth bootstrap as Layout, but no header or navigation,
// so a participant has nowhere to go but the task. The dev-only preview,
// showcase and pivot-diagrams pages skip the session gate.
export default function StudyLayout() {
  useThemeSync()
  const { pathname, search } = useLocation()

  // Sign in only for a study link or a session already running here, so
  // opening /study by itself creates no profile.
  const hasLink = new URLSearchParams(search).has('id')
  useEffect(() => {
    useAuthStore.getState().bootstrap({ studyOnly: !hasLink })
  }, [hasLink])

  const content = (
    <main className="flex min-h-screen flex-col">
      <Outlet />
    </main>
  )
  if (/\/(preview|showcase|pivot-diagrams)$/.test(pathname)) return content
  return <StudyGate>{content}</StudyGate>
}
