import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator } from 'blockly/javascript'
import { translationMatrix, translationMatrix3x3 } from './homogeneousMatrix.js'
import { appendMatrixPreviewUI } from './matrixPreview.js'
import { useSingleStepDrag } from './pipelineTransformDragStrategy.js'

let REGISTERED = false

export function initTransMatrixBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['trans_matrix'] = {
    init() {
      this.appendDummyInput().appendField(new Blockly.FieldLabelSerializable(''), 'PIPE_STEP')
      this.appendDummyInput().appendField('Translate (x, y, z)')
      this.appendDummyInput()
        .appendField('x')
        .appendField(new Blockly.FieldNumber(0), 'TX')
        .appendField('y')
        .appendField(new Blockly.FieldNumber(0), 'TY')
        .appendField('z')
        .appendField(new Blockly.FieldNumber(0), 'TZ')
      appendMatrixPreviewUI(
        this,
        (b) =>
          translationMatrix3x3(
            Number(b.getFieldValue('TX')) || 0,
            Number(b.getFieldValue('TY')) || 0,
            Number(b.getFieldValue('TZ')) || 0,
          ),
        (b) =>
          translationMatrix(
            Number(b.getFieldValue('TX')) || 0,
            Number(b.getFieldValue('TY')) || 0,
            Number(b.getFieldValue('TZ')) || 0,
          ),
      )
      this.setStyle(BLOCK_STYLES.TRANSFORM_STEPS)
      this.setTooltip('Homogeneous translation by (x,y,z).')
      this.setPreviousStatement(true, 'transformStep')
      this.setNextStatement(true, 'transformStep')
      useSingleStepDrag(this)
    },
  }

  javascriptGenerator.forBlock['trans_matrix'] = function () {
    return ''
  }
}
