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

// A pass-through wrapper: plug any Point/Vector/Line/Sphere/Scalar/compute
// result into it and it behaves exactly as that block did (same output, same
// place in the graph, same rendering), while also publishing the value under
// its own refId so `geo_variable_ref` blocks elsewhere can read the SAME
// value back without re-evaluating anything -- no duplicate object in the 3D
// scene.
//
// Pairing is by the wrapper's naming-registry refId rather than its block id,
// because refId survives addCompositeBlockToWorkspace (which strips ids) and
// because a duplicated wrapper is given a fresh one (see namingRegistry's
// ensureAssigned), so a copy can never hijack the original's references.

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
    // Collapse before the open-spot search measures the block, so placement
    // uses the small collapsed footprint rather than the expanded one.
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
        // Laid out like transform_pipeline (see transformPipeline.js +
        // appendMatrixPreviewUI): a title row, the socket row, then a
        // right-aligned control row, so the body carries on below and around
        // whatever is plugged in rather than hugging it. No spacer row: the
        // pipeline needs one to give its statement carve a floor, but here
        // the button row is already that floor, and a spacer on top of it
        // just leaves dead space under a tall wrapped block.
        //
        // The pipeline gets its enclosure from appendStatementInput, which
        // is unavailable here -- the blocks being wrapped are value blocks.
        // The value-input equivalent is an INLINE input: Blockly draws it as
        // a puzzle hole punched into the body, with the child rendered
        // inside the parent's outline, whereas an external input hangs the
        // child off the right edge entirely. Inline inputs also merge
        // consecutive inputs onto one row, so each row is closed explicitly
        // with appendEndRowInput().
        this.appendEndRowInput('VARIABLE_TITLE')
          .appendField('Variable')
          .appendField(new FieldObjectName(), 'GEOSCRATCH_NAME')
        this.appendValueInput('VALUE').setCheck(VALUE_TYPES)
        this.appendEndRowInput('VARIABLE_VALUE_ROW_END')
        this.appendDummyInput('VARIABLE_ACTIONS')
          .setAlign(Blockly.inputs.Align.RIGHT)
          .appendField(new FieldSpawnReference(), 'GEOSCRATCH_SPAWN_REF')
        this.setInputsInline(true)
        // Pass-through: accepts and reports every type it can wrap, so it can
        // sit exactly where the block it wraps already sat.
        this.setOutput(true, VALUE_TYPES)
        this.setStyle(BLOCK_STYLES.WORKSPACE_VARIABLE)
        this.setTooltip('Wrap a block to reuse its value elsewhere. Press Create to make a reference.')
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
      // Same multi-type output as the wrapper: Blockly accepts a connection
      // when the two check arrays intersect, so one reference block plugs
      // into vector3, obj3D and scalar sockets alike.
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
