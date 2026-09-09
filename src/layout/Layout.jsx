import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Header from '@/components/Header/Header'
import ParticipantGate from '@/components/ParticipantGate/ParticipantGate'
import useThemeSync from '@/hooks/useThemeSync'
import useAuthStore from '@/store/useAuthStore'

export default function Layout() {
  useThemeSync()

  useEffect(() => {
    useAuthStore.getState().bootstrap()
  }, [])

  return (
    <ParticipantGate>
      <div className="app-container flex flex-col min-h-screen">
        <Header />

        <main className="flex-1 min-h-0 flex flex-col">
          <Outlet />
        </main>
      </div>
    </ParticipantGate>
  )
}
