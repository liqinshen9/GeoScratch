import * as Blockly from 'blockly/core'

/**
 * Drops a fixed set of decorative / prefilled blocks into the student's
 * workspace on entry. Any earlier copies (from restored autosave XML) are
 * removed first, by id, so a layout change here reaches workspaces that already
 * hold a stale copy instead of silently keeping the old positions.
 *
 * The removal runs with Blockly events disabled: these blocks are scene
 * furniture, not student edits, so disposing them must not arm the post-delete
 * selection suppression in useBlockSelectionSync (#102) or churn the autosave.
 * The reseed runs with events on so the change listener rebuilds the scene.
 *
 * @param {object} workspace   Blockly workspace (must be rendered).
 * @param {string[]} blockIds  The top-level block ids used in `xml`.
 * @param {string} xml         Blockly XML string for the blocks.
 */
export function seedBackgroundBlocks(workspace, blockIds, xml) {
  try {
    const stale = blockIds.map((id) => workspace.getBlockById(id)).filter(Boolean)
    if (stale.length) {
      Blockly.Events.disable()
      try {
        stale.forEach((block) => block.dispose())
      } finally {
        Blockly.Events.enable()
      }
    }
    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), workspace)
  } catch (err) {
    console.error('[GeoScratch] Failed to seed exercise background blocks:', err)
  }
}

export default seedBackgroundBlocks
