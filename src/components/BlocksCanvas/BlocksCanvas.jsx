import { useCallback, useEffect, useRef, useState } from 'react'
import * as Blockly from 'blockly/core'
import addBlockToWorkspace from '@/utils/addBlockToWorkspace'
import CategoryToolbox from '@/components/BlocksCanvas/toolbox/CategoryToolbox'
import BlockPalette from '@/components/BlocksCanvas/palette/BlockPalette'
import { useBlocksWorkspace } from '@/components/BlocksCanvas/hooks/useBlocksWorkspace'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import { shouldIgnoreWorkspaceChange } from '@/utils/blocklyEventFilters'
import './BlocksCanvas.css'

export default function BlocksCanvas({
  id,
  onObjectsChange,
  categoryId,
  workspaceMaximized,
  floatingControls = false,
  paletteOpen = false,
  hideInlineControls = false,
  onCategoryChange,
  onRegisterClear,
}) {
  const workspaceHostRef = useRef(null)
  const onObjectsChangeRef = useRef(onObjectsChange)
  const [toolboxPosition, setToolboxPosition] = useState(null)

  // FIX 1: Only subscribe to the save function. 
  // Do NOT extract savedXml here, otherwise your entire canvas re-renders every time a block moves!
  const saveWorkspaceXml = useWorkspaceStore((state) => state.saveWorkspaceXml)
  const isFirstLoad = useRef(true)

  useEffect(() => {
    onObjectsChangeRef.current = onObjectsChange
  }, [onObjectsChange])

  const { workspace, syncScene, clearObjects } = useBlocksWorkspace({
    workspaceHostRef,
    onObjectsChangeRef,
    workspaceMaximized,
  })

  // Auto-Save and Auto-Load Logic
  useEffect(() => {
    // FIX 2: Ensure workspace exists AND is fully injected/rendered before manipulating it.
    // This stops the "Cannot create a rendered block in a headless workspace" crash.
    if (!workspace || !workspace.rendered || !id) return

    // 1. If we have saved data in the store, load it immediately on mount
    if (isFirstLoad.current) {
      // FIX 3: Fetch the current saved state directly without triggering React re-renders
      const initialXml = useWorkspaceStore.getState().savedXml[id]

      if (initialXml) {
        try {
          // FIX 4: Temporarily disable events so loading the XML doesn't trigger the auto-save listener
          Blockly.Events.disable()
          const dom = Blockly.utils.xml.textToDom(initialXml)
          Blockly.Xml.clearWorkspaceAndLoadFromXml(dom, workspace)
          syncScene(workspace)
        } catch (err) {
          console.error('Failed to restore workspace state:', err)
        } finally {
          // Always re-enable events
          Blockly.Events.enable()
        }
      }
      isFirstLoad.current = false
    }

    // 2. Listen to all workspace events and save to store silently
    let saveFrame = 0
    const handleWorkspaceChange = (event) => {
      // Ignore purely visual events and prevent saving if the workspace is in the process of being destroyed
      if (!workspace.rendered || shouldIgnoreWorkspaceChange(event)) return

      cancelAnimationFrame(saveFrame)
      saveFrame = requestAnimationFrame(() => {
        saveFrame = 0
        if (!workspace.rendered) return
        const dom = Blockly.Xml.workspaceToDom(workspace)
        const xmlText = Blockly.Xml.domToText(dom)
        saveWorkspaceXml(id, xmlText)
      })
    }

    workspace.addChangeListener(handleWorkspaceChange)

    return () => {
      cancelAnimationFrame(saveFrame)
      workspace.removeChangeListener(handleWorkspaceChange)
    }
  }, [workspace, id, saveWorkspaceXml, syncScene])

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

  const handleToolboxDragStart = useCallback(
    (event) => {
      if (!floatingControls || event.button !== 0) return
      const panel = event.currentTarget.closest('.blocks-floating-toolbox')
      const parent = panel?.offsetParent
      if (!panel || !parent) return
      event.preventDefault()

      const panelRect = panel.getBoundingClientRect()
      const parentRect = parent.getBoundingClientRect()
      const origin = toolboxPosition ?? {
        x: panelRect.left - parentRect.left,
        y: panelRect.top - parentRect.top,
      }

      setToolboxPosition(origin)

      function moveToolbox(moveEvent) {
        const currentPanelRect = panel.getBoundingClientRect()
        const currentParentRect = parent.getBoundingClientRect()
        const maxX = Math.max(8, currentParentRect.width - currentPanelRect.width - 8)
        const maxY = Math.max(8, currentParentRect.height - currentPanelRect.height - 8)
        const nextX = Math.min(Math.max(8, origin.x + moveEvent.clientX - event.clientX), maxX)
        const nextY = Math.min(Math.max(8, origin.y + moveEvent.clientY - event.clientY), maxY)
        setToolboxPosition({ x: nextX, y: nextY })
      }

      function stopToolbox() {
        window.removeEventListener('mousemove', moveToolbox)
        window.removeEventListener('mouseup', stopToolbox)
      }

      window.addEventListener('mousemove', moveToolbox)
      window.addEventListener('mouseup', stopToolbox)
    },
    [floatingControls, toolboxPosition],
  )

  const toolbox = (
    <aside className="blocks-col blocks-col--toolbox">
      <CategoryToolbox selected={categoryId} onSelect={onCategoryChange} />
    </aside>
  )

  const palette = (
    <aside className="blocks-col blocks-col--palette">
      <BlockPalette categoryId={categoryId} onBlockSelect={handleBlockSelect} />
    </aside>
  )

  return (
    <div
      id="blocks-canvas"
      className={`blocks-shell${floatingControls ? ' blocks-shell--floating-controls' : ''}`}
    >
      {floatingControls && (
        <div
          className="blocks-floating-toolbox"
          style={toolboxPosition ? { left: toolboxPosition.x, top: toolboxPosition.y } : undefined}
        >
          <div className="blocks-floating-toolbox__handle" onMouseDown={handleToolboxDragStart}>
            <span aria-hidden="true">::</span>
            <strong>Toolbox</strong>
          </div>
          <div className="blocks-floating-toolbox__body">
            {toolbox}
            {paletteOpen && palette}
          </div>
        </div>
      )}

      {!floatingControls && !hideInlineControls && !workspaceMaximized && toolbox}

      {!floatingControls && !hideInlineControls && !workspaceMaximized && palette}

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
