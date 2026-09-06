import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { FieldObjectName } from '@/components/BlocksCanvas/blocks/naming/FieldObjectName'
import { FieldSpawnReference } from '@/components/BlocksCanvas/blocks/naming/FieldSpawnReference'
import { FieldVariableRefName } from '@/components/BlocksCanvas/blocks/naming/FieldVariableRefName'
import { getRefId, getDisplayName } from '@/utils/namingRegistry'
import {
  getRefTarget,
  setRefTarget,
  resolveRefTargetBlock,
  referenceDisplayName,
  wrapperCode,
  referenceCode,
  fallbackExpressionFor,
} from '@/utils/variableReference'
import addBlockToWorkspace from '@/utils/addBlockToWorkspace'

// A pass-through wrapper that also republishes its value under its own refId
// for geo_variable_ref blocks. See docs/architecture/blockly-integration.md#the-variable-wrappers-block-layout
// and docs/architecture/naming-registry.md#the-variable-wrapper.

export const VALUE_TYPES = ['vector3', 'obj3D', 'scalar']

let WRAPPER_REGISTERED = false
let REF_REGISTERED = false

export { getRefTarget, setRefTarget, resolveRefTargetBlock, referenceDisplayName }

/**
 * Creates a fresh, already-collapsed reference block pointing at `wrapper`,
 * placed just below/right of it.
 */
export function spawnReferenceFor(wrapper) {
  const workspace = wrapper?.workspace
  const refId = getRefId(wrapper)
  if (!workspace || !refId || workspace.isFlyout || workspace.options.readOnly) return null

  const wrapperXY = wrapper.getRelativeToSurfaceXY()
  return addBlockToWorkspace(workspace, 'geo_variable_ref', {
    // Collapse before the open-spot search measures the block.
    initBlock: (block) => {
      setRefTarget(block, refId, getDisplayName(wrapper))
      block.setCollapsed(true)
    },
    preferredSpot: { x: wrapperXY.x + 40, y: wrapperXY.y + 60 },
  })
}

export function initVariableWrapperBlocks() {
  if (!WRAPPER_REGISTERED) {
    WRAPPER_REGISTERED = true

    Blockly.Blocks.geo_variable = {
      init() {
        // Layout mirrors transform_pipeline; inline input, no spacer row, each
        // row closed with appendEndRowInput().
        // See docs/architecture/blockly-integration.md#the-variable-wrappers-block-layout.
        this.appendEndRowInput('VARIABLE_TITLE')
          .appendField('Variable')
          .appendField(new FieldObjectName(), 'GEOSCRATCH_NAME')
        this.appendValueInput('VALUE').setCheck(VALUE_TYPES)
        this.appendEndRowInput('VARIABLE_VALUE_ROW_END')
        this.appendDummyInput('VARIABLE_ACTIONS')
          .setAlign(Blockly.inputs.Align.RIGHT)
          .appendField(new FieldSpawnReference(), 'GEOSCRATCH_SPAWN_REF')
        this.setInputsInline(true)
        // Pass-through: accepts and reports every wrappable type.
        this.setOutput(true, VALUE_TYPES)
        this.setStyle(BLOCK_STYLES.WORKSPACE_VARIABLE)
        this.setTooltip(
          'Wrap a block to reuse its value elsewhere. Press Create to make a reference.',
        )
        this.setDeletable(true)
        this.setMovable(true)
      },
    }

    javascriptGenerator.forBlock.geo_variable = function (block, generator) {
      const inner = generator.valueToCode(block, 'VALUE', Order.NONE) || 'null'
      const refId = getRefId(block)
      if (!refId) return [inner, Order.NONE]
      return [wrapperCode(refId, inner), Order.FUNCTION_CALL]
    }
  }

  if (REF_REGISTERED) return
  REF_REGISTERED = true

  Blockly.Blocks.geo_variable_ref = {
    init() {
      this.appendDummyInput().appendField(new FieldVariableRefName(), 'GEOSCRATCH_REF_NAME')
      // Multi-type output -- Blockly connects on check-array intersection.
      this.setOutput(true, VALUE_TYPES)
      this.setStyle(BLOCK_STYLES.WORKSPACE_VARIABLE)
      this.setTooltip('A reference to a wrapped block. Reuses its value without drawing it again.')
      this.setDeletable(true)
      this.setMovable(true)
    },
  }

  javascriptGenerator.forBlock.geo_variable_ref = function (block) {
    const target = getRefTarget(block)
    if (!target?.targetRefId) return ['null', Order.ATOMIC]
    return [referenceCode(target.targetRefId, fallbackExpressionFor(block)), Order.FUNCTION_CALL]
  }
}
