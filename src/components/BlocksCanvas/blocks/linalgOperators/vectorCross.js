import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { FieldObjectName } from '@/components/BlocksCanvas/blocks/naming/FieldObjectName'
import { getDisplayName } from '@/utils/namingRegistry'
import { vector3FromBlock, vectorLabelFromBlock } from '@/utils/sceneHelpers'
import { appendVectorPreviewUI } from '@/components/BlocksCanvas/blocks/linalgPrimitives/matrixPreview'
import { columnVec } from './vectorArithmetic'

// The drawer behind the block's "show" button, as vector_arithmetic has: the
// only place its result's value is shown.
function renderCrossProductHtml(block) {
  const p = vector3FromBlock(block.getInputTargetBlock('U'))
  const q = vector3FromBlock(block.getInputTargetBlock('V'))
  const n = p && q ? p.clone().cross(q) : null
  const name = (input) => vectorLabelFromBlock(block.getInputTargetBlock(input)) || ''
  return `
    <div class="vec-drawer-expr">
      ${columnVec(name('U'), p)}
      <span class="vec-drawer-op">\u00d7</span>
      ${columnVec(name('V'), q)}
      <span class="vec-drawer-op">=</span>
      ${columnVec(getDisplayName(block) || '', n)}
    </div>
  `
}

let REGISTERED = false

