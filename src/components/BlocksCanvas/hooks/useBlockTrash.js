import { useCallback, useEffect, useRef, useState } from 'react'
import * as Blockly from 'blockly/core'
import addCompositeBlockToWorkspace from '@/utils/addCompositeBlockToWorkspace'
import { toWorkspaceXmlText } from '@/utils/blocklyXml'
import {
  getBlockPreviewSvg,
  getDeletedBlockLabel,
  getPrimaryBlockRect,
  getRectIntersectionArea,
} from '@/utils/blockGeometry'

export const TRASH_BLOCK_XML_TRANSFER_TYPE = 'application/x-geoscratch-trash-block-xml'
export const TRASH_BLOCK_ID_TRANSFER_TYPE = 'application/x-geoscratch-trash-block-id'

const TRASH_DROP_PADDING = 14 // px, drop detection pads the small button's box
const TRASH_CLOSE_DELAY_MS = 180
const MAX_RECENT_DELETED = 8 // an undo affordance, not a history

/**
 * Drag-a-block-to-the-trash deletion + a panel of recently deleted blocks.
 * Own BLOCK_DRAG-only listener, independent of useBlockSelectionSync.
 * See docs/architecture/selection-and-picking.md#trash-useblocktrash.
 *
 * @param {object|null} workspace
 * @param {(ws: object) => void} syncScene
 */
