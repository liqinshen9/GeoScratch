import * as Blockly from 'blockly/core'

const blockMoveChangesGeneratedCode = (event) => (
  event.oldParentId !== event.newParentId ||
  event.oldInputName !== event.newInputName ||
  event.oldNextBlockId !== event.newNextBlockId
)

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
    if (e.type === Blockly.Events.BLOCK_MOVE && !blockMoveChangesGeneratedCode(e)) return

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
