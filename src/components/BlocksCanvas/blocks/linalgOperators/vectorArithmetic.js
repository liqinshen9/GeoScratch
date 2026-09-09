import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { vector3FromBlock } from '@/utils/sceneHelpers'
import { appendVectorPreviewUI } from '@/components/BlocksCanvas/blocks/linalgPrimitives/matrixPreview'

let REGISTERED = false

const fmt = (n) => (Number.isFinite(n) ? String(Math.round(n * 1e4) / 1e4) : '—')

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  )

// A named, bracketed 3x1 column vector.
function columnVec(name, vec) {
  const rows = (vec ? [vec.x, vec.y, vec.z] : ['—', '—', '—'])
    .map((n) => `<span>${typeof n === 'number' ? fmt(n) : n}</span>`)
    .join('')
  const tag = name ? `<span class="vec-drawer-name">${esc(name)}</span>` : ''
  return `<span class="vec-drawer-term">${tag}<span class="vec-drawer-col">${rows}</span></span>`
}

// The connected operand block's own variable name (V1, V2, ...), if any.
function operandName(block, inputName) {
  const target = block.getInputTargetBlock(inputName)
  const raw =
    target?.getField('GEOSCRATCH_NAME')?.getText?.() || target?.getFieldValue?.('GEOSCRATCH_NAME')
  return typeof raw === 'string' && raw.trim() ? raw.trim() : ''
}

// The connected operand's own instance colour, as a runtime expression. Plugging
// a vector into this block shouldn't repaint it in the scene, so the generic
// operandA/operandB role colour is only the fallback for an empty socket.
function operandColorExpr(block, inputName, role) {
  const target = block.getInputTargetBlock(inputName)
  if (!target) return `window.GeoScratchColors.forRole(${JSON.stringify(role)})`
  const objectType = target.type === 'linalg_point' ? 'point' : 'vector'
  return `window.GeoScratchColors.forInstance(${JSON.stringify(objectType)}, ${JSON.stringify(target.id)})`
}

