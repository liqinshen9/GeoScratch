import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator } from 'blockly/javascript'
import { scaleMatrix, scaleMatrix3x3 } from './homogeneousMatrix.js'
import { appendMatrixPreviewUI } from './matrixPreview.js'
import { useSingleStepDrag } from './pipelineTransformDragStrategy.js'
import { getScalarInputValue } from '@/utils/sceneHelpers'

let REGISTERED = false

export function initScaleMatrixBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['scale_matrix'] = {
    init() {
      this.appendDummyInput().appendField(new Blockly.FieldLabelSerializable(''), 'PIPE_STEP')
      this.appendDummyInput().appendField('Scale (sx, sy, sz)')
      this.appendValueInput('SX_INPUT').appendField('sx').setCheck('scalar')
      this.appendValueInput('SY_INPUT').appendField('sy').setCheck('scalar')
      this.appendValueInput('SZ_INPUT').appendField('sz').setCheck('scalar')
      appendMatrixPreviewUI(
        this,
        (b) =>
          scaleMatrix3x3(
            getScalarInputValue(b, 'SX_INPUT', null, 1),
            getScalarInputValue(b, 'SY_INPUT', null, 1),
            getScalarInputValue(b, 'SZ_INPUT', null, 1)
          ),
        (b) =>
          scaleMatrix(
            getScalarInputValue(b, 'SX_INPUT', null, 1),
            getScalarInputValue(b, 'SY_INPUT', null, 1),
            getScalarInputValue(b, 'SZ_INPUT', null, 1)
          )
      )
      this.setStyle(BLOCK_STYLES.TRANSFORM_STEPS)
      this.setTooltip('Homogeneous scaling by (sx, sy, sz).')
      this.setPreviousStatement(true, 'transformStep')
      this.setNextStatement(true, 'transformStep')
      useSingleStepDrag(this)
    },
  }

  javascriptGenerator.forBlock['scale_matrix'] = function () {
    return ''
  }
}
