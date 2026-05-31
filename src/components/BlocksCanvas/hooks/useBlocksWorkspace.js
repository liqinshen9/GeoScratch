import { useCallback, useEffect, useRef } from 'react'
import * as Blockly from 'blockly/core'
import defineBlocks from '@/components/BlocksCanvas/blocks/index'
import { BlockRegistry } from '@/components/BlocksCanvas/state/BlockRegistry'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import useThreeStore from '@/store/useThreeStore'
import { obj3DFlyoutCallback } from '@/utils/callbacks'
import runAndSync from '@/utils/runAndSync'
import attachResizeObserver from '@/utils/attachResizeOberver'
import setupChangeListener from '@/utils/setupChangeListener'
import initWorkSpace from '@/components/BlocksCanvas/core/Workspace'
import applyExampleXml from '@/utils/applyExampleXml'

export function useBlocksWorkspace({
  workspaceHostRef,
  onObjectsChangeRef,
  workspaceMaximized,
}) {
  const registryRef = useRef(null)
  const {
    workspace,
    setWorkspace,
    setDialogOpen,
    exampleXml,
    clearExampleXml,
  } = useWorkspaceStore()
  const clearObjects = useThreeStore((s) => s.clearObjects)

  const syncScene = useCallback(
    (ws) => {
      runAndSync(ws, (objs) => onObjectsChangeRef.current?.(objs), registryRef.current)
    },
    [onObjectsChangeRef],
  )

  const registerToolboxCallbacks = useCallback(
    (ws) => {
      ws.registerButtonCallback('createObj3DButtonCallback', () => {
        setWorkspace(ws)
        setDialogOpen(true)
      })
      ws.registerToolboxCategoryCallback('OBJS_3D', obj3DFlyoutCallback)
    },
    [setWorkspace, setDialogOpen],
  )

  useEffect(() => {
    defineBlocks()
    if (!registryRef.current) registryRef.current = new BlockRegistry()

    const ws = initWorkSpace(workspaceHostRef.current)
    setWorkspace(ws)
    registerToolboxCallbacks(ws)

    const cleanupListener = setupChangeListener(ws, (changedWorkspace) => {
      clearObjects()
      syncScene(changedWorkspace)
    })

    syncScene(ws)
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
    if (applyExampleXml(workspace, exampleXml)) {
      syncScene(workspace)
    }
    clearExampleXml()
    requestAnimationFrame(() => Blockly.svgResize(workspace))
  }, [exampleXml, workspace, clearExampleXml, syncScene])

  useEffect(() => {
    if (!workspace) return
    const frameId = requestAnimationFrame(() => Blockly.svgResize(workspace))
    return () => cancelAnimationFrame(frameId)
  }, [workspaceMaximized, workspace])

  return { workspace, registryRef, syncScene, clearObjects }
}
