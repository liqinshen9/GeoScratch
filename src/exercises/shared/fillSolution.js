import * as Blockly from 'blockly/core'

/**
 * Replaces the workspace contents with an exercise's worked solution. Dev tools
 * only: ExercisePage shows the control in a dev build or for the test cohort
 * (study/session/devTools.js), never to a participant.
 *
 * Clearing runs with Blockly events disabled, the same reasoning as
 * seedBackgroundBlocks: throwing the student's blocks away is not a student
 * edit, and disposing with events live would arm the post-delete selection
 * suppression in useBlockSelectionSync (#102) and churn the autosave. The load
 * runs with events on so the change listener rebuilds the scene.
 *
 * @param {object} workspace  Blockly workspace (must be rendered).
 * @param {string} xml        Blockly XML string for the solved workspace.
 * @param {Function} [seed]   The exercise's seedWorkspace, re-run after the
 *   solution loads: an exercise whose scene furniture is seeded rather than
 *   authored would otherwise lose it, since clearing takes every top block.
 *   After, not before, so a solution can carry a given the student builds on
 *   (by its fixed id) and seeding adds only what is still missing.
 * @returns {boolean}         Whether the fill succeeded.
 */
export function fillSolution(workspace, xml, seed) {
  if (!workspace?.rendered || !xml) return false
  try {
    const existing = workspace.getTopBlocks(false)
    if (existing.length) {
      Blockly.Events.disable()
      try {
        existing.forEach((block) => block.dispose(false))
      } finally {
        Blockly.Events.enable()
      }
    }
    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), workspace)
    if (typeof seed === 'function') seed(workspace)
    return true
  } catch (err) {
    console.error('[GeoScratch] Failed to fill the exercise solution:', err)
    return false
  }
}

/**
 * The four transform exercises differ only in their pipeline steps, so they
 * share one solution shape: a teapot at the origin at size 1, fed into a
 * transform pipeline carrying `steps`.
 *
 * @param {string} steps  Blockly XML for the statement chain inside STEPS.
 * @returns {string}      A complete workspace XML string.
 */
export function teapotPipelineSolution(steps) {
  return `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="transform_pipeline" x="60" y="60">
    <value name="INPUT">
      <block type="geo_teapot">
        <value name="SIZE_INPUT">
          <block type="scalar"><field name="scalar">1</field></block>
        </value>
      </block>
    </value>
    <statement name="STEPS">${steps}</statement>
  </block>
</xml>`
}

export default fillSolution