export function useBlockTrash(workspace, syncScene) {
  const trashTargetRef = useRef(null)
  const trashIconRef = useRef(null)
  const draggingBlockIdRef = useRef(null)
  const dragOverTrashRef = useRef(false)
  const trashAnimationTimeoutRef = useRef(0)
  const trashDeleteFrameRef = useRef(0)
  const pendingTrashDeleteRef = useRef(null)
  const [trashPanelOpen, setTrashPanelOpen] = useState(false)
  const [recentDeletedBlocks, setRecentDeletedBlocks] = useState([])

  const closeTrashSoon = useCallback(() => {
    window.clearTimeout(trashAnimationTimeoutRef.current)
    trashAnimationTimeoutRef.current = window.setTimeout(() => {
      trashIconRef.current?.classList.remove('is-open')
    }, TRASH_CLOSE_DELAY_MS)
  }, [])

  // Class toggle, not React state (fires every pointermove).
  // See docs/architecture/selection-and-picking.md#class-toggle-not-state.
  const setTrashOpenVisual = useCallback((open) => {
    trashIconRef.current?.classList.toggle('is-open', open)
  }, [])

  const isDraggedBlockTouchingTrash = useCallback(
    (blockId) => {
      if (!workspace || !blockId) return false
      const buttonRect = trashTargetRef.current?.getBoundingClientRect()
      if (!buttonRect) return false
      const trashRect = {
        left: buttonRect.left - TRASH_DROP_PADDING,
        right: buttonRect.right + TRASH_DROP_PADDING,
        top: buttonRect.top - TRASH_DROP_PADDING,
        bottom: buttonRect.bottom + TRASH_DROP_PADDING,
      }

      const blockRect = getPrimaryBlockRect(workspace.getBlockById(blockId))
      return getRectIntersectionArea(blockRect, trashRect) > 0
    },
    [workspace],
  )

  const deleteBlockById = useCallback(
    (blockId) => {
      if (!workspace || !blockId) return

      const block = workspace.getBlockById(blockId)
      if (!block?.isDeletable?.()) return

      // Snapshot before deleting -- all fields read the live block.
      const deletedBlock = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        label: getDeletedBlockLabel(block),
        previewSvg: getBlockPreviewSvg(block),
        xmlText: Blockly.Xml.domToText(Blockly.Xml.blockToDomWithXY(block, false)),
      }

      // Grouped so undo treats the subtree as one step.
      Blockly.Events.setGroup(true)
      try {
        block.checkAndDelete()
      } finally {
        Blockly.Events.setGroup(false)
      }
      setRecentDeletedBlocks((blocks) => [deletedBlock, ...blocks].slice(0, MAX_RECENT_DELETED))
      syncScene(workspace)
    },
    [workspace, syncScene],
  )

  const scheduleTrashDelete = useCallback(
    (blockId) => {
      if (!blockId || pendingTrashDeleteRef.current === blockId) return

      window.cancelAnimationFrame(trashDeleteFrameRef.current)
      pendingTrashDeleteRef.current = blockId
      setTrashPanelOpen(false)
      setTrashOpenVisual(true)

      // Two frames, not one.
      // See docs/architecture/selection-and-picking.md#two-raf-frames.
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
    },
    [closeTrashSoon, deleteBlockById, setTrashOpenVisual],
  )

  const handleTrashClick = useCallback(() => {
    // Mid-drag or mid-delete the button is a drop target, not a toggle.
    if (draggingBlockIdRef.current || pendingTrashDeleteRef.current) return
    setTrashPanelOpen((open) => !open)
  }, [])

  const restoreDeletedBlock = useCallback(
    (deletedBlock, options = {}) => {
      if (!workspace || !deletedBlock) return false

      if (
        addCompositeBlockToWorkspace(workspace, toWorkspaceXmlText(deletedBlock.xmlText), options)
      ) {
        setRecentDeletedBlocks((blocks) => blocks.filter((block) => block.id !== deletedBlock.id))
        setTrashPanelOpen(false)
        syncScene(workspace)
        return true
      }

      return false
    },
    [syncScene, workspace],
  )

  const handleRestoreDeletedBlock = useCallback(
    (deletedBlockId) => {
      restoreDeletedBlock(recentDeletedBlocks.find((block) => block.id === deletedBlockId))
    },
    [recentDeletedBlocks, restoreDeletedBlock],
  )

  const handleDeletedBlockDragStart = useCallback((event, deletedBlock) => {
    event.dataTransfer.setData(TRASH_BLOCK_XML_TRANSFER_TYPE, deletedBlock.xmlText)
    event.dataTransfer.setData(TRASH_BLOCK_ID_TRANSFER_TYPE, deletedBlock.id)
    // Must match handleWorkspaceDragOver's dropEffect.
    // See docs/architecture/selection-and-picking.md#dropeffect-must-match.
    event.dataTransfer.effectAllowed = 'copy'
  }, [])

  /**
   * Restores a block dropped onto the workspace from the trash panel. Falls back
   * to the XML carried by the drag itself, so a drop still works if the panel
   * entry has since been cleared.
   */
  const restoreDroppedBlock = useCallback(
    (trashBlockXml, trashBlockId, position) => {
      const deletedBlock = recentDeletedBlocks.find((block) => block.id === trashBlockId) || {
        id: trashBlockId,
        xmlText: trashBlockXml,
      }
      return restoreDeletedBlock(deletedBlock, position)
    },
    [recentDeletedBlocks, restoreDeletedBlock],
  )

  useEffect(
    () => () => {
      window.clearTimeout(trashAnimationTimeoutRef.current)
      window.cancelAnimationFrame(trashDeleteFrameRef.current)
    },
    [],
  )

  // Capture-phase pointermove -- Blockly reports no pointer pos during a drag.
  // See docs/architecture/selection-and-picking.md#capture-phase-pointermove.
  useEffect(() => {
    function handlePointerMove() {
      if (!draggingBlockIdRef.current) return
      const overTrash = isDraggedBlockTouchingTrash(draggingBlockIdRef.current)
      dragOverTrashRef.current = overTrash
      setTrashOpenVisual(overTrash)
    }

    window.addEventListener('pointermove', handlePointerMove, true)
    return () => window.removeEventListener('pointermove', handlePointerMove, true)
  }, [isDraggedBlockTouchingTrash, setTrashOpenVisual])

  useEffect(() => {
    if (!workspace) return

    function handleBlockDrag(event) {
      if (event.type !== Blockly.Events.BLOCK_DRAG) return

      if (event.isStart) {
        draggingBlockIdRef.current = event.blockId || null
        dragOverTrashRef.current = false
        setTrashPanelOpen((open) => (open ? false : open))
        setTrashOpenVisual(false)
        return
      }

      const blockId = draggingBlockIdRef.current || event.blockId
      draggingBlockIdRef.current = null
      // Re-test on drop (a flick has no final pointermove).
      // See docs/architecture/selection-and-picking.md#re-test-on-drop.
      const shouldDelete = dragOverTrashRef.current || isDraggedBlockTouchingTrash(blockId)
      dragOverTrashRef.current = false
      if (blockId && shouldDelete) {
        scheduleTrashDelete(blockId)
      } else {
        setTrashOpenVisual(false)
      }
    }

    workspace.addChangeListener(handleBlockDrag)
    return () => workspace.removeChangeListener(handleBlockDrag)
  }, [workspace, isDraggedBlockTouchingTrash, scheduleTrashDelete, setTrashOpenVisual])

  return {
    trashTargetRef,
    trashIconRef,
    trashPanelOpen,
    recentDeletedBlocks,
    handleTrashClick,
    handleRestoreDeletedBlock,
    handleDeletedBlockDragStart,
    restoreDroppedBlock,
  }
}

export default useBlockTrash
