import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator } from 'blockly/javascript'
import { scaleMatrix, scaleMatrix3x3 } from './homogeneousMatrix.js'
import { appendMatrixPreviewUI } from './matrixPreview.js'
import { useSingleStepDrag } from './pipelineTransformDragStrategy.js'

let REGISTERED = false

export function initScaleMatrixBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['scale_matrix'] = {
    init() {
      this.appendDummyInput().appendField(new Blockly.FieldLabelSerializable(''), 'PIPE_STEP')
      this.appendDummyInput().appendField('Scale (sx, sy, sz)')
      this.appendDummyInput()
        .appendField('sx')
        .appendField(new Blockly.FieldNumber(1, -Infinity, Infinity, 0.1), 'SX')
        .appendField('sy')
        .appendField(new Blockly.FieldNumber(1, -Infinity, Infinity, 0.1), 'SY')
        .appendField('sz')
        .appendField(new Blockly.FieldNumber(1, -Infinity, Infinity, 0.1), 'SZ')
      appendMatrixPreviewUI(
        this,
        (b) =>
          scaleMatrix3x3(
            Number(b.getFieldValue('SX')),
            Number(b.getFieldValue('SY')),
            Number(b.getFieldValue('SZ')),
          ),
        (b) =>
          scaleMatrix(
            Number(b.getFieldValue('SX')),
            Number(b.getFieldValue('SY')),
            Number(b.getFieldValue('SZ')),
          ),
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
