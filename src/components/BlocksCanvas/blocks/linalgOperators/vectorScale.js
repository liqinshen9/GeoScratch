import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

let REGISTERED = false

// The source vector's own instance colour, as a runtime expression, so scaling
// a vector doesn't repaint it. Matches vectorArithmetic.js.
function operandColorExpr(block, inputName, role) {
  const target = block.getInputTargetBlock(inputName)
  if (!target) return `window.GeoScratchColors.forRole(${JSON.stringify(role)})`
  const objectType = target.type === 'linalg_point' ? 'point' : 'vector'
  return `window.GeoScratchColors.forInstance(${JSON.stringify(objectType)}, ${JSON.stringify(target.id)})`
}

function operandName(block, inputName, fallback) {
  let target = block.getInputTargetBlock(inputName)
  // A geo_variable wrapper is transparent here -- the name lives on the block
  // it wraps (or on the wrapper itself when the value is a named expression).
  while (target?.type === 'geo_variable') target = target.getInputTargetBlock('VALUE') ?? null
  const raw =
    target?.getField('GEOSCRATCH_NAME')?.getText?.() || target?.getFieldValue?.('GEOSCRATCH_NAME')
  return JSON.stringify(typeof raw === 'string' && raw.trim() ? raw.trim() : fallback)
}

