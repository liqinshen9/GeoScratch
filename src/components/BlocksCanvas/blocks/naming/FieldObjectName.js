import { Field } from 'blockly/core'
import {
  getDisplayName,
  subscribeToBlockName,
  subscribeToNamingChanges,
} from '@/utils/namingRegistry'

const BADGE_FILL = '#11151c'
const BADGE_BORDER = 'rgba(255, 255, 255, 0.38)'
const BADGE_TEXT = '#f8fafc'

// Shows a block's live name (e.g. "L1"/"Line1", or a custom name) inline on
// its face. Read-only: renaming goes through the "Rename" context-menu item
// (blockReferenceLabels.js) so there is exactly one rename entry point,
// matching the app's existing "Rename reference" convention. Not
// serializable -- the name itself is persisted by namingRegistry.js on
// block.data, not by this field's own value, so there is only ever one
// source of truth for it.
export class FieldObjectName extends Field {
  EDITABLE = false
  SERIALIZABLE = false

  constructor() {
    super('', null)
  }

  isSerializable() {
    return false
  }

  // Styled explicitly rather than left to the theme's default field colours:
  // the badge has to stay legible on both the bright object blocks and the
  // near-black variable wrapper, so it carries its own dark fill plus a light
  // hairline that separates it from a dark block behind it.
  applyBadgeStyle() {
    if (this.borderRect_) {
      this.borderRect_.setAttribute('fill', BADGE_FILL)
      this.borderRect_.setAttribute('stroke', BADGE_BORDER)
      this.borderRect_.setAttribute('stroke-width', '1')
      this.borderRect_.setAttribute('rx', '5')
      this.borderRect_.setAttribute('ry', '5')
    }
    if (this.textElement_) {
      this.textElement_.setAttribute('fill', BADGE_TEXT)
      this.textElement_.setAttribute('font-weight', '700')
    }
  }

  // Re-applied whenever the block is recoloured (the colour-preset
  // subscription in useBlocksWorkspace.js), which would otherwise reset the
  // badge to the theme's own field colours.
  applyColour() {
    super.applyColour()
    this.applyBadgeStyle()
  }

  initView() {
    super.initView()
    this.applyBadgeStyle()
    this.refresh()
    const block = this.getSourceBlock()
    if (block && !block.isInFlyout) {
      const unsubscribeBlock = subscribeToBlockName(block.id, () => this.refresh())
      // Also global: the variable wrapper's name is adopted from whatever is
      // plugged into it, so it changes when a DIFFERENT block's name (or the
      // connection itself) changes.
      const unsubscribeGlobal = subscribeToNamingChanges(() => this.refresh())
      this._unsubscribe = () => {
        unsubscribeBlock()
        unsubscribeGlobal()
      }
    }
  }

  // Resolved live from the registry rather than read back from the field's
  // stored value, so the displayed name is correct on every render even if a
  // change notification was never delivered (a subscription orphaned by an
  // HMR module swap, a block restored with events disabled, ...). The
  // subscription below is then only an optimisation: it prompts a redraw.
  getText() {
    const block = this.getSourceBlock()
    return block ? getDisplayName(block) : ''
  }

  refresh() {
    const block = this.getSourceBlock()
    if (!block) return
    const name = getDisplayName(block)
    this.setValue(name)
    // An unnamed block (a palette preview, which lives in its own throwaway
    // workspace and never gets a naming record) would otherwise render an
    // empty badge that reads as a bug.
    this.setVisible?.(Boolean(name))
    this.forceRerender?.()
  }

  dispose() {
    this._unsubscribe?.()
    this._unsubscribe = null
    super.dispose()
  }
}
