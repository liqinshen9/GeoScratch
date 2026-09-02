import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator } from 'blockly/javascript'
import {
  rotationMatrix3x3AroundAxisFromDegrees,
  rotationMatrixAroundAxisFromDegrees,
} from './homogeneousMatrix.js'
import { appendMatrixPreviewUI } from './matrixPreview.js'
import { useSingleStepDrag } from './pipelineTransformDragStrategy.js'
import { getScalarInputValue } from '@/utils/sceneHelpers'

let REGISTERED = false
const AXIS_OPTIONS = [
  ['X', 'X'],
  ['Y', 'Y'],
  ['Z', 'Z'],
]

export function initRotMatrixBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['rot_matrix'] = {
    init() {
      this.appendDummyInput().appendField(new Blockly.FieldLabelSerializable(''), 'PIPE_STEP')
      this.appendDummyInput().appendField('Rotation')
      this.appendDummyInput()
        .appendField('Rotate around')
        .appendField(new Blockly.FieldDropdown(AXIS_OPTIONS), 'AXIS')
        .appendField('axis')
      this.appendValueInput('DEGREES_INPUT').appendField('degrees').setCheck('scalar')
      appendMatrixPreviewUI(
        this,
        (b) =>
          rotationMatrix3x3AroundAxisFromDegrees(
            b.getFieldValue('AXIS') || 'X',
            getScalarInputValue(b, 'DEGREES_INPUT', null, 0)
          ),
        (b) =>
          rotationMatrixAroundAxisFromDegrees(
            b.getFieldValue('AXIS') || 'X',
            getScalarInputValue(b, 'DEGREES_INPUT', null, 0)
          )
      )
      this.setStyle(BLOCK_STYLES.TRANSFORM_STEPS)
      this.setTooltip('Rotate around one selected axis. Stack rotation blocks to control rotation order.')
      this.setPreviousStatement(true, 'transformStep')
      this.setNextStatement(true, 'transformStep')
      useSingleStepDrag(this)
    },
  }

  javascriptGenerator.forBlock['rot_matrix'] = function () {
    return ''
  }
}
