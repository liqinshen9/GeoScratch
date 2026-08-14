import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

let REGISTERED = false

export function initNormInplaceBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['vector_normalise'] = {
    init() {
      this.appendDummyInput().appendField('Normalize')
      this.appendValueInput('V').setCheck('vector3').appendField('w:')
      this.setInputsInline(true)
      this.setOutput(true, 'obj3D')
      this.setStyle(BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS)
      this.setTooltip('Render v and its normalized version as a single group.')
      this.setDeletable(true)
      this.setMovable(true)
    },
  }

  javascriptGenerator.forBlock['vector_normalise'] = function (block, g) {
    const v = g.valueToCode(block, 'V', Order.FUNCTION_CALL) || 'null';

    const code = `(function(){
    const vVal = ${v};
    if (!vVal || !vVal.isVector3) return null;

    const safeLen = (x) => (isFinite(x) && x > 0 ? x : 1);
    const lenV = vVal.length();
    const fmt = vectorNotation.formatVector;
    const valueLabel = vectorNotation.getLabel(vVal, 'w');
    const showOperandLabels = vectorNotation.shouldShowOperandLabels(vVal, null);
    const normLabel = 'normalize ' + valueLabel;
    const baseId = ${JSON.stringify(block.id)};

    const operandAColor = window.GeoScratchColors.forRole('operandA');
    const normVectorColor = window.GeoScratchColors.forInstance('vector', baseId);
    const warningColor = window.GeoScratchColors.forRole('warning');

    // Original arrow
    const arrowIn = window.buildVectorShaftGlyph(
      THREE, baseId + '_in', new THREE.Vector3(0,0,0),
      (lenV>0?vVal.clone().normalize():new THREE.Vector3(1,0,0)), safeLen(lenV), operandAColor
    );

    // Normalized object
    let normObj, normVec=new THREE.Vector3();
    if (lenV>1e-8) {
      normVec.copy(vVal).normalize(); // unit vector components
      normObj = window.buildVectorShaftGlyph(
        THREE, baseId + '_norm', new THREE.Vector3(0,0,0), normVec.clone(), 1, normVectorColor
      );
    } else {
      normVec.set(0,0,0);
      normObj = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 16, 12),
        new THREE.MeshStandardMaterial({ color: warningColor, roughness: 0.4, metalness: 0.1 })
      );
      normObj.userData.zoomInvariantRadius = 0.04;
      normObj.userData.zoomInvariantUniform = true;
    }

    const tag=(o)=>{o.userData.geoType='geo_vector';o.userData.srcBlockId=baseId;return o;};
    tag(arrowIn); tag(normObj);

    const group=new THREE.Group();
    group.add(arrowIn,normObj);
    group.userData.geoType='geo_vector_group';
    group.userData.srcBlockId=${JSON.stringify(block.id)};

    // Labels
    group.userData.labelAnchors = {
      vTip:   { type:'world', position:[vVal.x,    vVal.y,    vVal.z   ] },
      normTip:{ type:'world', position:[normVec.x, normVec.y, normVec.z] },
    };
    const normLabelColor = lenV > 1e-8 ? normVectorColor : warningColor;
    group.userData.labels = showOperandLabels
      ? [
      { anchor:'vTip',    text: valueLabel + ' = ' + fmt(vVal),   distanceFactor:8, offset:[0.12,0.12,0], color: operandAColor },
      { anchor:'normTip', text: normLabel + ' = ' + fmt(normVec), distanceFactor:8, offset:[0.12,0.12,0], color: normLabelColor },
    ]
      : [
      { anchor:'normTip', text: normLabel + ' = ' + fmt(normVec), distanceFactor:8, offset:[0.12,0.12,0], color: normLabelColor },
    ];

    if (typeof threeObjStore==='object' && threeObjStore){
      const base=${JSON.stringify(block.id)};
      threeObjStore[base + '_in']   = arrowIn;
      threeObjStore[base + '_norm'] = normObj;
      threeObjStore[base]           = group;
    }
    return group;
  })()`;

    return [code, Order.FUNCTION_CALL];
  };

}
