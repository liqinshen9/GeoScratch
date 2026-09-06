import { Outlet } from 'react-router-dom'
import Header from '@/components/Header/Header'

export default function Layout() {
  return (
    <div className="app-container flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 min-h-0 flex flex-col">
        <Outlet />
      </main>
    </div>
  )
}