// Runs on the block-editor thread, so it walks the blocks directly rather than
// touching the generated-code runtime.
function renderVectorArithmeticHtml(block) {
  const a = vector3FromBlock(block.getInputTargetBlock('U'))
  const b = vector3FromBlock(block.getInputTargetBlock('V'))
  const subtract = block.getFieldValue('OP') === 'subtract'
  const result = a && b ? (subtract ? a.clone().sub(b) : a.clone().add(b)) : null
  return `
    <div class="vec-drawer-expr">
      ${columnVec(operandName(block, 'U'), a)}
      <span class="vec-drawer-op">${subtract ? '−' : '+'}</span>
      ${columnVec(operandName(block, 'V'), b)}
      <span class="vec-drawer-op">=</span>
      ${columnVec('', result)}
    </div>
  `
}

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
            ['+', 'add'],
            ['−', 'subtract'],
          ]),
          'OP',
        )

      // Value block output: visualizes the operation and returns the result vector.
      this.setOutput(true, 'vector3')
      this.setInputsInline(true)
      this.setStyle(BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS)
      this.setTooltip('Compute u +/- v, show the arrows, and return the result vector.')
      this.setDeletable(true)
      this.setMovable(true)
      appendVectorPreviewUI(this, renderVectorArithmeticHtml)
    },
  }

  javascriptGenerator.forBlock['vector_arithmetic'] = function (block, g) {
    const op = block.getFieldValue('OP') || 'add'
    const u = g.valueToCode(block, 'U', Order.FUNCTION_CALL) || 'null'
    const v = g.valueToCode(block, 'V', Order.FUNCTION_CALL) || 'null'
    // Scene labels: the connected operand's own variable name, baked in at
    // code-gen time (the operand Vector3 doesn't carry its name when it's not
    // standalone). Falls back to a/b only when there's no named block.
    const uFallback = JSON.stringify(operandName(block, 'U') || 'a')
    const vFallback = JSON.stringify(operandName(block, 'V') || 'b')
    const uColorExpr = operandColorExpr(block, 'U', 'operandA')
    const vColorExpr = operandColorExpr(block, 'V', 'operandB')

    const code = `(function(){
    const uVal = ${u};
    const vVal = ${v};

    if (!uVal || !vVal || !uVal.isVector3 || !vVal.isVector3) return null;

    const origin = new THREE.Vector3();
    const safeLen = (x) => (isFinite(x) && x > 0 ? x : 1);
    const fmt = vectorNotation.formatVector;
    const uLabel = vectorNotation.getLabel(uVal, ${uFallback});
    const vLabel = vectorNotation.getLabel(vVal, ${vFallback});
    const showOperandLabels = vectorNotation.shouldShowOperandLabels(uVal, vVal);
    const baseId = ${JSON.stringify(block.id)};

    // Build input arrows
    const lenU = uVal.length();
    const lenV = vVal.length();

    const operandAColor = ${uColorExpr};
    const operandBColor = ${vColorExpr};

    // Vector arithmetic is anchor-agnostic: each operand is drawn from the
    // origin, so a + b and a - b read as free vectors. The exception is an
    // operand that carries its own tail via a "from point:" vector -- that one
    // is drawn from the supplied point. To see the head-to-tail picture a
    // student sets the second operand's "from point:" to the first vector's
    // tip themselves. (The point-difference path below keeps its own P -> Q
    // geometry and never uses these two arrows.)
    const anchorOf = (value) =>
      (value.userData?.anchor && value.userData.anchor.isVector3)
        ? value.userData.anchor.clone()
        : origin.clone();
    // Collinear operands (a + a, or any parallel pair) put both arrows AND the
    // result on the same ray from the origin, so all three interpenetrate and
    // z-fight. Nudge the two operands perpendicular by a visible amount -- big
    // enough to clear the shaft, so you can see there really are two of them --
    // and leave the result on the true axis. Non-parallel operands get nothing.
    const unitOf = (value) => (value.lengthSq() > 1e-12 ? value.clone().normalize() : null);
    const uUnit = unitOf(uVal);
    const vUnit = unitOf(vVal);
    const COLLINEAR_SEPARATION = 0.14;
    const separation = new THREE.Vector3();
    if (uUnit && vUnit && Math.abs(uUnit.dot(vUnit)) > 0.999) {
      const up = Math.abs(uUnit.y) < 0.999 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      separation.crossVectors(uUnit, up).normalize().multiplyScalar(COLLINEAR_SEPARATION);
    }
    const uAnchor = anchorOf(uVal).add(separation);
    const vAnchor = anchorOf(vVal).sub(separation);
    // Parallel operands sit as three near-touching arrows; halo gaps between
    // them read as damage, so this block's glyphs opt out of haloing.
    const glyphOptions = { halo: separation.lengthSq() === 0 };

    const arrowU = window.buildVectorShaftGlyph(
      THREE, baseId + '_u', uAnchor.clone(),
      (lenU > 0 ? uVal.clone().normalize() : new THREE.Vector3(1,0,0)),
      safeLen(lenU), operandAColor, glyphOptions
    );

    const arrowV = window.buildVectorShaftGlyph(
      THREE, baseId + '_v', vAnchor.clone(),
      (lenV > 0 ? vVal.clone().normalize() : new THREE.Vector3(1,0,0)),
      safeLen(lenV), operandBColor, glyphOptions
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
        isPointDifference ? window.GeoScratchColors.forInstance('vector', baseId) : window.GeoScratchColors.forRole('result'),
        glyphOptions
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
    if (isPointDifference) {
      group.userData.start = resultOrigin.clone();
      group.userData.end = resultTip.clone();
    }

    // ---- Labels (tips) ----
    group.userData.labelAnchors = {
      uTip:   { type:'world', position:[uAnchor.x + uVal.x, uAnchor.y + uVal.y, uAnchor.z + uVal.z] },
      vTip:   { type:'world', position:[vAnchor.x + vVal.x, vAnchor.y + vVal.y, vAnchor.z + vVal.z] },
      rTip:   { type:'world', position:[resultLabelPosition.x,  resultLabelPosition.y,  resultLabelPosition.z ] },
    };
    const resultColor = isPointDifference
      ? window.GeoScratchColors.forInstance('vector', baseId)
      : (lenR > 1e-8 ? window.GeoScratchColors.forRole('result') : window.GeoScratchColors.forRole('warning'));
    group.userData.labels = isPointDifference
      ? [
        { anchor:'rTip', name: pointDifferenceLabel, value: fmt(res), distanceFactor:8, offset:[0.12,0.12,0], color: resultColor },
      ]
      : showOperandLabels
        ? [
        { anchor:'uTip', name: uLabel, value: fmt(uVal), distanceFactor:8, offset:[0.12,0.12,0], color: operandAColor },
        { anchor:'vTip', name: vLabel, value: fmt(vVal), distanceFactor:8, offset:[0.12,0.12,0], color: operandBColor },
        { anchor:'rTip', name: genericResultLabel, value: fmt(res), distanceFactor:8, offset:[0.12,0.12,0], color: resultColor },
      ]
        : [
        { anchor:'rTip', name: genericResultLabel, value: fmt(res), distanceFactor:8, offset:[0.12,0.12,0], color: resultColor },
      ];

    // Staged reveal for the play/scrub transport (AnimationDriver): grow a from
    // its anchor, then b from its anchor, then the result -- exactly the
    // arrangement drawn above, uncovered in sequence.
    group.userData.animate = window.makeStagedVectorReveal(
      isPointDifference
        ? [{ obj: resObj, full: safeLen(lenR) }]
        : [
          { obj: arrowU, full: safeLen(lenU) },
          { obj: arrowV, full: safeLen(lenV) },
          { obj: resObj, full: lenR > 1e-8 ? safeLen(lenR) : 0 },
        ]
    );

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
  })()`

    return [code, Order.FUNCTION_CALL]
  }
}
