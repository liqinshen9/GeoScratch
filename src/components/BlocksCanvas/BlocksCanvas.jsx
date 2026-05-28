import { useCallback, useEffect, useRef } from 'react'
import * as Blockly from 'blockly/core'
import defineBlocks from '@/components/BlocksCanvas/blocks/index'
import { BlockRegistry } from '@/components/BlocksCanvas/state/BlockRegistry'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import useThreeStore from '@/store/useThreeStore'
import 'blockly/blocks'
import {
  obj3DFlyoutCallback,
} from '@/utils/callbacks'
import runAndSync from '../../utils/runAndSync'
import attachResizeObserver from '@/utils/attachResizeOberver'
import setupChangeListener from '@/utils/setupChangeListener'
import initWorkSpace from '@/components/BlocksCanvas/core/Workspace'
import applyExampleXml from '@/utils/applyExampleXml'
import addBlockToWorkspace from '@/utils/addBlockToWorkspace'
import CategoryToolbox from '@/components/BlocksCanvas/toolbox/CategoryToolbox'
import BlockPalette from '@/components/BlocksCanvas/palette/BlockPalette'
import './BlocksCanvas.css'

export default function BlocksCanvas({
  onObjectsChange,
  categoryId,
  workspaceMaximized,
  onCategoryChange,
  onRegisterClear,
}) {
  const workspaceHostRef = useRef(null)
  const registryRef = useRef(null)
  const onObjectsChangeRef = useRef(onObjectsChange)
  useEffect(() => {
    onObjectsChangeRef.current = onObjectsChange
  }, [onObjectsChange])

  const {
    workspace,
    setWorkspace,
    setDialogOpen,
    exampleXml,
    clearExampleXml,
  } = useWorkspaceStore()

  const { clearObjects } = useThreeStore()

  const handleClearWorkspace = useCallback(() => {
    if (!workspace) return
    workspace.clear()
    clearObjects()
    runAndSync(workspace, (objs) => onObjectsChangeRef.current?.(objs), registryRef.current)
  }, [workspace, clearObjects])

  useEffect(() => {
    onRegisterClear?.(handleClearWorkspace)
  }, [onRegisterClear, handleClearWorkspace])

  const handleBlockSelect = useCallback(
    (type) => {
      if (!workspace) return
      addBlockToWorkspace(workspace, type)
    },
    [workspace]
  )

  const registerCallbacks = (ws) => {
    ws.registerButtonCallback('createObj3DButtonCallback', () => {
      setWorkspace(ws)
      setDialogOpen(true)
    })
    ws.registerToolboxCategoryCallback('OBJS_3D', obj3DFlyoutCallback)
  }

  useEffect(() => {
    defineBlocks()
    if (!registryRef.current) registryRef.current = new BlockRegistry()

    const ws = initWorkSpace(workspaceHostRef.current)
    setWorkspace(ws)
    registerCallbacks(ws)

    const cleanupListener = setupChangeListener(ws, (w) => {
      clearObjects()
      runAndSync(w, (objs) => onObjectsChangeRef.current?.(objs), registryRef.current)
    })

    runAndSync(ws, (objs) => onObjectsChangeRef.current?.(objs), registryRef.current)

    ws.scrollCenter?.()
    Blockly.svgResize(ws)

    const cleanupResize = attachResizeObserver(workspaceHostRef.current, ws)

    return () => {
      cleanupListener()
      cleanupResize()
      ws.dispose()
    }
  }, [])

  useEffect(() => {
    if (!workspace || !exampleXml) return
    const ok = applyExampleXml(workspace, exampleXml)
    if (ok) {
      runAndSync(workspace, onObjectsChange, registryRef.current)
    }
    clearExampleXml()
    requestAnimationFrame(() => Blockly.svgResize(workspace))
  }, [exampleXml, workspace])

  useEffect(() => {
    if (!workspace) return
    const id = requestAnimationFrame(() => Blockly.svgResize(workspace))
    return () => cancelAnimationFrame(id)
  }, [workspaceMaximized, workspace])

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
        <div className="workspace-host" ref={workspaceHostRef} />
      </section>
    </div>
  )
}
