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
      this.appendValueInput('U').setCheck('vector3').appendField('p:')
      this.appendValueInput('V').setCheck('vector3').appendField('x').appendField('q:')
      this.setInputsInline(true)

      this.setOutput(true, 'obj3D')
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
    const uVal = ${u};
    const vVal = ${v};

    if (!uVal || !vVal || !uVal.isVector3 || !vVal.isVector3) return null;

    const cross = new THREE.Vector3().crossVectors(uVal, vVal);
    const lenU = uVal.length(), lenV = vVal.length(), lenC = cross.length();
    const safeLen = (x) => (isFinite(x) && x > 0 ? x : 1);
    const headLenRatio = 0.25, headWidthRatio = 0.10;
    const fmt = vectorNotation.formatVector;
    const uLabel = vectorNotation.getLabel(uVal, 'p');
    const vLabel = vectorNotation.getLabel(vVal, 'q');
    const showOperandLabels = vectorNotation.shouldShowOperandLabels(uVal, vVal);
    const crossLabel = uLabel + ' x ' + vLabel;

    const arrowU = new THREE.ArrowHelper(
      (lenU>0?uVal.clone().normalize():new THREE.Vector3(1,0,0)),
      new THREE.Vector3(0,0,0), safeLen(lenU), 0x1e40af, headLenRatio, headWidthRatio
    );
    const arrowV = new THREE.ArrowHelper(
      (lenV>0?vVal.clone().normalize():new THREE.Vector3(1,0,0)),
      new THREE.Vector3(0,0,0), safeLen(lenV), 0xb91c1c, headLenRatio, headWidthRatio
    );

    let crossObj;
    if (lenC>1e-8) {
      crossObj = new THREE.ArrowHelper(
        cross.clone().normalize(), new THREE.Vector3(0,0,0),
        safeLen(lenC), 0x15803d, headLenRatio, headWidthRatio
      );
    } else {
      crossObj = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.4, metalness: 0.1 })
      );
      crossObj.userData.zoomInvariantRadius = 0.04;
      crossObj.userData.zoomInvariantUniform = true;
    }

    const tag=(o,l)=>{o.userData.geoType='geo_vector';o.userData.length=safeLen(l);o.userData.headLenRatio=headLenRatio;o.userData.headWidthRatio=headWidthRatio;o.userData.srcBlockId=${JSON.stringify(block.id)};return o;};
    tag(arrowU,lenU); tag(arrowV,lenV); tag(crossObj,lenC);

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
    group.userData.labels = showOperandLabels
      ? [
      { anchor:'uTip', text:'p = ' + fmt(uVal), distanceFactor:8, offset:[0.12,0.12,0], color: '#1e40af' },
      { anchor:'vTip', text:'q = ' + fmt(vVal), distanceFactor:8, offset:[0.12,0.12,0], color: '#b91c1c' },
      { anchor:'cTip', text: crossLabel + ' = ' + fmt(cross), distanceFactor:8, offset:[0.12,0.12,0], color: lenC > 1e-8 ? '#15803d' : '#ffff00' },
    ]
      : [
      { anchor:'cTip', text: crossLabel + ' = ' + fmt(cross), distanceFactor:8, offset:[0.12,0.12,0], color: lenC > 1e-8 ? '#15803d' : '#ffff00' },
    ];

    if (typeof threeObjStore==='object' && threeObjStore){
      const base=${JSON.stringify(block.id)};
      threeObjStore[base+'_u']=arrowU;
      threeObjStore[base+'_v']=arrowV;
      threeObjStore[base+'_c']=crossObj;
      threeObjStore[base]=group;
    }
    return group;
  })()`;

    return [code, Order.FUNCTION_CALL];
  };
}
