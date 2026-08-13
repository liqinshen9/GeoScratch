import { useCallback, useEffect, useRef, useState } from 'react'
import * as Blockly from 'blockly/core'
import { Delete, ZoomIn, ZoomOut } from '@icon-park/react'
import addBlockToWorkspace from '@/utils/addBlockToWorkspace'
import addCompositeBlockToWorkspace from '@/utils/addCompositeBlockToWorkspace'
import CategoryToolbox from '@/components/BlocksCanvas/toolbox/CategoryToolbox'
import BlockPalette from '@/components/BlocksCanvas/palette/BlockPalette'
import MyBlockDialog from '@/components/BlocksCanvas/MyBlockDialog'
import { BLOCK_CATEGORIES, flattenCategoryBlocks } from '@/components/BlocksCanvas/catalog/blockCatalog'
import { useBlocksWorkspace } from '@/components/BlocksCanvas/hooks/useBlocksWorkspace'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import { shouldIgnoreWorkspaceChange } from '@/utils/blocklyEventFilters'
import './BlocksCanvas.css'

const BUILT_IN_BLOCK_TYPES = new Set(
  Object.values(BLOCK_CATEGORIES).flatMap((category) => flattenCategoryBlocks(category).map((block) => block.type)),
)

const IGNORED_DUPLICATE_ATTRIBUTES = new Set(['id', 'x', 'y'])
const TRASH_BLOCK_XML_TRANSFER_TYPE = 'application/x-geoscratch-trash-block-xml'
const TRASH_BLOCK_ID_TRANSFER_TYPE = 'application/x-geoscratch-trash-block-id'
const TRASH_HIT_PADDING = 6

