import * as Blockly from 'blockly/core'

/**
 * @param {Blockly.WorkspaceSvg} ws
 * @param {(ws: Blockly.WorkspaceSvg) => void} onRun
 */
const setupChangeListener = (ws, onRun) => {
  let raf = 0

  const listener = (e) => {
    if (!e || e.type === Blockly.Events.VIEWPORT_CHANGE) return
    //Field edits on nested blocks are often isUiEvent; still re-run.
    if (e.isUiEvent && e.type !== Blockly.Events.BLOCK_CHANGE) return

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