import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator } from 'blockly/javascript'
import {
  rotationMatrix3x3FromDegrees,
  rotationMatrixFromDegrees,
} from './homogeneousMatrix.js'
import { appendMatrixPreviewUI } from './matrixPreview.js'
import { useSingleStepDrag } from './pipelineTransformDragStrategy.js'

let REGISTERED = false

export function initRotMatrixBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['rot_matrix'] = {
    init() {
      this.appendDummyInput().appendField(new Blockly.FieldLabelSerializable(''), 'PIPE_STEP')
      this.appendDummyInput().appendField('Rotation (degrees)')
      this.appendDummyInput().appendField('Around Axis:')
      this.appendDummyInput()
        .appendField('x')
        .appendField(new Blockly.FieldNumber(0, -360, 360, 1), 'RX')
        .appendField('y')
        .appendField(new Blockly.FieldNumber(0, -360, 360, 1), 'RY')
        .appendField('z')
        .appendField(new Blockly.FieldNumber(0, -360, 360, 1), 'RZ')
      appendMatrixPreviewUI(
        this,
        (b) =>
          rotationMatrix3x3FromDegrees(
            Number(b.getFieldValue('RX')) || 0,
            Number(b.getFieldValue('RY')) || 0,
            Number(b.getFieldValue('RZ')) || 0
          ),
        (b) =>
          rotationMatrixFromDegrees(
            Number(b.getFieldValue('RX')) || 0,
            Number(b.getFieldValue('RY')) || 0,
            Number(b.getFieldValue('RZ')) || 0
          )
      )
      this.setStyle(BLOCK_STYLES.TRANSFORM_STEPS)
      this.setTooltip('Homogeneous rotation about X, then Y, then Z (degrees).')
      this.setPreviousStatement(true, 'transformStep')
      this.setNextStatement(true, 'transformStep')
      useSingleStepDrag(this)
    },
  }

  javascriptGenerator.forBlock['rot_matrix'] = function () {
    return ''
  }
}
