import { useCallback, useRef, useState } from 'react'
import BlocksCanvas from '@/components/BlocksCanvas/BlocksCanvas'
import Scene3D from '@/components/Scene3D/Scene3D'
import useSceneStore from '@/store/useSceneStore'
import EditorColumnHeaders from '@/components/EditorShell/EditorColumnHeaders'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import '@/components/EditorShell/editor-shell.css'

export default function SandboxPage() {
  const { objects, autoRender, setPendingObjects, setObjects } = useSceneStore()
  const { workspace } = useWorkspaceStore()
  const [categoryId, setCategoryId] = useState('create')
  const [workspaceMaximized, setWorkspaceMaximized] = useState(false)
  const clearWorkspaceRef = useRef(() => { })

  const handleObjectsChange = useCallback(
    (objs) => {
      setPendingObjects(objs)
      if (autoRender) setObjects(objs)
    },
    [autoRender, setPendingObjects, setObjects]
  )

  return (
    <div className={`editor-shell${workspaceMaximized ? ' editor-shell--maximized' : ''}`}>
      <EditorColumnHeaders
        categoryId={categoryId}
        workspace={workspace}
        workspaceMaximized={workspaceMaximized}
        onWorkspaceMaximizedChange={setWorkspaceMaximized}
        onClearWorkspace={() => clearWorkspaceRef.current()}
      />
      <div className="editor-body-row">
        <BlocksCanvas
          id="sandbox" // <-- NEW: Ties this canvas to the 'sandbox' memory bank
          categoryId={categoryId}
          workspaceMaximized={workspaceMaximized}
          onCategoryChange={setCategoryId}
          onObjectsChange={handleObjectsChange}
          onRegisterClear={(fn) => {
            clearWorkspaceRef.current = fn
          }}
        />
        <Scene3D objects={objects} />
      </div>
    </div>
  )
}
