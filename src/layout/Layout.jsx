import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Header from '@/components/Header/Header'
import ParticipantGate from '@/components/ParticipantGate/ParticipantGate'
import useAuthStore from '@/store/useAuthStore'

export default function Layout() {
  useEffect(() => {
    useAuthStore.getState().bootstrap()
  }, [])

  return (
    <div className="app-container flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 min-h-0 flex flex-col">
        <ParticipantGate>
          <Outlet />
        </ParticipantGate>
      </main>
    </div>
  )
}
