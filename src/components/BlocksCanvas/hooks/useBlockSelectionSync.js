import { useEffect, useRef } from 'react'
import * as Blockly from 'blockly/core'
import useWorkspaceStore from '@/store/useWorkspaceStore'

// Backstop for keyboard-only flows; the usual exit is the next pointer gesture.
const SELECTION_AFTER_DELETE_GRACE_MS = 400

/**
 * Two-way sync of the store's selectedBlockId and the Blockly selection
 * outline. Selection is a persistent highlight, not DOM focus.
 * See docs/architecture/selection-and-picking.md.
 *
 * @param {object|null} workspace
 * @param {string|null} selectedBlockId
 * @param {(id: string|null) => void} setSelectedBlockId
 * @param {() => void} [onBackgroundClick]  Also fired on an empty-workspace click.
 */
export function useBlockSelectionSync(
  workspace,
  selectedBlockId,
  setSelectedBlockId,
  onBackgroundClick,
) {
  // Suppresses post-delete focus-manager fallout (#102).
  // See docs/architecture/selection-and-picking.md#post-delete-focus-fallout.
  const selectionAfterDeleteRef = useRef(false)
  const selectionAfterDeleteTimerRef = useRef(0)

  // Background click goes through Blockly's own CLICK event, not a DOM listener.
  // See docs/architecture/selection-and-picking.md#background-click-via-blockly-event.
  useEffect(() => {
    if (!workspace) return

    function handleWorkspaceClick(event) {
      if (event.type === Blockly.Events.CLICK && event.targetType === 'workspace') {
        // The trustworthy deselect gesture (SELECTED(null) also fires on blur).
        setSelectedBlockId(null)
        onBackgroundClick?.()
      }
    }

    workspace.addChangeListener(handleWorkspaceClick)
    return () => workspace.removeChangeListener(handleWorkspaceClick)
  }, [setSelectedBlockId, onBackgroundClick, workspace])

  // Workspace -> store.
  useEffect(() => {
    if (!workspace) return

    function handleSelectedBlock(event) {
      if (event.type === Blockly.Events.CLICK) {
        // A pointer gesture lifts post-delete suppression.
        selectionAfterDeleteRef.current = false
      }

      if (event.type === Blockly.Events.BLOCK_DELETE) {
        const deletedIds = event.ids || (event.blockId ? [event.blockId] : [])
        if (deletedIds.includes(useWorkspaceStore.getState().selectedBlockId)) {
          setSelectedBlockId(null)
        }
        // Ignore SELECTED until the next pointer gesture (#102).
        // See docs/architecture/selection-and-picking.md#post-delete-focus-fallout.
        selectionAfterDeleteRef.current = true
        window.clearTimeout(selectionAfterDeleteTimerRef.current)
        selectionAfterDeleteTimerRef.current = window.setTimeout(() => {
          selectionAfterDeleteRef.current = false
        }, SELECTION_AFTER_DELETE_GRACE_MS)
        return
      }

      if (event.type !== Blockly.Events.SELECTED) return

      if (selectionAfterDeleteRef.current) {
        // Focus-manager fallout, not a user selection -- drop it, undo the outline.
        if (event.newElementId) {
          workspace.getBlockById(event.newElementId)?.removeSelect?.()
        }
        return
      }

      if (event.newElementId) {
        // A real selection; the store's identity check drops the store-driven echo.
        setSelectedBlockId(event.newElementId)
        return
      }

      // SELECTED(null) also fires on mere focus loss -- keep the selection and
      // re-apply the outline. See
      // docs/architecture/selection-and-picking.md#selected-null-also-fires-on-blur.
      const current = useWorkspaceStore.getState().selectedBlockId
      if (current) workspace.getBlockById(current)?.addSelect?.()
    }

    workspace.addChangeListener(handleSelectedBlock)
    return () => {
      workspace.removeChangeListener(handleSelectedBlock)
      window.clearTimeout(selectionAfterDeleteTimerRef.current)
    }
  }, [setSelectedBlockId, workspace])

  // Store -> workspace: manage the outline directly, not via setSelected().
  // See docs/architecture/selection-and-picking.md#manage-outline-directly.
  const appliedBlockIdRef = useRef(null)
  useEffect(() => {
    if (!workspace) return
    if (appliedBlockIdRef.current === selectedBlockId) return

    const prev = appliedBlockIdRef.current
      ? workspace.getBlockById(appliedBlockIdRef.current)
      : null
    prev?.removeSelect?.()

    const next = selectedBlockId ? workspace.getBlockById(selectedBlockId) : null
    appliedBlockIdRef.current = next ? selectedBlockId : null
    // Skip select() when Blockly already has it selected (native click).
    if (next && Blockly.common.getSelected() !== next) next.select()
  }, [workspace, selectedBlockId])
}

export default useBlockSelectionSync
