import { useEffect, useRef } from 'react'
import * as Blockly from 'blockly/core'
import useWorkspaceStore from '@/store/useWorkspaceStore'

// How long to ignore SELECTED events after a delete before assuming the
// focus-manager fallout has settled. Only a backstop for keyboard-only flows --
// the usual exit is the next pointer gesture.
const SELECTION_AFTER_DELETE_GRACE_MS = 400

/**
 * Keeps the store's selectedBlockId and the Blockly workspace's selection
 * outline in agreement, in both directions. The 3D scene reads the same store
 * value (see Scene3D's ScenePicker), so clicking an object highlights its block
 * and vice versa.
 *
 * Selection here is a persistent highlight, NOT DOM focus. Most of the
 * subtlety below comes from Blockly's own selection being focus-backed.
 *
 * @param {object|null} workspace
 * @param {string|null} selectedBlockId  Current store value.
 * @param {(id: string|null) => void} setSelectedBlockId
 * @param {() => void} [onBackgroundClick]  Also fired on a click on empty
 *   workspace, for callers that dismiss their own UI on the same gesture.
 */
export function useBlockSelectionSync(
  workspace,
  selectedBlockId,
  setSelectedBlockId,
  onBackgroundClick,
) {
  // Set for a short window after a BLOCK_DELETE so the SELECTED events Blockly's
  // FocusManager fires for a neighbour block (focusout fallout) are not mirrored
  // into our persistent selection (#102).
  const selectionAfterDeleteRef = useRef(false)
  const selectionAfterDeleteTimerRef = useRef(0)

  // Clicking the workspace background closes the flyout too. Blockly's own
  // gesture handling swallows the raw DOM mousedown before it ever bubbles
  // out to a document-level listener, so we go through Blockly's own click
  // event instead of fighting that.
  useEffect(() => {
    if (!workspace) return

    function handleWorkspaceClick(event) {
      if (event.type === Blockly.Events.CLICK && event.targetType === 'workspace') {
        // Clicking empty workspace is the deliberate "deselect" gesture (the
        // raw SELECTED(null) event can't be trusted -- it also fires on mere
        // focus loss, see handleSelectedBlock).
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
        // A pointer gesture -- the SELECTED it may be followed by is a genuine
        // user selection, so lift any post-delete suppression (see below).
        selectionAfterDeleteRef.current = false
      }

      if (event.type === Blockly.Events.BLOCK_DELETE) {
        const deletedIds = event.ids || (event.blockId ? [event.blockId] : [])
        if (deletedIds.includes(useWorkspaceStore.getState().selectedBlockId)) {
          setSelectedBlockId(null)
        }
        // Removing the selected block's element from the DOM makes Blockly's
        // FocusManager (which tracks native focusout) transiently select then
        // deselect a neighbour block a beat later, outside this event's group.
        // Blockly itself ends with nothing selected; without this guard our
        // SELECTED handler mirrors that neighbour into the store and the
        // trailing SELECTED(null) re-applies its outline, leaving it stuck
        // selected + 3D-highlighted (#102). Ignore SELECTED until the next
        // pointer gesture, with a timeout backstop for keyboard-only flows.
        selectionAfterDeleteRef.current = true
        window.clearTimeout(selectionAfterDeleteTimerRef.current)
        selectionAfterDeleteTimerRef.current = window.setTimeout(() => {
          selectionAfterDeleteRef.current = false
        }, SELECTION_AFTER_DELETE_GRACE_MS)
        return
      }

      if (event.type !== Blockly.Events.SELECTED) return

      if (selectionAfterDeleteRef.current) {
        // Focus-manager fallout from a delete, not a user selection -- drop it
        // and undo any outline Blockly's blur re-added to the neighbour.
        if (event.newElementId) {
          workspace.getBlockById(event.newElementId)?.removeSelect?.()
        }
        return
      }

      if (event.newElementId) {
        // A real selection (native click / keyboard nav). The store's identity
        // check drops the echo when this SELECTED event was itself triggered by
        // the store -> workspace effect below.
        setSelectedBlockId(event.newElementId)
        return
      }

      // SELECTED(null) is fired on a deliberate deselect BUT ALSO every time the
      // selected block merely loses DOM focus -- e.g. the user clicks into the
      // 3D view to rotate the camera. Our selection is a persistent highlight,
      // not focus-bound, so keep it and re-apply the outline Blockly's blur just
      // removed. Deliberate deselect runs through handleWorkspaceClick / the
      // 3D-scene empty click / BLOCK_DELETE instead.
      const current = useWorkspaceStore.getState().selectedBlockId
      if (current) workspace.getBlockById(current)?.addSelect?.()
    }

    workspace.addChangeListener(handleSelectedBlock)
    return () => {
      workspace.removeChangeListener(handleSelectedBlock)
      window.clearTimeout(selectionAfterDeleteTimerRef.current)
    }
  }, [setSelectedBlockId, workspace])

  // Store -> workspace: a 3D-scene click (or any other setter) drives the
  // block's selection outline. We manage the outline directly rather than via
  // Blockly.common.setSelected(): block.select() alone doesn't clear a
  // previously selected block or update common.getSelected() (that is
  // focus-manager backed), and setSelected(null) throws. Tracking the block we
  // last applied to lets us clear the old one and add the new one, without
  // pulling keyboard focus out of the 3D canvas.
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
    // select() also fires SELECTED -> handleSelectedBlock -> setSelectedBlockId
    // with the same id, which the store's identity check drops. Skip it when
    // Blockly already has this block selected (a native workspace click).
    if (next && Blockly.common.getSelected() !== next) next.select()
  }, [workspace, selectedBlockId])
}

export default useBlockSelectionSync
