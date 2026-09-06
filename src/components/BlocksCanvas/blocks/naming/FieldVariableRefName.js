import { FieldDropdown } from 'blockly/core'
import { subscribeToNamingChanges, getDisplayName, getRefId } from '@/utils/namingRegistry'
import {
  getRefTarget,
  setRefTarget,
  referenceDisplayName,
  WRAPPER_BLOCK_TYPE,
} from '@/utils/variableReference'

// Always first, so an un-pointed reference has a valid dropdown value to hold.
const UNSET_OPTION = ['(choose a variable)', '']

// Which wrapper a reference points at. A dropdown (not a label) so a
// palette-dragged reference can be pointed somewhere. NOT serializable -- the
// target lives in block.data via setRefTarget.
// See docs/architecture/naming-registry.md#variable-references-variablereferencejs.
export class FieldVariableRefName extends FieldDropdown {
  SERIALIZABLE = false

  constructor() {
    super(function () {
      return this.buildOptions()
    })
  }

  isSerializable() {
    return false
  }

  buildOptions() {
    const block = this.getSourceBlock()
    const workspace = block?.workspace
    const options = [UNSET_OPTION]

    if (workspace) {
      workspace
        .getAllBlocks(false)
        .filter((candidate) => candidate.type === WRAPPER_BLOCK_TYPE)
        .forEach((wrapper) => {
          const refId = getRefId(wrapper)
          if (refId) options.push([getDisplayName(wrapper) || 'Variable', refId])
        })
    }

    // Keep a target that no longer resolves selectable, so a dangling
    // reference still renders (a FieldDropdown rejects a value that isn't
    // among its options) and reads as broken rather than silently retargeting.
    const target = getRefTarget(block)
    if (target?.targetRefId && !options.some(([, refId]) => refId === target.targetRefId)) {
      options.push([`${target.lastKnownName || 'Variable'} (missing)`, target.targetRefId])
    }

    return options
  }

  // Resolved live rather than read back from the dropdown's cached
  // selectedOption_, which goes stale whenever the *wrapper* is renamed,
  // deleted, or created after this field was built (the same reason
  // FieldObjectName resolves its text live).
  getText_() {
    const block = this.getSourceBlock()
    if (!block) return ''
    if (getRefTarget(block)?.targetRefId) return referenceDisplayName(block)
    return UNSET_OPTION[0]
  }

  initView() {
    super.initView()
    this.syncFromBlockData()
    this.synced_ = true
    const block = this.getSourceBlock()
    if (block && !block.isInFlyout) {
      // Global rather than per-block: what this shows is another block's
      // name, and which block that is can change.
      this._unsubscribe = subscribeToNamingChanges(() => this.syncFromBlockData())
    }
  }

  /** Pull the selection from block.data (the source of truth) into the field. */
  syncFromBlockData() {
    const block = this.getSourceBlock()
    if (!block) return
    const targetRefId = getRefTarget(block)?.targetRefId || ''
    this.getOptions(false) // regenerate, so the stored value is a valid option
    if (this.getValue() !== targetRefId) {
      this.setValue(targetRefId)
    }
    this.forceRerender?.()
  }

  /** Writing the selection back out to block.data. */
  doValueUpdate_(newValue) {
    super.doValueUpdate_(newValue)
    const block = this.getSourceBlock()
    if (!block || block.isInFlyout) return
    const current = getRefTarget(block)
    if ((current?.targetRefId || '') === newValue) return
    // Only clear once the field has read block.data at least once, so the
    // empty value every dropdown starts life with can't wipe the target of a
    // block being restored from a saved workspace.
    if (!newValue) {
      if (this.synced_) setRefTarget(block, '', current?.lastKnownName)
      return
    }
    const wrapper = block.workspace
      ?.getAllBlocks(false)
      .find(
        (candidate) => candidate.type === WRAPPER_BLOCK_TYPE && getRefId(candidate) === newValue,
      )
    setRefTarget(block, newValue, wrapper ? getDisplayName(wrapper) : current?.lastKnownName)
  }

  dispose() {
    this._unsubscribe?.()
    this._unsubscribe = null
    super.dispose()
  }
}
