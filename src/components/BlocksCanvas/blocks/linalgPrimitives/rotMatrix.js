import * as Blockly from 'blockly/core'
import { javascriptGenerator, Order } from 'blockly/javascript'
import {
  rotationMatrix3x3FromDegrees,
  rotationMatrixFromDegrees,
} from './homogeneousMatrix.js'
import { appendMatrixPreviewUI } from './matrixPreview.js'

let REGISTERED = false

export function initRotMatrixBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['rot_matrix'] = {
    init() {
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
      this.setStyle('math_blocks')
      this.setTooltip('Homogeneous rotation about X, then Y, then Z (degrees).')
      this.setOutput(true, 'rotMat')
      this.setColour(85)
    },
  }

  javascriptGenerator.forBlock['rot_matrix'] = function (block) {
    const rx = Number(block.getFieldValue('RX')) || 0
    const ry = Number(block.getFieldValue('RY')) || 0
    const rz = Number(block.getFieldValue('RZ')) || 0

    const code = `(function(){
      const Rx = new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(${rx}));
      const Ry = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(${ry}));
      const Rz = new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(${rz}));
      const R = new THREE.Matrix4().multiplyMatrices(
        new THREE.Matrix4().multiplyMatrices(Rz, Ry),
        Rx
      );
      return R;
    })()`
    return [code, Order.ATOMIC]
  }
}
