import { useEffect, useRef } from 'react'
import * as Blockly from 'blockly/core'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import useAuthStore from '@/store/useAuthStore'
import setupChangeListener from '@/utils/setupChangeListener'
import { shouldSync, chooseSnapshot, fetchSnapshot, pushSnapshot } from '@/lib/workspaceSync'

const CLOUD_PUSH_DELAY_MS = 3000

/**
 * Restores this workspace's saved XML on first mount, then keeps the store in
 * sync as the user edits.
 *
 * Save/restore is keyed by `id` (e.g. 'sandbox', 'exercise-3'), so each page
 * keeps its own independent workspace.
 *
 * When the backend is configured and the participant is signed in, the same XML
 * is mirrored to `workspace_snapshots` so an accidental tab close can be
 * resumed. The cloud copy wins on restore -- study machines may be shared or
 * have their site data cleared. See docs/architecture/backend.md.
 *
 * @param {object|null} workspace  Blockly workspace, once injected.
 * @param {string} id             Storage key for this workspace.
 * @param {(ws: object) => void} syncScene  Re-runs generation after a restore.
 */
export function useWorkspaceAutosave(workspace, id, syncScene) {
  const isFirstLoad = useRef(true)
  const pushTimer = useRef(null)
  const saveWorkspaceXml = useWorkspaceStore((state) => state.saveWorkspaceXml)
  const authStatus = useAuthStore((state) => state.status)

  useEffect(() => {
    // The workspace must be fully injected before it can be written to;
    // loading blocks into a not-yet-rendered workspace throws "Cannot create a
    // rendered block in a headless workspace".
    if (!workspace || !workspace.rendered || !id) return

    // Hold the first-load restore until auth has settled, so a cloud snapshot
    // (if any) can win. 'offline' / 'error' proceed with local only.
    const authSettled = authStatus === 'ready' || authStatus === 'offline' || authStatus === 'error'

    let cancelled = false

    const loadInitial = async () => {
      const localXml = useWorkspaceStore.getState().savedXml[id]
      let cloud = null
      if (shouldSync(authStatus)) {
        cloud = await fetchSnapshot(id)
        if (cancelled) return
      }
      const xml = chooseSnapshot({ local: localXml, cloud })
      if (xml && workspace.rendered) {
        try {
          // Events off while loading, so restoring does not immediately trigger
          // the save listener installed below and echo straight back.
          Blockly.Events.disable()
          const dom = Blockly.utils.xml.textToDom(xml)
          Blockly.Xml.clearWorkspaceAndLoadFromXml(dom, workspace)
          syncScene(workspace)
        } catch (err) {
          console.error('[GeoScratch] Failed to restore workspace state:', err)
        } finally {
          Blockly.Events.enable()
        }
      }
    }

    if (isFirstLoad.current) {
      if (!authSettled) return // effect re-runs when authStatus changes
      isFirstLoad.current = false
      loadInitial()
    }

    // setupChangeListener handles the parts that are easy to get wrong: holding
    // off while a drag is in progress, ignoring purely visual events, and
    // coalescing a burst of events into one animation frame.
    const teardown = setupChangeListener(workspace, (changedWorkspace) => {
      // Re-checked here, not just at event time: the workspace can be disposed
      // between the event firing and this frame running.
      if (!changedWorkspace.rendered) return
      const dom = Blockly.Xml.workspaceToDom(changedWorkspace)
      const text = Blockly.Xml.domToText(dom)
      saveWorkspaceXml(id, text)

      if (shouldSync(useAuthStore.getState().status)) {
        clearTimeout(pushTimer.current)
        pushTimer.current = setTimeout(() => {
          pushSnapshot({
            profileId: useAuthStore.getState().userId,
            workspaceId: id,
            exerciseNumber: parseExerciseNumber(id),
            xml: text,
          })
        }, CLOUD_PUSH_DELAY_MS)
      }
    })

    return () => {
      cancelled = true
      clearTimeout(pushTimer.current)
      teardown?.()
    }
  }, [workspace, id, saveWorkspaceXml, syncScene, authStatus])
}

/** 'exercise-3' -> 3; anything else -> null. */
function parseExerciseNumber(id) {
  const match = /^exercise-(\d+)$/.exec(id ?? '')
  return match ? Number(match[1]) : null
}

export default useWorkspaceAutosave
