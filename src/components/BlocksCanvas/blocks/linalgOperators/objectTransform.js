import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { blockMoveChangesGeneratedCode } from '@/utils/blocklyEventFilters'

let REGISTERED = false

export function initObjectTransformBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['object_transform'] = {
    init() {
      this.appendDummyInput().appendField('Object Transform')
      this.appendValueInput('TARGET').setCheck('obj3D').appendField('Target Object:')

      this.appendValueInput('rot').appendField('Rotate:').setCheck('rotMat')
      this.appendValueInput('trans').appendField('Translate:').setCheck('transMat')
      this.appendValueInput('scale').appendField('Scaling:').setCheck('scaleMat')

      this.setStyle(BLOCK_STYLES.TRANSFORM_STEPS)
      this.setTooltip('Apply matrices to the object in recorded order')
      this.setDeletable(true)
      this.setMovable(true)
      this.setInputsInline(false)
      this.setOutput(true, 'obj3D')

      // Chronological order of connected sockets
      this.transformOrder = this.transformOrder || []
      this._wasConnected = {
        rot: !!this.getInputTargetBlock('rot'),
        trans: !!this.getInputTargetBlock('trans'),
        scale: !!this.getInputTargetBlock('scale'),
      }

      const removeLast = (arr, name) => {
        for (let i = arr.length - 1; i >= 0; --i) {
          if (arr[i] === name) {
            arr.splice(i, 1)
            break
          }
        }
      }

      // Append on connect, remove on disconnect
      this.setOnChange((e) => {
        if (!e) return
        const t = e.type
        if (t === Blockly.Events.BLOCK_MOVE && !blockMoveChangesGeneratedCode(e)) return
        const watch =
          t === Blockly.Events.BLOCK_MOVE ||
          t === Blockly.Events.BLOCK_CREATE ||
          t === Blockly.Events.BLOCK_DELETE
        if (!watch) return

        ;['rot', 'trans', 'scale'].forEach((name) => {
          const isNow = !!this.getInputTargetBlock(name)
          const was = !!this._wasConnected[name]
          if (!was && isNow) this.transformOrder.push(name)
          else if (was && !isNow) removeLast(this.transformOrder, name)
          this._wasConnected[name] = isNow
        })

        // A line has no size, so a Scaling matrix only shears its direction into
        // a different line -- confusing as a size control, so it's skipped at
        // runtime (#77). Flag it when the target is directly a line.
        const targetIsLine = this.getInputTargetBlock('TARGET')?.type === 'geo_vector'
        this.setWarningText(
          targetIsLine && this.getInputTargetBlock('scale')
            ? 'Scaling has no effect on a line (a line has no size).'
            : null,
          'lineScale',
        )
      })
    },

    // persist order
    mutationToDom() {
      const m = document.createElement('mutation')
      m.setAttribute('order', (this.transformOrder || []).join(','))
      return m
    },
    domToMutation(xml) {
      const s = xml.getAttribute('order') || ''
      this.transformOrder = s ? s.split(',') : []
    },
  }

  // Generator: apply world-space matrices in recorded order
  javascriptGenerator.forBlock['object_transform'] = function (block, generator) {
    const tgt = generator.valueToCode(block, 'TARGET', Order.FUNCTION_CALL) || 'null'
    const rot = generator.valueToCode(block, 'rot', Order.FUNCTION_CALL) || 'null'
    const trans = generator.valueToCode(block, 'trans', Order.FUNCTION_CALL) || 'null'
    const scale = generator.valueToCode(block, 'scale', Order.FUNCTION_CALL) || 'null'

    let order = (block.transformOrder || [])
      .filter((n) => n === 'rot' || n === 'trans' || n === 'scale')
      .filter((n) => !!block.getInputTargetBlock(n))
    if (!order.length) {
      order = ['rot', 'trans', 'scale'].filter((n) => !!block.getInputTargetBlock(n))
    }

    const expr = { rot, trans, scale }
    const steps = order
      .map((n) => `obj = ${n === 'scale' ? '__applyScale' : '__applyWorld'}(obj, ${expr[n]});`)
      .join('\n      ')

    const code = `(function(){
      let obj = ${tgt};
      if (!obj || !obj.isObject3D) return obj;

      // Apply world-space Matrix4 M:
      // M_world' = M * M_world  ⇒  M_local' = P^{-1} * M * P * M_local
      function __applyWorld(target, M) {
        if (!(M && M.isMatrix4)) return target;
        // A vector-equation line bakes its extent into geometry -- rebuild it
        // from the transformed origin/direction instead of spinning it (#77).
        if (target.userData && target.userData.geoType === 'geo_vector_line'
            && typeof window.__geoScratchRebuildTransformedLine === 'function') {
          return window.__geoScratchRebuildTransformedLine(target, M);
        }
        const P = target.parent ? target.parent.matrixWorld : new THREE.Matrix4();
        const Pinv = P.clone().invert();
        const M_local = Pinv.multiply(M).multiply(P.clone());
        target.applyMatrix4(M_local);
        return target;
      }

      // A line has no size -- scaling only shears its direction (#77). Skip it.
      function __applyScale(target, M) {
        if (target.userData && target.userData.geoType === 'geo_vector_line') return target;
        return __applyWorld(target, M);
      }

      ${steps}

      obj.updateMatrixWorld(true);
      return obj;
    })()`

    return [code, Order.FUNCTION_CALL]
  }
}
