import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator } from 'blockly/javascript'
import { translationMatrix, translationMatrix3x3 } from './homogeneousMatrix.js'
import { appendMatrixPreviewUI } from './matrixPreview.js'
import { useSingleStepDrag } from './pipelineTransformDragStrategy.js'
import { getScalarInputValue } from '@/utils/sceneHelpers'

let REGISTERED = false

export function initTransMatrixBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['trans_matrix'] = {
    init() {
      this.appendDummyInput().appendField(new Blockly.FieldLabelSerializable(''), 'PIPE_STEP')
      this.appendDummyInput().appendField('Translate (x, y, z)')
      this.appendValueInput('TX_INPUT').appendField('x').setCheck('scalar')
      this.appendValueInput('TY_INPUT').appendField('y').setCheck('scalar')
      this.appendValueInput('TZ_INPUT').appendField('z').setCheck('scalar')
      appendMatrixPreviewUI(
        this,
        (b) =>
          translationMatrix3x3(
            getScalarInputValue(b, 'TX_INPUT', null, 0),
            getScalarInputValue(b, 'TY_INPUT', null, 0),
            getScalarInputValue(b, 'TZ_INPUT', null, 0)
          ),
        (b) =>
          translationMatrix(
            getScalarInputValue(b, 'TX_INPUT', null, 0),
            getScalarInputValue(b, 'TY_INPUT', null, 0),
            getScalarInputValue(b, 'TZ_INPUT', null, 0)
          )
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
