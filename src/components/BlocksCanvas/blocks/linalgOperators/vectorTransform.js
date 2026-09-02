import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

let REGISTERED = false

export function initVectorTransformBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['vector_transform'] = {
    init() {
      this.appendDummyInput().appendField('Vector Transform')
      this.appendValueInput('TARGET')
        .setCheck('obj3D')
        .appendField('Target Vector:')
      this.appendValueInput('rot').appendField('Rotate:').setCheck('rotMat')
      this.appendValueInput('trans')
        .appendField('Translate:')
        .setCheck('transMat')
      this.appendValueInput('scale').appendField('Scaling:').setCheck('scalar')
      this.setStyle(BLOCK_STYLES.TRANSFORM_STEPS)
      this.setTooltip('Translate / rotate vector in R3')
      this.setDeletable(true)
      this.setMovable(true)
      this.setInputsInline(false)
      this.setOutput(true, 'obj3D')

      this.setOnChange((e) => {
        if (!this.workspace || !e) return
        // A line has no size, so a Scaling matrix is skipped for it at runtime
        // (#77) -- flag it when the target is directly a line.
        const targetIsLine = this.getInputTargetBlock('TARGET')?.type === 'geo_vector'
        this.setWarningText(
          targetIsLine && this.getInputTargetBlock('scale')
            ? 'Scaling has no effect on a line (a line has no size).'
            : null,
          'lineScale',
        )
      })
    },
  }

  javascriptGenerator.forBlock['vector_transform'] = function (
    block,
    generator
  ) {
    const tgt = generator.valueToCode(block, 'TARGET', Order.FUNCTION_CALL) || 'null'
    const rot =
      generator.valueToCode(block, 'rot', Order.FUNCTION_CALL) || 'null'
    const trans =
      generator.valueToCode(block, 'trans', Order.FUNCTION_CALL) || 'null'
    const scale =
      generator.valueToCode(block, 'scale', Order.FUNCTION_CALL) || 'null'

    const code = `(function(){
      const obj = ${tgt};
      if (!obj || !obj.isObject3D) return obj;

      const R = ${rot};
      const T = ${trans};
      const s = ${scale};

      // A vector-equation line bakes its extent into geometry -- rebuild it from
      // the transformed origin/direction rather than spinning the baked group
      // (#77). Scale is omitted: a line has no size, so scaling only shears its
      // direction into a different line.
      if (obj.userData && obj.userData.geoType === 'geo_vector_line'
          && typeof window.__geoScratchRebuildTransformedLine === 'function') {
        const M = new THREE.Matrix4();
        if (R && R.isMatrix4) M.premultiply(R);
        if (T && T.isMatrix4) M.premultiply(T);
        return window.__geoScratchRebuildTransformedLine(obj, M) || obj;
      }

      // Allow obj to be the vector shaft glyph itself or a group containing it
      const arrow = typeof obj.userData?.setVectorLength === 'function' ? obj
                   : (obj.children || []).find(c => typeof c.userData?.setVectorLength === 'function');

      if (R && R.isMatrix4) {
        const q = new THREE.Quaternion().setFromRotationMatrix(R);
        obj.quaternion.premultiply(q);
      }

      if (T && T.isMatrix4) {
        const p = new THREE.Vector3().setFromMatrixPosition(T);
        obj.position.add(p);
      }

      if (typeof s === 'number' && isFinite(s)) {
        if (arrow) {
          const currLen = arrow.userData.vectorLength ?? 1;
          const newLen = Math.max(0, currLen * s);
          arrow.userData.setVectorLength(newLen);
        } else {
          obj.scale.multiplyScalar(s);
        }
      }

      obj.updateMatrixWorld(true);
      return obj;
    })()`
    return [code, Order.FUNCTION_CALL]
  }
}
