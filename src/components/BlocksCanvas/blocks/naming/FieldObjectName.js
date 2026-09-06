import { Field } from 'blockly/core'
import {
  getDisplayName,
  subscribeToBlockName,
  subscribeToNamingChanges,
} from '@/utils/namingRegistry'

const BADGE_FILL = '#11151c'
const BADGE_BORDER = 'rgba(255, 255, 255, 0.38)'
const BADGE_TEXT = '#f8fafc'

// Shows a block's live name on its face. Read-only (rename via the context
// menu) and NOT serializable -- namingRegistry.js owns the name on block.data.
// See docs/architecture/naming-registry.md.
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

  // Resolved live from the registry every render, so a missed notification
  // (HMR-orphaned subscription, events-disabled restore) can't stale it.
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