function canonicalizeNode(node) {
  const tagName = node.tagName?.toLowerCase()
  if (!tagName) return ''

  const attributes = Array.from(node.attributes || [])
    .filter((attribute) => !IGNORED_DUPLICATE_ATTRIBUTES.has(attribute.name.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((attribute) => `${attribute.name}=${JSON.stringify(attribute.value)}`)
    .join(',')

  const children = Array.from(node.children || []).map(canonicalizeNode)
  if (tagName === 'xml') children.sort()

  const text = Array.from(node.childNodes || [])
    .filter((child) => child.nodeType === Node.TEXT_NODE)
    .map((child) => child.textContent.trim())
    .filter(Boolean)
    .join(' ')

  return `${tagName}(${attributes}){${JSON.stringify(text)}}[${children.join('')}]`
}

function canonicalizeWorkspaceXml(xmlText) {
  try {
    return canonicalizeNode(Blockly.utils.xml.textToDom(xmlText))
  } catch (err) {
    console.error('[GeoScratch] Failed to compare My Block XML:', err)
    return ''
  }
}

function rectContainsPoint(rect, x, y, padding = 0) {
  return !!rect &&
    x >= rect.left - padding &&
    x <= rect.right + padding &&
    y >= rect.top - padding &&
    y <= rect.bottom + padding
}

function getDeletedBlockLabel(block) {
  return block.toString?.(48) || block.type || 'Deleted block'
}

function getBlockPreviewSvg(block) {
  const root = block.getSvgRoot?.()
  const bounds = root?.getBBox?.()
  if (!root || !bounds?.width || !bounds?.height) return ''

  const clone = root.cloneNode(true)
  clone.removeAttribute('transform')
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="${Math.floor(bounds.x)} ${Math.floor(bounds.y)} ${Math.ceil(bounds.width)} ${Math.ceil(bounds.height)}">
      ${clone.outerHTML}
    </svg>
  `
}

function toWorkspaceXmlText(xmlText) {
  const dom = Blockly.utils.xml.textToDom(xmlText)
  if (dom.tagName?.toLowerCase() === 'xml') return xmlText

  const xml = Blockly.utils.xml.createElement('xml')
  xml.appendChild(dom)
  return Blockly.Xml.domToText(xml)
}

function WorkspaceControls({
  workspace,
  trashTargetRef,
  trashIconRef,
  trashPanelOpen,
  recentDeletedBlocks,
  onTrashClick,
  onDeletedDragStart,
  onRestoreDeleted,
}) {
  const stopWorkspaceGesture = (event) => {
    event.stopPropagation()
  }

  const zoom = (amount) => {
    if (!workspace) return
    workspace.markFocused?.()
    workspace.zoomCenter(amount)
  }

  return (
    <div className="workspace-controls" aria-label="Workspace controls" onPointerDown={stopWorkspaceGesture}>
      <button
        type="button"
        className="workspace-control-button"
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => zoom(1)}
      >
        <ZoomIn theme="outline" size="36" fill="#333" />
      </button>
      <button
        type="button"
        className="workspace-control-button"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => zoom(-1)}
      >
        <ZoomOut theme="outline" size="36" fill="#333" />
      </button>
      <button
        ref={trashTargetRef}
        type="button"
        className="workspace-control-button workspace-control-button--trash"
        aria-label="Trash"
        title="Drag a block here to delete it"
        onClick={onTrashClick}
      >
        <span ref={trashIconRef} className="workspace-trash-icon">
          <Delete theme="outline" size="36" fill="#333" />
        </span>
      </button>
      {trashPanelOpen && (
        <div className="workspace-trash-panel" onPointerDown={stopWorkspaceGesture}>
          {recentDeletedBlocks.length ? (
            recentDeletedBlocks.map((block) => (
              <button
                key={block.id}
                type="button"
                className="workspace-trash-item"
                draggable
                onDragStart={(event) => onDeletedDragStart(event, block)}
                onClick={() => onRestoreDeleted(block.id)}
              >
                {block.previewSvg ? (
                  <span
                    className="workspace-trash-item-preview"
                    dangerouslySetInnerHTML={{ __html: block.previewSvg }}
                  />
                ) : (
                  block.label
                )}
              </button>
            ))
          ) : (
            <div className="workspace-trash-empty">Nothing deleted</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function BlocksCanvas({
  id,
  onObjectsChange,
  workspaceMaximized,
  onRegisterClear,
  reusableBlockTemplate,
}) {
  const workspaceHostRef = useRef(null)
  const onObjectsChangeRef = useRef(onObjectsChange)
  const trashTargetRef = useRef(null)
  const trashIconRef = useRef(null)
  const draggingBlockIdRef = useRef(null)
  const dragOverTrashRef = useRef(false)
  const lastSelectedBlockIdRef = useRef(null)
  const trashAnimationTimeoutRef = useRef(0)
  const trashDeleteFrameRef = useRef(0)
  const pendingTrashDeleteRef = useRef(null)
  const [categoryId, setCategoryId] = useState('create')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [myBlockDialog, setMyBlockDialog] = useState(null)
  const [trashPanelOpen, setTrashPanelOpen] = useState(false)
  const [recentDeletedBlocks, setRecentDeletedBlocks] = useState([])

  // FIX 1: Only subscribe to the save function.
  // Do NOT extract savedXml here, otherwise your entire canvas re-renders every time a block moves!
  const saveWorkspaceXml = useWorkspaceStore((state) => state.saveWorkspaceXml)
  const addUserBlock = useWorkspaceStore((state) => state.addUserBlock)
  const deleteUserBlock = useWorkspaceStore((state) => state.deleteUserBlock)
  const isFirstLoad = useRef(true)

  useEffect(() => {
    onObjectsChangeRef.current = onObjectsChange
  }, [onObjectsChange])

  const { workspace, syncScene, clearObjects } = useBlocksWorkspace({
    workspaceHostRef,
    onObjectsChangeRef,
    workspaceMaximized,
    runtimeMode: id,
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

  const closeTrashSoon = useCallback(() => {
    window.clearTimeout(trashAnimationTimeoutRef.current)
    trashAnimationTimeoutRef.current = window.setTimeout(() => {
      trashIconRef.current?.classList.remove('is-open')
    }, 180)
  }, [])

  const setTrashOpenVisual = useCallback((open) => {
    trashIconRef.current?.classList.toggle('is-open', open)
  }, [])

  const isBlockOverTrash = useCallback((blockId) => {
    if (!workspace || !blockId) return false
    const block = workspace.getBlockById(blockId)
    const blockRect = block?.getSvgRoot?.()?.getBoundingClientRect?.()
    const trashRect = trashTargetRef.current?.getBoundingClientRect()
    if (!blockRect || !trashRect) return false

    return rectContainsPoint(
      trashRect,
      blockRect.left + blockRect.width / 2,
      blockRect.top + blockRect.height / 2,
      TRASH_HIT_PADDING,
    )
  }, [workspace])

  const deleteBlockById = useCallback((blockId) => {
    if (!workspace || !blockId) return

    const block = workspace.getBlockById(blockId)
    if (!block?.isDeletable?.()) return
    const deletedBlock = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label: getDeletedBlockLabel(block),
      previewSvg: getBlockPreviewSvg(block),
      xmlText: Blockly.Xml.domToText(Blockly.Xml.blockToDomWithXY(block, false)),
    }

    Blockly.Events.setGroup(true)
    try {
      block.checkAndDelete()
      lastSelectedBlockIdRef.current = null
    } finally {
      Blockly.Events.setGroup(false)
    }
    setRecentDeletedBlocks((blocks) => [deletedBlock, ...blocks].slice(0, 8))
    syncScene(workspace)
  }, [workspace, syncScene])

  const scheduleTrashDelete = useCallback((blockId) => {
    if (!blockId || pendingTrashDeleteRef.current === blockId) return

    window.cancelAnimationFrame(trashDeleteFrameRef.current)
    pendingTrashDeleteRef.current = blockId
    setTrashPanelOpen(false)
    setTrashOpenVisual(true)

    trashDeleteFrameRef.current = window.requestAnimationFrame(() => {
      trashDeleteFrameRef.current = window.requestAnimationFrame(() => {
        if (pendingTrashDeleteRef.current !== blockId) return
        pendingTrashDeleteRef.current = null
        draggingBlockIdRef.current = null
        dragOverTrashRef.current = false
        deleteBlockById(blockId)
        closeTrashSoon()
      })
    })
  }, [closeTrashSoon, deleteBlockById, setTrashOpenVisual])

  const handleTrashClick = useCallback(() => {
    if (draggingBlockIdRef.current || pendingTrashDeleteRef.current) return
    setTrashPanelOpen((open) => !open)
  }, [])

  const restoreDeletedBlock = useCallback((deletedBlock, options = {}) => {
    if (!workspace || !deletedBlock) return false

    if (addCompositeBlockToWorkspace(workspace, toWorkspaceXmlText(deletedBlock.xmlText), options)) {
      setRecentDeletedBlocks((blocks) => blocks.filter((block) => block.id !== deletedBlock.id))
      setTrashPanelOpen(false)
      syncScene(workspace)
      return true
    }

    return false
  }, [syncScene, workspace])

  const handleRestoreDeletedBlock = useCallback((deletedBlockId) => {
    const deletedBlock = recentDeletedBlocks.find((block) => block.id === deletedBlockId)
    restoreDeletedBlock(deletedBlock)
  }, [recentDeletedBlocks, restoreDeletedBlock])

  const handleDeletedBlockDragStart = useCallback((event, deletedBlock) => {
    event.dataTransfer.setData(TRASH_BLOCK_XML_TRANSFER_TYPE, deletedBlock.xmlText)
    event.dataTransfer.setData(TRASH_BLOCK_ID_TRANSFER_TYPE, deletedBlock.id)
    event.dataTransfer.effectAllowed = 'move'
  }, [])

  useEffect(() => {
    onRegisterClear?.(handleClearWorkspace)
  }, [onRegisterClear, handleClearWorkspace])

  useEffect(() => () => {
    window.clearTimeout(trashAnimationTimeoutRef.current)
    window.cancelAnimationFrame(trashDeleteFrameRef.current)
  }, [])

  useEffect(() => {
    function handlePointerMove() {
      if (!draggingBlockIdRef.current) return
      const overTrash = isBlockOverTrash(draggingBlockIdRef.current)
      dragOverTrashRef.current = overTrash
      setTrashOpenVisual(overTrash)
    }

    window.addEventListener('pointermove', handlePointerMove, true)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true)
    }
  }, [isBlockOverTrash, setTrashOpenVisual])

  const handleBlockSelect = useCallback(
    (type) => {
      if (!workspace) return
      addBlockToWorkspace(workspace, type)
    },
    [workspace],
  )

  const handleMakeBlock = useCallback(() => {
    if (!workspace) return
    const topBlocks = workspace.getTopBlocks(false)
    const allBlocks = workspace.getAllBlocks(false)

    if (!topBlocks.length) {
      setMyBlockDialog({ type: 'empty' })
      return
    }

    if (topBlocks.length === 1 && allBlocks.length === 1 && BUILT_IN_BLOCK_TYPES.has(topBlocks[0].type)) {
      setMyBlockDialog({ type: 'duplicate' })
      return
    }

    setMyBlockDialog({ type: 'make' })
  }, [workspace])

  const handleConfirmMakeBlock = useCallback((name) => {
    if (!workspace || !name?.trim()) return
    const xmlText = reusableBlockTemplate?.xmlText || Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspace))
    const trimmedName = name.trim()
    const userBlocks = useWorkspaceStore.getState().userBlocks
    const normalizedName = trimmedName.toLocaleLowerCase()

    if (userBlocks.some((block) => block.name.trim().toLocaleLowerCase() === normalizedName)) {
      setMyBlockDialog((dialog) => ({ ...dialog, error: 'Block name already exist.' }))
      return
    }

    const canonicalXml = canonicalizeWorkspaceXml(xmlText)
    if (canonicalXml && userBlocks.some((block) => canonicalizeWorkspaceXml(block.xmlText) === canonicalXml)) {
      setMyBlockDialog({ type: 'duplicate' })
      return
    }

    addUserBlock({
      name: trimmedName,
      xmlText,
      source: reusableBlockTemplate?.source || (id?.startsWith('exercise') ? 'exercise' : 'workspace'),
    })
    setCategoryId('mybox')
    setPaletteOpen(true)
    setMyBlockDialog(null)
  }, [workspace, reusableBlockTemplate, addUserBlock, id])

  const handleUserBlockSelect = useCallback(
    (blockId, options = {}) => {
      if (!workspace) return
      const userBlock = useWorkspaceStore.getState().userBlocks.find((block) => block.id === blockId)
      if (!userBlock) return
      if (addCompositeBlockToWorkspace(workspace, userBlock.xmlText, options)) {
        syncScene(workspace)
      }
    },
    [workspace, syncScene],
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
      const userBlockId = event.dataTransfer?.getData('application/x-geoscratch-my-block-id')
      const trashBlockXml = event.dataTransfer?.getData(TRASH_BLOCK_XML_TRANSFER_TYPE)
      const trashBlockId = event.dataTransfer?.getData(TRASH_BLOCK_ID_TRANSFER_TYPE)

      if (trashBlockXml) {
        const deletedBlock = recentDeletedBlocks.find((block) => block.id === trashBlockId) || {
          id: trashBlockId,
          xmlText: trashBlockXml,
        }
        restoreDeletedBlock(deletedBlock, {
          clientX: event.clientX,
          clientY: event.clientY,
        })
        return
      }

      if (type) {
        addBlockToWorkspace(workspace, type, {
          clientX: event.clientX,
          clientY: event.clientY,
        })
        return
      }

      if (userBlockId) {
        handleUserBlockSelect(userBlockId, {
          clientX: event.clientX,
          clientY: event.clientY,
        })
      }
    },
    [recentDeletedBlocks, restoreDeletedBlock, workspace, handleUserBlockSelect],
  )

  const handleCategorySelect = (nextCategoryId) => {
    setCategoryId(nextCategoryId)
    setPaletteOpen((isOpen) => (nextCategoryId === categoryId ? !isOpen : true))
  }

  // A maximized workspace hides the toolbox entirely, so don't leave the
  // palette "open" behind it -- it would otherwise pop back up already open
  // the moment the workspace is restored.
  useEffect(() => {
    if (workspaceMaximized) setPaletteOpen(false)
  }, [workspaceMaximized])

  // Clicking the workspace background closes the flyout too. Blockly's own
  // gesture handling swallows the raw DOM mousedown before it ever bubbles
  // out to a document-level listener, so we go through Blockly's own click
  // event instead of fighting that.
  useEffect(() => {
    if (!workspace) return

    function handleWorkspaceClick(event) {
      if (event.type === Blockly.Events.CLICK && event.targetType === 'workspace') {
        setPaletteOpen(false)
      }
    }

    workspace.addChangeListener(handleWorkspaceClick)
    return () => workspace.removeChangeListener(handleWorkspaceClick)
  }, [workspace])

  useEffect(() => {
    if (!workspace) return

    function handleSelectedBlock(event) {
      if (event.type === Blockly.Events.BLOCK_DRAG) {
        if (event.isStart) {
          draggingBlockIdRef.current = event.blockId || null
          dragOverTrashRef.current = false
          setTrashPanelOpen((open) => (open ? false : open))
          return
        }

        const blockId = draggingBlockIdRef.current || event.blockId
        draggingBlockIdRef.current = null
        const shouldDelete = dragOverTrashRef.current || isBlockOverTrash(blockId)
        dragOverTrashRef.current = false
        if (blockId && shouldDelete) {
          scheduleTrashDelete(blockId)
        } else {
          setTrashOpenVisual(false)
        }
        return
      }

      if (event.type !== Blockly.Events.SELECTED) return
      const block = event.newElementId ? workspace.getBlockById(event.newElementId) : null
      lastSelectedBlockIdRef.current = block?.isDeletable?.() ? block.id : null
    }

    workspace.addChangeListener(handleSelectedBlock)
    return () => workspace.removeChangeListener(handleSelectedBlock)
  }, [isBlockOverTrash, scheduleTrashDelete, setTrashOpenVisual, workspace])

  return (
    <div id="blocks-canvas" className="blocks-shell">
      <MyBlockDialog
        open={myBlockDialog?.type === 'empty'}
        title="Make a Block"
        description="Add some blocks to the workspace before saving a custom block."
        confirmLabel="OK"
        showNameInput={false}
        onCancel={() => setMyBlockDialog(null)}
        onConfirm={() => setMyBlockDialog(null)}
      />
      <MyBlockDialog
        open={myBlockDialog?.type === 'make'}
        title="Make a Block"
        description={reusableBlockTemplate?.description || 'Save the current workspace as a reusable block in My Blocks.'}
        defaultName={reusableBlockTemplate?.defaultName || 'My geometric block'}
        error={myBlockDialog?.error}
        confirmLabel="Save"
        onCancel={() => setMyBlockDialog(null)}
        onConfirm={handleConfirmMakeBlock}
        onNameChange={() => setMyBlockDialog((dialog) => (dialog ? { ...dialog, error: '' } : dialog))}
      />
      <MyBlockDialog
        open={myBlockDialog?.type === 'duplicate'}
        title="Make a Block"
        description="Blocks already exist."
        confirmLabel="OK"
        showNameInput={false}
        onCancel={() => setMyBlockDialog(null)}
        onConfirm={() => setMyBlockDialog(null)}
      />

      {!workspaceMaximized && (
        <div className="blocks-toolbox-slot">
          <aside className="blocks-col blocks-col--toolbox">
            <CategoryToolbox selected={paletteOpen ? categoryId : null} onSelect={handleCategorySelect} />
          </aside>

          {paletteOpen && (
            <aside className="blocks-col blocks-col--palette blocks-col--palette-flyout">
              <BlockPalette
                categoryId={categoryId}
                onBlockSelect={handleBlockSelect}
                onBlockDragStart={() => setPaletteOpen(true)}
                onMakeBlock={handleMakeBlock}
                onUserBlockSelect={handleUserBlockSelect}
                onUserBlockDelete={deleteUserBlock}
                onUserBlockDragStart={() => setPaletteOpen(true)}
              />
            </aside>
          )}
        </div>
      )}

      <section className="blocks-col blocks-col--workspace">
        <div
          className="workspace-host"
          ref={workspaceHostRef}
          onDragOver={handleWorkspaceDragOver}
          onDrop={handleWorkspaceDrop}
        />
        <WorkspaceControls
          workspace={workspace}
          trashTargetRef={trashTargetRef}
          trashIconRef={trashIconRef}
          trashPanelOpen={trashPanelOpen}
          recentDeletedBlocks={recentDeletedBlocks}
          onTrashClick={handleTrashClick}
          onDeletedDragStart={handleDeletedBlockDragStart}
          onRestoreDeleted={handleRestoreDeletedBlock}
        />
      </section>
    </div>
  )
}
