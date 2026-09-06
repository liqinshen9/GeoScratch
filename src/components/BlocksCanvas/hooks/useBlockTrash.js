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

// The trash button is small, so drop detection uses a padded version of its box.
const TRASH_DROP_PADDING = 14
// How long the lid stays open after a drop, so the animation reads.
const TRASH_CLOSE_DELAY_MS = 180
// Deleted blocks kept for restore. Deliberately short: this is an undo
// affordance, not a history.
const MAX_RECENT_DELETED = 8

/**
 * Drag-a-block-to-the-trash deletion, plus the panel of recently deleted blocks
 * they can be dragged back out of.
 *
 * Installs its own workspace change listener for BLOCK_DRAG only, so it stays
 * independent of the selection listener in useBlockSelectionSync.
 *
 * @param {object|null} workspace
 * @param {(ws: object) => void} syncScene  Re-runs generation after a delete/restore.
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

  // Toggled as a class rather than React state on purpose: this fires on every
  // pointermove during a drag, and re-rendering the whole canvas at that rate
  // would stutter the drag.
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

      // Snapshot before deleting -- the label, preview and XML all read from the
      // live block, which is gone a moment later.
      const deletedBlock = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        label: getDeletedBlockLabel(block),
        previewSvg: getBlockPreviewSvg(block),
        xmlText: Blockly.Xml.domToText(Blockly.Xml.blockToDomWithXY(block, false)),
      }

      // Grouped so Blockly's own undo treats the whole subtree as one step.
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

      // Two frames, not one: the first lets Blockly finish settling the block it
      // just dropped, the second lets the open-lid class actually paint before
      // the block disappears.
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
    // must match the 'copy' dropEffect set in handleWorkspaceDragOver, or the drop is rejected
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

  // Blockly reports no pointer position during a block drag, so hit-testing has
  // to ride a raw capture-phase pointermove instead.
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
      // Re-test on drop as well as trusting the tracked flag: a drag that ends
      // without a final pointermove (a flick, or a programmatic end) would
      // otherwise miss.
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
