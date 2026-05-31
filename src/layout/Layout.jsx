import { Outlet } from 'react-router-dom'
import Header from '@/components/Header/Header'
import useSceneStore from '@/store/useSceneStore'
import { useCallback } from 'react'

const Layout = () => {
  const { autoRender, pendingObjects, setObjects, toggleAutoRender } = useSceneStore()

  const handleRun = useCallback(() => {
    if (!autoRender) setObjects(pendingObjects)
  }, [autoRender, pendingObjects, setObjects])

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--bg-main)]">
      <header className="app-nav shrink-0 w-full text-white">
        <Header
          autoRender={autoRender}
          onAutoRenderChange={toggleAutoRender}
          onRun={handleRun}
        />
      </header>

      <main className="flex-1 min-h-0 bg-[var(--bg-main)]">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
