import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import StudyGate from '@/components/StudyGate/StudyGate'
import useThemeSync from '@/hooks/useThemeSync'
import useAuthStore from '@/store/useAuthStore'

// The study shell: same auth bootstrap as Layout, but no header or navigation,
// so a participant has nowhere to go but the task. The dev-only preview and
// showcase pages skip the session gate.
export default function StudyLayout() {
  useThemeSync()
  const { pathname } = useLocation()

  useEffect(() => {
    useAuthStore.getState().bootstrap()
  }, [])

  const content = (
    <main className="flex min-h-screen flex-col">
      <Outlet />
    </main>
  )
  if (/\/(preview|showcase)$/.test(pathname)) return content
  return <StudyGate>{content}</StudyGate>
}
