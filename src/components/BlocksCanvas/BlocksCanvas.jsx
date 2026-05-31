import { useCallback, useEffect, useRef } from 'react'
import addBlockToWorkspace from '@/utils/addBlockToWorkspace'
import CategoryToolbox from '@/components/BlocksCanvas/toolbox/CategoryToolbox'
import BlockPalette from '@/components/BlocksCanvas/palette/BlockPalette'
import { useBlocksWorkspace } from '@/components/BlocksCanvas/hooks/useBlocksWorkspace'
import './BlocksCanvas.css'

export default function BlocksCanvas({
  onObjectsChange,
  categoryId,
  workspaceMaximized,
  onCategoryChange,
  onRegisterClear,
}) {
  const workspaceHostRef = useRef(null)
  const onObjectsChangeRef = useRef(onObjectsChange)
  useEffect(() => {
    onObjectsChangeRef.current = onObjectsChange
  }, [onObjectsChange])

  const { workspace, syncScene, clearObjects } = useBlocksWorkspace({
    workspaceHostRef,
    onObjectsChangeRef,
    workspaceMaximized,
  })

  const handleClearWorkspace = useCallback(() => {
    if (!workspace) return
    workspace.clear()
    clearObjects()
    syncScene(workspace)
  }, [workspace, clearObjects, syncScene])

  useEffect(() => {
    onRegisterClear?.(handleClearWorkspace)
  }, [onRegisterClear, handleClearWorkspace])

  const handleBlockSelect = useCallback(
    (type) => {
      if (!workspace) return
      addBlockToWorkspace(workspace, type)
    },
    [workspace],
  )

  const handleWorkspaceDragOver = useCallback((event) => {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleWorkspaceDrop = useCallback(
    (event) => {
      event.preventDefault()
      if (!workspace) return
      const type = event.dataTransfer?.getData('application/x-geoscratch-block-type')
      if (!type) return
      addBlockToWorkspace(workspace, type, {
        clientX: event.clientX,
        clientY: event.clientY,
      })
    },
    [workspace],
  )

  return (
    <div id="blocks-canvas" className="blocks-shell">
      {!workspaceMaximized && (
        <aside className="blocks-col blocks-col--toolbox">
          <CategoryToolbox selected={categoryId} onSelect={onCategoryChange} />
        </aside>
      )}

      {!workspaceMaximized && (
        <aside className="blocks-col blocks-col--palette">
          <BlockPalette categoryId={categoryId} onBlockSelect={handleBlockSelect} />
        </aside>
      )}

      <section className="blocks-col blocks-col--workspace">
        <div
          className="workspace-host"
          ref={workspaceHostRef}
          onDragOver={handleWorkspaceDragOver}
          onDrop={handleWorkspaceDrop}
        />
      </section>
    </div>
  )
}
