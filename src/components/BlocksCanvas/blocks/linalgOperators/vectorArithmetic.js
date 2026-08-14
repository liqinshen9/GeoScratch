import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

let REGISTERED = false

export function initVectorArithmeticBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['vector_arithmetic'] = {
    init() {
      this.appendDummyInput().appendField('Vector Arithmetic')
      this.appendValueInput('U').setCheck('vector3')
      this.appendValueInput('V')
        .setCheck('vector3')
        .appendField(
          new Blockly.FieldDropdown([
            ['a + b', 'add'],
            ['a - b', 'subtract'],
          ]),
          'OP'
        )

      // Value block output: visualizes the operation and returns the result vector.
      this.setOutput(true, 'vector3')
      this.setInputsInline(true)
      this.setStyle(BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS)
      this.setTooltip('Compute u +/- v, show the arrows, and return the result vector.')
      this.setDeletable(true)
      this.setMovable(true)
    },
  }

  javascriptGenerator.forBlock['vector_arithmetic'] = function (block, g) {
    const op = block.getFieldValue('OP') || 'add';
    const u = g.valueToCode(block, 'U', Order.FUNCTION_CALL) || 'null';
    const v = g.valueToCode(block, 'V', Order.FUNCTION_CALL) || 'null';

    const code = `(function(){
    const uVal = ${u};
    const vVal = ${v};

    if (!uVal || !vVal || !uVal.isVector3 || !vVal.isVector3) return null;

    const origin = new THREE.Vector3();
    const safeLen = (x) => (isFinite(x) && x > 0 ? x : 1);
    const fmt = vectorNotation.formatVector;
    const uLabel = vectorNotation.getLabel(uVal, 'a');
    const vLabel = vectorNotation.getLabel(vVal, 'b');
    const showOperandLabels = vectorNotation.shouldShowOperandLabels(uVal, vVal);
    const baseId = ${JSON.stringify(block.id)};

    // Build input arrows
    const lenU = uVal.length();
    const lenV = vVal.length();

    const operandAColor = window.GeoScratchColors.forRole('operandA');
    const operandBColor = window.GeoScratchColors.forRole('operandB');

    const arrowU = window.buildVectorShaftGlyph(
      THREE, baseId + '_u', origin.clone(),
      (lenU > 0 ? uVal.clone().normalize() : new THREE.Vector3(1,0,0)),
      safeLen(lenU), operandAColor
    );

    const arrowV = window.buildVectorShaftGlyph(
      THREE, baseId + '_v', origin.clone(),
      (lenV > 0 ? vVal.clone().normalize() : new THREE.Vector3(1,0,0)),
      safeLen(lenV), operandBColor
    );

    // Compute result
    const res = uVal.clone()[${op === 'add' ? `'add'` : `'sub'`}](vVal);
    const lenR = res.length();
    const isPointLike = (value) => (
      value?.userData?.geoType === 'point_on_object_vector' ||
      value?.userData?.geoType === 'linalg_point_vector'
    );
    const isPointDifference = ${op === 'subtract' ? 'true' : 'false'} && (
      vVal.userData?.geoType === 'point_on_object_vector' ||
      (isPointLike(uVal) && isPointLike(vVal))
    );
    const pointLabel = vVal.userData?.label || 'Q';
    const pointDifferenceLabel = vectorNotation.binaryLabel(uVal, '-', vVal, 'P', pointLabel);
    const genericResultLabel = showOperandLabels
      ? 'result'
      : vectorNotation.binaryLabel(uVal, '${op === 'add' ? '+' : '-'}', vVal);
    const resultOrigin = isPointDifference ? vVal.clone() : origin.clone();
    const resultTip = isPointDifference ? uVal.clone() : res.clone();
    const resultLabelPosition = isPointDifference
      ? resultOrigin.clone().add(resultTip).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.35, 0))
      : resultTip.clone();

    let resObj;
    if (lenR > 1e-8) {
      resObj = window.buildVectorShaftGlyph(
        THREE, baseId + '_r', resultOrigin.clone(), res.clone().normalize(), safeLen(lenR),
        isPointDifference ? window.GeoScratchColors.forInstance('vector', baseId) : window.GeoScratchColors.forRole('result')
      );
    } else {
      resObj = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 16, 12),
        new THREE.MeshStandardMaterial({ color: window.GeoScratchColors.forRole('warning'), roughness: 0.4, metalness: 0.1 })
      );
      resObj.userData.zoomInvariantRadius = 0.04;
      resObj.userData.zoomInvariantUniform = true;
    }

    // Tag metadata on part objects
    const tag = (obj) => {
      obj.userData.geoType='geo_vector';
      obj.userData.srcBlockId=${JSON.stringify(block.id)};
      return obj;
    };
    tag(arrowU); tag(arrowV); tag(resObj);

    // Group return
    const group = new THREE.Group();
    if (isPointDifference) {
      group.add(resObj);
    } else {
      group.add(arrowU, arrowV, resObj);
    }
    group.userData.geoType='geo_vector_group';
    group.userData.srcBlockId=${JSON.stringify(block.id)};

    // ---- Labels (tips) ----
    group.userData.labelAnchors = {
      uTip:   { type:'world', position:[uVal.x, uVal.y, uVal.z] },
      vTip:   { type:'world', position:[vVal.x, vVal.y, vVal.z] },
      rTip:   { type:'world', position:[resultLabelPosition.x,  resultLabelPosition.y,  resultLabelPosition.z ] },
    };
    const resultColor = isPointDifference
      ? window.GeoScratchColors.forInstance('vector', baseId)
      : (lenR > 1e-8 ? window.GeoScratchColors.forRole('result') : window.GeoScratchColors.forRole('warning'));
    group.userData.labels = isPointDifference
      ? [
        { anchor:'rTip', text: pointDifferenceLabel + ' = ' + fmt(res), distanceFactor:8, offset:[0.12,0.12,0], color: resultColor },
      ]
      : showOperandLabels
        ? [
        { anchor:'uTip', text: uLabel + ' = ' + fmt(uVal), distanceFactor:8, offset:[0.12,0.12,0], color: operandAColor },
        { anchor:'vTip', text: vLabel + ' = ' + fmt(vVal), distanceFactor:8, offset:[0.12,0.12,0], color: operandBColor },
        { anchor:'rTip', text: genericResultLabel + ' = ' + fmt(res), distanceFactor:8, offset:[0.12,0.12,0], color: resultColor },
      ]
        : [
        { anchor:'rTip', text: genericResultLabel + ' = ' + fmt(res), distanceFactor:8, offset:[0.12,0.12,0], color: resultColor },
      ];

    // Register
    if (typeof threeObjStore==='object' && threeObjStore) {
      const base = ${JSON.stringify(block.id)};
      if (!isPointDifference) {
        threeObjStore[base + '_u'] = arrowU;
        threeObjStore[base + '_v'] = arrowV;
      }
      threeObjStore[base + '_r'] = resObj;
      threeObjStore[base]        = group;
    }
    const resultVector = res.clone();
    if (isPointDifference) {
      resultVector.userData = {
        geoType: 'point_difference_vector',
        start: resultOrigin.clone(),
        end: resultTip.clone(),
        label: pointDifferenceLabel,
        pointToPoint: isPointLike(uVal) && isPointLike(vVal),
      };
    } else if (!showOperandLabels) {
      vectorNotation.setVectorMetadata(resultVector, {
        geoType: 'named_vector_expression',
        label: genericResultLabel,
      });
    }
    return resultVector;
  })()`;

    return [code, Order.FUNCTION_CALL];
  };

}
