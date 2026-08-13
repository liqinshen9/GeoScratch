import * as Blockly from 'blockly/core'
import { shouldIgnoreWorkspaceChange } from '@/utils/blocklyEventFilters'

/**
 * @param {Blockly.WorkspaceSvg} ws
 * @param {(ws: Blockly.WorkspaceSvg) => void} onRun
 */
const setupChangeListener = (ws, onRun) => {
  let raf = 0
  let isDraggingBlock = false

  const listener = (e) => {
    if (e?.type === Blockly.Events.BLOCK_DRAG) {
      isDraggingBlock = !!e.isStart
      if (!isDraggingBlock) {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(() => onRun(ws))
      }
      return
    }

    if (isDraggingBlock) return
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
