import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

let REGISTERED = false

export function initCrossProductBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['vector_cross_product'] = {
    init() {
      this.appendDummyInput().appendField('Cross Product')
      this.appendValueInput('U').setCheck(['vector3', 'obj3D']).appendField('p:')
      this.appendValueInput('V').setCheck(['vector3', 'obj3D']).appendField('x').appendField('q:')
      this.setInputsInline(true)

      this.setOutput(true, 'vector3')
      this.setStyle(BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS)
      this.setTooltip('Compute u × v and return a new geo_vector (registered to render).')
      this.setDeletable(true)
      this.setMovable(true)
    },
  }

  javascriptGenerator.forBlock['vector_cross_product'] = function (block, g) {
    const u = g.valueToCode(block, 'U', Order.FUNCTION_CALL) || 'null';
    const v = g.valueToCode(block, 'V', Order.FUNCTION_CALL) || 'null';

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

    const uInfo = vectorInfoFromInput(${u}, 'p');
    const vInfo = vectorInfoFromInput(${v}, 'q');
    const uVal = uInfo?.vector;
    const vVal = vInfo?.vector;

    if (!uVal || !vVal || !uVal.isVector3 || !vVal.isVector3) return null;

    const cross = new THREE.Vector3().crossVectors(uVal, vVal);
    const lenU = uVal.length(), lenV = vVal.length(), lenC = cross.length();
    const safeLen = (x) => (isFinite(x) && x > 0 ? x : 1);
    const fmt = vectorNotation.formatVector;
    const uLabel = uInfo?.label || vectorNotation.getLabel(uVal, 'p');
    const vLabel = vInfo?.label || vectorNotation.getLabel(vVal, 'q');
    const showOperandLabels = vectorNotation.shouldShowOperandLabels(uVal, vVal);
    const crossLabel = uLabel + ' x ' + vLabel;
    const exerciseMode = String(window.__geoScratchRuntimeMode || '').startsWith('exercise');
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
      crossObj = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 16, 12),
        new THREE.MeshStandardMaterial({ color: warningColor, roughness: 0.4, metalness: 0.1 })
      );
      crossObj.userData.zoomInvariantRadius = 0.04;
      crossObj.userData.zoomInvariantUniform = true;
    }

    const tag=(o)=>{o.userData.geoType='geo_vector';o.userData.srcBlockId=baseId;return o;};
    tag(arrowU); tag(arrowV); tag(crossObj);

    const group=new THREE.Group();
    if (exerciseMode) {
      group.add(crossObj);
    } else {
      group.add(arrowU,arrowV,crossObj);
    }
    group.userData.geoType='geo_vector_group';
    group.userData.srcBlockId=${JSON.stringify(block.id)};

    // Labels at tips
    group.userData.labelAnchors = exerciseMode ? {
      cTip:{type:'world', position:[cross.x,cross.y,cross.z]},
    } : {
      uTip:{type:'world', position:[uVal.x,uVal.y,uVal.z]},
      vTip:{type:'world', position:[vVal.x,vVal.y,vVal.z]},
      cTip:{type:'world', position:[cross.x,cross.y,cross.z]},
    };
    const crossLabelColor = lenC > 1e-8 ? crossVectorColor : warningColor;
    group.userData.labels = exerciseMode
      ? [
      { anchor:'cTip', text:'n = ' + crossLabel + ' = ' + fmt(cross), distanceFactor:8, offset:[0.12,0.12,0], color: crossLabelColor },
    ]
      : (showOperandLabels
      ? [
      { anchor:'uTip', text:'p = ' + fmt(uVal), distanceFactor:8, offset:[0.12,0.12,0], color: operandAColor },
      { anchor:'vTip', text:'q = ' + fmt(vVal), distanceFactor:8, offset:[0.12,0.12,0], color: operandBColor },
      { anchor:'cTip', text: crossLabel + ' = ' + fmt(cross), distanceFactor:8, offset:[0.12,0.12,0], color: crossLabelColor },
    ]
      : [
      { anchor:'cTip', text: crossLabel + ' = ' + fmt(cross), distanceFactor:8, offset:[0.12,0.12,0], color: crossLabelColor },
    ]);

    // Staged reveal for the play/scrub transport (AnimationDriver): grow p, then
    // q, then the cross result -- each from the origin, eased over its own third.
    group.userData.animate = window.makeStagedVectorReveal(
      exerciseMode
        ? [{ obj: crossObj, full: safeLen(lenC) }]
        : [
          { obj: arrowU, full: safeLen(lenU) },
          { obj: arrowV, full: safeLen(lenV) },
          { obj: crossObj, full: lenC > 1e-8 ? safeLen(lenC) : 0 },
        ]
    );

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
      if (!exerciseMode) {
        threeObjStore[base+'_u']=arrowU;
        threeObjStore[base+'_v']=arrowV;
        threeObjStore[base+'_c']=crossObj;
      }
      threeObjStore[base]=group;
    }
    const resultVector = cross.clone();
    vectorNotation.setVectorMetadata(resultVector, {
      geoType: 'named_vector_expression',
      label: crossLabel,
    });
    return resultVector;
  })()`;

    return [code, Order.FUNCTION_CALL];
  };
}
