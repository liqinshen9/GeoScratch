import * as Blockly from 'blockly/core'
import { shouldIgnoreWorkspaceChange } from '@/utils/blocklyEventFilters'

/**
 * @param {Blockly.WorkspaceSvg} ws
 * @param {(ws: Blockly.WorkspaceSvg) => void} onRun
 */
const setupChangeListener = (ws, onRun) => {
  let raf = 0

  const listener = (e) => {
    if (shouldIgnoreWorkspaceChange(e)) return

    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => onRun(ws))
  }

  ws.addChangeListener(listener)

  return () => {
    cancelAnimationFrame(raf)
    ws.removeChangeListener(listener)
  }
}

export default setupChangeListener
