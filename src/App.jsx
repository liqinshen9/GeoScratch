import { useCallback, useRef, useState } from 'react'
import BlocksCanvas from '@/components/BlocksCanvas/BlocksCanvas'
import Scene3D from '@/components/Scene3D/Scene3D'
import useSceneStore from '@/store/useSceneStore'
import EditorColumnHeaders from '@/components/EditorShell/EditorColumnHeaders'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import '@/components/EditorShell/editor-shell.css'

export default function App() {
  const { objects, autoRender, setPendingObjects, setObjects } = useSceneStore()
  const { workspace } = useWorkspaceStore()
  const [categoryId, setCategoryId] = useState('create')
  const clearWorkspaceRef = useRef(() => {})

  const handleObjectsChange = useCallback(
    (objs) => {
      setPendingObjects(objs)
      if (autoRender) setObjects(objs)
    },
    [autoRender, setPendingObjects, setObjects]
  )

  return (
    <div className="editor-shell">
      <EditorColumnHeaders
        categoryId={categoryId}
        workspace={workspace}
        onClearWorkspace={() => clearWorkspaceRef.current()}
      />
      <div className="editor-body-row">
        <BlocksCanvas
          categoryId={categoryId}
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
