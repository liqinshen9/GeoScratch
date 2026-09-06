import * as Blockly from 'blockly/core'

export const blockMoveChangesGeneratedCode = (event) =>
  event.oldParentId !== event.newParentId ||
  event.oldInputName !== event.newInputName ||
  event.oldNextBlockId !== event.newNextBlockId

export const shouldIgnoreWorkspaceChange = (event) => {
  if (!event || event.type === Blockly.Events.VIEWPORT_CHANGE) return true
  if (event.isUiEvent && event.type !== Blockly.Events.BLOCK_CHANGE) return true
  return event.type === Blockly.Events.BLOCK_MOVE && !blockMoveChangesGeneratedCode(event)
}
