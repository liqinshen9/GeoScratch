import { useEffect, useRef } from 'react'
import * as Blockly from 'blockly/core'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import setupChangeListener from '@/utils/setupChangeListener'

/**
 * Restores this workspace's saved XML on first mount, then keeps the store in
 * sync as the user edits.
 *
 * Save/restore is keyed by `id` (e.g. 'sandbox', 'exercise-3'), so each page
 * keeps its own independent workspace.
 *
 * @param {object|null} workspace  Blockly workspace, once injected.
 * @param {string} id             Storage key for this workspace.
 * @param {(ws: object) => void} syncScene  Re-runs generation after a restore.
 */
export function useWorkspaceAutosave(workspace, id, syncScene) {
  const isFirstLoad = useRef(true)
  const saveWorkspaceXml = useWorkspaceStore((state) => state.saveWorkspaceXml)

  useEffect(() => {
    // The workspace must be fully injected before it can be written to;
    // loading blocks into a not-yet-rendered workspace throws "Cannot create a
    // rendered block in a headless workspace".
    if (!workspace || !workspace.rendered || !id) return

    if (isFirstLoad.current) {
      // Read through getState() rather than subscribing: this component must not
      // re-render every time a block moves.
      const initialXml = useWorkspaceStore.getState().savedXml[id]

      if (initialXml) {
        try {
          // Events off while loading, so restoring does not immediately trigger
          // the save listener installed below and echo straight back to the store.
          Blockly.Events.disable()
          const dom = Blockly.utils.xml.textToDom(initialXml)
          Blockly.Xml.clearWorkspaceAndLoadFromXml(dom, workspace)
          syncScene(workspace)
        } catch (err) {
          console.error('[GeoScratch] Failed to restore workspace state:', err)
        } finally {
          Blockly.Events.enable()
        }
      }
      isFirstLoad.current = false
    }

    // setupChangeListener handles the parts that are easy to get wrong: holding
    // off while a drag is in progress, ignoring purely visual events, and
    // coalescing a burst of events into one animation frame.
    return setupChangeListener(workspace, (changedWorkspace) => {
      // Re-checked here, not just at event time: the workspace can be disposed
      // between the event firing and this frame running.
      if (!changedWorkspace.rendered) return
      const dom = Blockly.Xml.workspaceToDom(changedWorkspace)
      saveWorkspaceXml(id, Blockly.Xml.domToText(dom))
    })
  }, [workspace, id, saveWorkspaceXml, syncScene])
}

export default useWorkspaceAutosave
