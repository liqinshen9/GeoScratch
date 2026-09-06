import { Field } from 'blockly/core'

// Deliberately NOT the block's own colour: the wrapper's body is near-black,
// so a button tinted anything close to it reads as a flat label rather than a
// control. A light grey carries that contrast without adding another hue to a
// workspace whose colours already mean something.
const BUTTON_COLOUR = '#8d949f'
const BUTTON_HOVER_COLOUR = '#a8aeb8'
const BUTTON_BORDER_COLOUR = '#5b616b'
const BUTTON_TEXT_COLOUR = '#12161c'
const BUTTON_PADDING = 10
const BUTTON_CORNER_RADIUS = 7

// Clickable button field on the variable wrapper: spawns a collapsed
// reference to this wrapper. Modelled on FieldMatrixPreview (matrixPreview.js)
// -- the proven pattern for a non-editing, click-to-act field in this Blockly
// version: EDITABLE false, style borderRect_/textElement_ as a button, and do
// the work in showEditor_.
export class FieldSpawnReference extends Field {
  EDITABLE = false
  SERIALIZABLE = false

  constructor() {
    super('Create', null)
  }

  isSerializable() {
    return false
  }

  applyButtonColour(hovered = this.hovered_) {
    if (this.borderRect_) {
      this.borderRect_.setAttribute('fill', hovered ? BUTTON_HOVER_COLOUR : BUTTON_COLOUR)
      this.borderRect_.setAttribute('stroke', BUTTON_BORDER_COLOUR)
      this.borderRect_.setAttribute('stroke-width', '1')
      // Blockly's default field rect is barely rounded; a pill reads as a
      // control rather than as a highlighted word.
      this.borderRect_.setAttribute('rx', String(BUTTON_CORNER_RADIUS))
      this.borderRect_.setAttribute('ry', String(BUTTON_CORNER_RADIUS))
    }
    if (this.textElement_) {
      this.textElement_.setAttribute('font-size', '11px')
      this.textElement_.setAttribute('font-weight', '700')
      this.textElement_.setAttribute('fill', BUTTON_TEXT_COLOUR)
    }
  }

  initView() {
    super.initView()
    this.applyButtonColour()
    // A non-editable field gets no affordance from Blockly, so the two cues
    // that say "this is clickable" -- a pointer cursor and a hover tint --
    // are wired up by hand.
    if (this.fieldGroup_) {
      this.fieldGroup_.style.cursor = 'pointer'
      this.fieldGroup_.addEventListener('mouseenter', this.onHover_)
      this.fieldGroup_.addEventListener('mouseleave', this.onUnhover_)
    }
  }

  onHover_ = () => {
    this.hovered_ = true
    this.applyButtonColour()
  }

  onUnhover_ = () => {
    this.hovered_ = false
    this.applyButtonColour()
  }

  // Wider than the text, so the pill has the breathing room a button needs.
  updateSize_() {
    super.updateSize_(BUTTON_PADDING)
  }

  // Re-applied here too: the block is recoloured whenever the colour preset
  // changes (useBlocksWorkspace.js's subscribeToPreset effect), which would
  // otherwise wipe the button styling.
  applyColour() {
    super.applyColour()
    this.applyButtonColour()
  }

  showEditor_() {
    const block = this.getSourceBlock()
    const workspace = block?.workspace
    if (!block || !workspace || workspace.isFlyout || workspace.options.readOnly) return
    // Imported lazily: variableWrapper.js imports this field, so a top-level
    // import here would be a cycle.
    import('@/components/BlocksCanvas/blocks/geometricVariables/variableWrapper')
      .then(({ spawnReferenceFor }) => spawnReferenceFor(block))
      .catch((err) => console.error('[GeoScratch] Failed to spawn variable reference:', err))
  }

  dispose() {
    this.fieldGroup_?.removeEventListener('mouseenter', this.onHover_)
    this.fieldGroup_?.removeEventListener('mouseleave', this.onUnhover_)
    super.dispose()
  }
}
