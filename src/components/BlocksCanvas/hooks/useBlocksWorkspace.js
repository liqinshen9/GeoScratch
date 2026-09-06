import { useCallback, useEffect, useRef } from 'react'
import * as Blockly from 'blockly/core'
import defineBlocks from '@/components/BlocksCanvas/blocks/index'
import { BlockRegistry } from '@/components/BlocksCanvas/state/BlockRegistry'
import {
  BLOCK_TYPE_OBJECT_TYPES,
  BLOCK_TYPE_ROLES,
} from '@/components/BlocksCanvas/blocks/blockColours'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import useThreeStore from '@/store/useThreeStore'
import { forInstance, forRole, subscribeToPreset } from '@/store/colorSystem'
import useSettingsStore from '@/store/useSettingsStore'
import { notifyAllBlockNamesChanged } from '@/utils/namingRegistry'
import runAndSync from '@/utils/runAndSync'
import attachResizeObserver from '@/utils/attachResizeOberver'
import setupChangeListener from '@/utils/setupChangeListener'
import initWorkSpace from '@/components/BlocksCanvas/core/Workspace'
import applyExampleXml from '@/utils/applyExampleXml'

export function useBlocksWorkspace({
  workspaceHostRef,
  onObjectsChangeRef,
  workspaceMaximized,
  runtimeMode,
}) {
  const registryRef = useRef(null)
  const { workspace, setWorkspace, exampleXml, clearExampleXml } = useWorkspaceStore()
  const clearObjects = useThreeStore((s) => s.clearObjects)

  const syncScene = useCallback(
    (ws) => {
      runAndSync(ws, (objs) => onObjectsChangeRef.current?.(objs), registryRef.current, {
        runtimeMode,
      })
    },
    [onObjectsChangeRef, runtimeMode],
  )

  useEffect(() => {
    defineBlocks()
    if (!registryRef.current) registryRef.current = new BlockRegistry()

    const ws = initWorkSpace(workspaceHostRef.current)
    setWorkspace(ws)

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

  // Recolors every existing block of the 7 primary creation types, plus any
  // non-renderable value-primitive blocks (Scalar, Vector4, ...), when the
  // color preset (Settings > Colors) changes, so blocks already sitting in
  // the workspace stay in sync with the object-color framework's colorSystem
  // -- the rendered 3D objects' own live-recolor is handled separately, per
  // object type, where each mesh is built.
  useEffect(() => {
    if (!workspace) return
    return subscribeToPreset(() => {
      workspace.getAllBlocks(false).forEach((block) => {
        const objectType = BLOCK_TYPE_OBJECT_TYPES[block.type]
        if (objectType) {
          block.setColour(forInstance(objectType, block.id))
          return
        }
        const role = BLOCK_TYPE_ROLES[block.type]
        if (role) block.setColour(forRole(role))
      })
    })
  }, [workspace])

  // Retroactively repaint every block's name field when the naming style
  // (short codes vs. descriptive) changes -- getDisplayName already prefers
  // a custom name over the style, so custom-named blocks are unaffected.
  useEffect(() => {
    if (!workspace) return
    let prev = useSettingsStore.getState().settings.namingStyle
    return useSettingsStore.subscribe((state) => {
      if (state.settings.namingStyle !== prev) {
        prev = state.settings.namingStyle
        notifyAllBlockNamesChanged(workspace)
      }
    })
  }, [workspace])

  return { workspace, registryRef, syncScene, clearObjects }
}