export function initVectorScaleBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.vector_scale = {
    init() {
      this.appendDummyInput().appendField('Scale Vector')
      this.appendValueInput('K').setCheck('scalar').appendField('k:')
      this.appendValueInput('V').setCheck('vector3').appendField('v:')
      this.setInputsInline(true)
      this.setOutput(true, 'vector3')
      this.setStyle(BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS)
      this.setTooltip('Multiply a vector by a scalar. Draws v and k*v, returns k*v.')
      this.setDeletable(true)
      this.setMovable(true)
    },
  }

  javascriptGenerator.forBlock.vector_scale = function (block, g) {
    const k = g.valueToCode(block, 'K', Order.NONE) || '1'
    const v = g.valueToCode(block, 'V', Order.FUNCTION_CALL) || 'null'
    const vColorExpr = operandColorExpr(block, 'V', 'operandA')
    const vNameExpr = operandName(block, 'V', 'v')

    const code = `(function(){
    const vVal = ${v};
    const kVal = Number(${k});

    if (!vVal || !vVal.isVector3 || !isFinite(kVal)) return null;

    const safeLen = (x) => (isFinite(x) && x > 0 ? x : 1);
    const fmt = vectorNotation.formatVector;
    const baseId = ${JSON.stringify(block.id)};
    const vLabel = vectorNotation.getLabel(vVal, ${vNameExpr});
    const scaledLabel = kVal + '\\u00b7' + vLabel;

    const anchor = (vVal.userData?.anchor && vVal.userData.anchor.isVector3)
      ? vVal.userData.anchor.clone()
      : new THREE.Vector3();

    const scaled = vVal.clone().multiplyScalar(kVal);
    const lenV = vVal.length();
    const lenS = scaled.length();

    // Scaling an already-computed vector keeps it the result colour.
    const sourceColor = vVal.userData?.geoType === 'named_vector_expression'
      ? window.GeoScratchColors.forRole('result')
      : ${vColorExpr};
    const resultColor = window.GeoScratchColors.forRole('result');
    const warningColor = window.GeoScratchColors.forRole('warning');

    // k*v is always collinear with v, so the two shafts run through each other.
    // Halo gaps between parts of one picture read as damage, and the depth test
    // can't order coincident surfaces -- bias the LONGER glyph away from the
    // camera so the shorter one wins its stretch cleanly.
    // See vectorShaftGlyph.js's depthBias option.
    const sourceIsLonger = lenV > lenS;
    const sourceOptions = { halo: false, depthBias: sourceIsLonger ? 2 : 0 };
    const scaledOptions = { halo: false, depthBias: sourceIsLonger ? 0 : 2 };

    // k = 1 makes the two identical; one arrow carrying both labels beats two
    // glyphs fighting for the same pixels. Matches vector_arithmetic's a + a.
    // At k = 1 the two are coincident; depthBias lets the unbiased one win every
    // pixel, so this still reads as a single arrow.
    const identical = Math.abs(kVal - 1) < 1e-9;

    const arrowV = window.buildVectorShaftGlyph(
      THREE, baseId + '_v', anchor.clone(),
      (lenV > 0 ? vVal.clone().normalize() : new THREE.Vector3(1,0,0)),
      safeLen(lenV), sourceColor, sourceOptions
    );

    let scaledObj = null;
    {
      if (lenS > 1e-8) {
        scaledObj = window.buildVectorShaftGlyph(
          THREE, baseId + '_s', anchor.clone(), scaled.clone().normalize(),
          safeLen(lenS), resultColor, scaledOptions
        );
      } else {
        // k = 0 collapses the vector to its own tail.
        scaledObj = new THREE.Mesh(
          new THREE.SphereGeometry(0.04, 16, 12),
          new THREE.MeshStandardMaterial({ color: warningColor, roughness: 0.4, metalness: 0.1 })
        );
        scaledObj.position.copy(anchor);
        scaledObj.userData.zoomInvariantRadius = 0.04;
        scaledObj.userData.zoomInvariantUniform = true;
      }
    }

    const tag = (o) => { o.userData.geoType='geo_vector'; o.userData.srcBlockId=baseId; return o; };
    tag(arrowV); if (scaledObj) tag(scaledObj);

    const group = new THREE.Group();
    group.add(arrowV);
    if (scaledObj) group.add(scaledObj);
    group.userData.geoType='geo_vector_group';
    group.userData.srcBlockId=baseId;

    const vTip = anchor.clone().add(vVal);
    const sTip = anchor.clone().add(scaled);
    group.userData.labelAnchors = {
      vTip: { type:'world', position:[vTip.x, vTip.y, vTip.z] },
      sTip: { type:'world', position:[sTip.x, sTip.y, sTip.z] },
    };
    const scaledColor = lenS > 1e-8 ? resultColor : warningColor;
    const sourceLabelEntry = { anchor:'vTip', name: vLabel, value: fmt(vVal), distanceFactor:8, offset:[0.12,0.12,0], color: sourceColor };
    // Identical glyphs share a tip, so stack the scaled label below it.
    const scaledLabelEntry = { anchor:'sTip', name: scaledLabel, value: fmt(scaled), distanceFactor:8, offset: identical ? [0.12,-0.18,0] : [0.12,0.12,0], color: scaledColor };

    // Settings > Vector > "Show Unscaled Vector". Live, not baked in: nothing
    // re-runs the generated code when a setting changes.
    const applyShowSource = (s) => {
      const show = s?.showUnscaledVector !== false;
      arrowV.visible = show;
      group.userData.labels = show ? [sourceLabelEntry, scaledLabelEntry] : [scaledLabelEntry];
    };
    applyShowSource(window.useSettingsStore?.getState().settings || {});
    if (window.useSettingsStore) {
      const unsubscribe = window.useSettingsStore.subscribe((state) => {
        if (window.threeObjStore?.[baseId] !== group) { unsubscribe(); return; }
        applyShowSource(state.settings);
      });
    }

    group.userData.animate = window.makeStagedVectorReveal([
      { obj: arrowV, full: safeLen(lenV) },
      ...(scaledObj ? [{ obj: scaledObj, full: lenS > 1e-8 ? safeLen(lenS) : 0 }] : []),
    ]);

    if (typeof threeObjStore === 'object' && threeObjStore) {
      threeObjStore[baseId + '_v'] = arrowV;
      if (scaledObj) threeObjStore[baseId + '_s'] = scaledObj;
      threeObjStore[baseId] = group;
    }

    // Name the returned vector so a consumer (vector_arithmetic) calls it
    // "5\u00b7V2" instead of falling back to a generic operand letter.
    vectorNotation.setVectorMetadata(scaled, {
      geoType: 'named_vector_expression',
      label: scaledLabel,
    });
    return scaled;
  })()`

    return [code, Order.FUNCTION_CALL]
  }
}
