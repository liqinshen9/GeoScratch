import { Outlet } from 'react-router-dom'
import Header from '@/components/Header/Header'
import useSceneStore from '@/store/useSceneStore'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import { useCallback } from 'react'

const Layout = () => {
  const { autoRender, pendingObjects, setObjects, toggleAutoRender } = useSceneStore()

  const handleRun = useCallback(() => {
    if (!autoRender) setObjects(pendingObjects)
  }, [autoRender, pendingObjects, setObjects])

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <header className="h-[10%]">
        <Header
          autoRender={autoRender}
          onAutoRenderChange={toggleAutoRender}
          onRun={handleRun}
          onLoadExample={(xml) => {
            const { setExampleXml } = useWorkspaceStore.getState()
            setExampleXml(xml)
          }}
        />
      </header>

      <main className="h-[90%]">
        {/* This is where App.jsx will be rendered */}
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