export function initCrossProductBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['vector_cross_product'] = {
    init() {
      this.appendDummyInput()
        .appendField('Cross Product')
        .appendField(new FieldObjectName(), 'GEOSCRATCH_NAME')
      this.appendValueInput('U').setCheck(['vector3', 'obj3D'])
      this.appendValueInput('V').setCheck(['vector3', 'obj3D']).appendField('\u00d7')
      this.setInputsInline(true)

      this.setOutput(true, 'vector3')
      this.setStyle(BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS)
      this.setTooltip('The cross product of two vectors: a vector perpendicular to both.')
      this.setDeletable(true)
      this.setMovable(true)
      appendVectorPreviewUI(this, renderCrossProductHtml)
    },
  }

  javascriptGenerator.forBlock['vector_cross_product'] = function (block, g) {
    const u = g.valueToCode(block, 'U', Order.FUNCTION_CALL) || 'null'
    const v = g.valueToCode(block, 'V', Order.FUNCTION_CALL) || 'null'
    // Operand names baked in at code-gen time, like vector_arithmetic: a nested
    // vector does not carry its own name at runtime.
    const uFallback = JSON.stringify(vectorLabelFromBlock(block.getInputTargetBlock('U')) || 'p')
    const vFallback = JSON.stringify(vectorLabelFromBlock(block.getInputTargetBlock('V')) || 'q')

    const code = `(function(){
    const vectorInfoFromInput = (input, fallbackLabel) => {
      if (input?.isVector3) {
        return {
          vector: input.clone(),
          label: vectorNotation.getLabel(input, fallbackLabel),
        };
      }
      if (input?.isObject3D && input.userData?.geoType === 'geo_vector_line' && input.userData.direction?.isVector3) {
        const direction = input.userData.direction.clone();
        const label = vectorNotation.getLabel(input.userData.direction, fallbackLabel);
        direction.userData = {
          geoType: 'named_vector_expression',
          label,
        };
        return {
          vector: direction,
          label,
          sourceType: 'line',
          anchor: input.userData.origin?.isVector3 ? input.userData.origin.clone() : new THREE.Vector3(),
        };
      }
      return null;
    };

    const uInfo = vectorInfoFromInput(${u}, ${uFallback});
    const vInfo = vectorInfoFromInput(${v}, ${vFallback});
    const uVal = uInfo?.vector;
    const vVal = vInfo?.vector;

    if (!uVal || !vVal || !uVal.isVector3 || !vVal.isVector3) return null;

    const cross = new THREE.Vector3().crossVectors(uVal, vVal);
    const lenU = uVal.length(), lenV = vVal.length(), lenC = cross.length();
    const safeLen = (x) => (isFinite(x) && x > 0 ? x : 1);
    const fmt = vectorNotation.formatVector;
    const uLabel = uInfo?.label || vectorNotation.getLabel(uVal, ${uFallback});
    const vLabel = vInfo?.label || vectorNotation.getLabel(vVal, ${vFallback});
    const showOperandLabels = vectorNotation.shouldShowOperandLabels(uVal, vVal);
    const crossExpression = uLabel + ' \u00d7 ' + vLabel;
    const crossName = window.geoNaming?.nameFor?.(${JSON.stringify(block.id)});
    const crossLabel = crossName ? crossName + ' = ' + crossExpression : crossExpression;
    const baseId = ${JSON.stringify(block.id)};

    const operandAColor = window.GeoScratchColors.forRole('operandA');
    const operandBColor = window.GeoScratchColors.forRole('operandB');
    const crossVectorColor = window.GeoScratchColors.forInstance('vector', baseId);
    const warningColor = window.GeoScratchColors.forRole('warning');

    const arrowU = window.buildVectorShaftGlyph(
      THREE, baseId + '_u', new THREE.Vector3(0,0,0),
      (lenU>0?uVal.clone().normalize():new THREE.Vector3(1,0,0)), safeLen(lenU), operandAColor
    );
    const arrowV = window.buildVectorShaftGlyph(
      THREE, baseId + '_v', new THREE.Vector3(0,0,0),
      (lenV>0?vVal.clone().normalize():new THREE.Vector3(1,0,0)), safeLen(lenV), operandBColor
    );

    let crossObj;
    if (lenC>1e-8) {
      crossObj = window.buildVectorShaftGlyph(
        THREE, baseId + '_c', new THREE.Vector3(0,0,0), cross.clone().normalize(), safeLen(lenC), crossVectorColor
      );
    } else {
      crossObj = window.geoPointMarker({ color: warningColor, radius: 0.04 });
    }

    const tag=(o)=>{o.userData.geoType='geo_vector';o.userData.srcBlockId=baseId;return o;};
    tag(arrowU); tag(arrowV); tag(crossObj);

    const group=new THREE.Group();
    group.add(arrowU,arrowV,crossObj);
    group.userData.geoType='geo_vector_group';
    group.userData.srcBlockId=${JSON.stringify(block.id)};

    // Labels at tips
    group.userData.labelAnchors = {
      uTip:{type:'world', position:[uVal.x,uVal.y,uVal.z]},
      vTip:{type:'world', position:[vVal.x,vVal.y,vVal.z]},
      cTip:{type:'world', position:[cross.x,cross.y,cross.z]},
    };
    const crossLabelColor = lenC > 1e-8 ? crossVectorColor : warningColor;
    // A label waits for the arrow it names. See docs/architecture/animation.md#labels-wait-for-their-arrow.
    const shownWith = (obj) => () => !obj || obj.visible !== false;
    group.userData.labels = (showOperandLabels
      ? [
      { anchor:'uTip', name: uLabel, value: fmt(uVal), distanceFactor:8, offset:[0.12,0.12,0], color: operandAColor, revealed: shownWith(arrowU) },
      { anchor:'vTip', name: vLabel, value: fmt(vVal), distanceFactor:8, offset:[0.12,0.12,0], color: operandBColor, revealed: shownWith(arrowV) },
      { anchor:'cTip', name: crossLabel, value: fmt(cross), distanceFactor:8, offset:[0.12,0.12,0], color: crossLabelColor, revealed: shownWith(crossObj) },
    ]
      : [
      { anchor:'cTip', name: crossLabel, value: fmt(cross), distanceFactor:8, offset:[0.12,0.12,0], color: crossLabelColor, revealed: shownWith(crossObj) },
    ]);

    // Staged reveal for the play/scrub transport (AnimationDriver): grow p, then
    // q, then the cross result -- each from the origin, eased over its own third.
    group.userData.animate = window.makeStagedVectorReveal([
      { obj: arrowU, full: safeLen(lenU) },
      { obj: arrowV, full: safeLen(lenV) },
      { obj: crossObj, full: lenC > 1e-8 ? safeLen(lenC) : 0 },
    ]);

    const crossVisualKey = [
      uLabel,
      vLabel,
      cross.x.toFixed(6),
      cross.y.toFixed(6),
      cross.z.toFixed(6),
    ].join('|');
    const crossVisualKeys = window.__geoScratchCrossVisualKeys || (window.__geoScratchCrossVisualKeys = new Set());
    if (!crossVisualKeys.has(crossVisualKey) && typeof threeObjStore==='object' && threeObjStore){
      crossVisualKeys.add(crossVisualKey);
      const base=${JSON.stringify(block.id)};
      threeObjStore[base+'_u']=arrowU;
      threeObjStore[base+'_v']=arrowV;
      threeObjStore[base+'_c']=crossObj;
      threeObjStore[base]=group;
    }
    const resultVector = cross.clone();
    vectorNotation.setVectorMetadata(resultVector, {
      geoType: 'named_vector_expression',
      label: crossName || crossExpression,
    });
    return resultVector;
  })()`

    return [code, Order.FUNCTION_CALL]
  }
}
