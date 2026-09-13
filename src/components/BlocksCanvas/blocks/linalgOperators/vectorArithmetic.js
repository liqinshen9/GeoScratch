import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { vector3FromBlock, vectorLabelFromBlock } from '@/utils/sceneHelpers'
import { appendVectorPreviewUI } from '@/components/BlocksCanvas/blocks/linalgPrimitives/matrixPreview'

let REGISTERED = false

const fmt = (n) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '—')

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

// The name this operand should carry -- a plain vector's own name, or the
// expression that produced it ("3\u00b7V2"), seeing through variable wrappers.
function operandName(block, inputName) {
  return vectorLabelFromBlock(block.getInputTargetBlock(inputName))
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

    // A plain vector block keeps its own colour, but an operand that is itself a
    // computed vector (Scale Vector's "3\u00b7V2") stays the result colour rather
    // than being repainted as somebody's operand.
    const isComputed = (value) => value?.userData?.geoType === 'named_vector_expression';
    const operandAColor = isComputed(uVal)
      ? window.GeoScratchColors.forRole('result')
      : ${uColorExpr};
    const operandBColor = isComputed(vVal)
      ? window.GeoScratchColors.forRole('result')
      : ${vColorExpr};

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
    const uAnchor = anchorOf(uVal);
    const vAnchor = anchorOf(vVal);

    // The block that produced an operand may already be drawing that exact
    // arrow from that exact tail (a standalone vector block, Scale Vector's
    // k\u00b7v). A second coincident copy can't be depth-ordered, so we draw
    // none: the reveal below grows the owner's arrow instead, and the owner
    // keeps the label. Same rule as duplicateVectorRegistry.js, across blocks.
    // Returns the owner's glyphs to animate (possibly []), or null when this
    // operand is ours to draw.
    const ownerGlyphs = (value, anchor) => {
      const glyph = value.userData?.glyph;
      if (!glyph?.anchor?.isVector3 || glyph.anchor.distanceToSquared(anchor) >= 1e-12) return null;
      return Array.isArray(glyph.objs) ? glyph.objs.filter(Boolean) : [];
    };
    const uOwnerGlyphs = ownerGlyphs(uVal, uAnchor);
    const vOwnerGlyphs = ownerGlyphs(vVal, vAnchor);

    // Two identical operands (a + a) would draw two arrows occupying exactly the
    // same space -- coincident surfaces the depth test can't order, which shows
    // up as speckling. Draw one arrow and label it with both names instead.
    const operandsIdentical =
      uVal.distanceToSquared(vVal) < 1e-12 && uAnchor.distanceToSquared(vAnchor) < 1e-12;

    // The result of a collinear sum lies along the operands, so its shaft
    // overlaps theirs; halo gaps between parts of one composite picture read as
    // damage rather than depth.
    const uUnit = lenU > 1e-6 ? uVal.clone().normalize() : null;
    const vUnit = lenV > 1e-6 ? vVal.clone().normalize() : null;
    const operandsParallel = !!(uUnit && vUnit && Math.abs(uUnit.dot(vUnit)) > 0.999);
    const glyphOptions = { halo: !operandsParallel };
    // A collinear sum's result runs straight through its operands. Bias the
    // result away from the camera so the operand wins the shared stretch
    // cleanly and the result shows beyond its tip, instead of the two
    // speckling against each other.
    const resultGlyphOptions = { halo: !operandsParallel, depthBias: operandsParallel ? 2 : 0 };

    const arrowU = uOwnerGlyphs ? null : window.buildVectorShaftGlyph(
      THREE, baseId + '_u', uAnchor.clone(),
      (lenU > 0 ? uVal.clone().normalize() : new THREE.Vector3(1,0,0)),
      safeLen(lenU), operandAColor, glyphOptions
    );

    const arrowV = (operandsIdentical || vOwnerGlyphs) ? null : window.buildVectorShaftGlyph(
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
    // Name the result by its expression ("a + b"), never a generic "result" --
    // Scale Vector labels its result "3\u00b7a", and the two should read alike.
    const genericResultLabel = vectorNotation.binaryLabel(
      uVal, '${op === 'add' ? '+' : '\u2212'}', vVal, ${uFallback}, ${vFallback}
    );
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
        resultGlyphOptions
      );
    } else {
      resObj = window.geoPointMarker({ color: window.GeoScratchColors.forRole('warning'), radius: 0.04 });
    }

    // u - v shows v's negative while it plays: grown from v's own tail alongside
    // v, so a student who hangs v off u's tip sees u + (-v) head to tail. Hidden
    // at rest. See docs/architecture/animation.md#subtraction-shows-the-negative.
    const negatedV = ${op === 'subtract' ? 'true' : 'false'} && !isPointDifference && lenV > 1e-8
      ? window.buildVectorShaftGlyph(
        THREE, baseId + '_negv', vAnchor.clone(), vVal.clone().negate().normalize(),
        safeLen(lenV), operandBColor, glyphOptions
      )
      : null;
    if (negatedV) negatedV.visible = false;

    // Tag metadata on part objects
    const tag = (obj) => {
      obj.userData.geoType='geo_vector';
      obj.userData.srcBlockId=${JSON.stringify(block.id)};
      return obj;
    };
    if (arrowU) tag(arrowU); if (arrowV) tag(arrowV); if (negatedV) tag(negatedV); tag(resObj);

    // Group return
    const group = new THREE.Group();
    if (isPointDifference) {
      group.add(resObj);
      // P and Q as position vectors, shown only while the reveal plays: they are
      // what the difference is taken between, and the resting scene is just P - Q.
      [arrowU, arrowV].forEach((guide) => {
        if (!guide) return;
        guide.visible = false;
        group.add(guide);
      });
    } else {
      if (arrowU) group.add(arrowU);
      group.add(resObj);
      if (arrowV) group.add(arrowV);
      if (negatedV) group.add(negatedV);
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
      negTip: { type:'world', position:[vAnchor.x - vVal.x, vAnchor.y - vVal.y, vAnchor.z - vVal.z] },
    };
    const resultColor = isPointDifference
      ? window.GeoScratchColors.forInstance('vector', baseId)
      : (lenR > 1e-8 ? window.GeoScratchColors.forRole('result') : window.GeoScratchColors.forRole('warning'));
    // A label waits for the arrow it names: during a reveal it would otherwise
    // float over empty space. See docs/architecture/animation.md#labels-wait-for-their-arrow.
    const shownWith = (obj) => () => !obj || obj.visible !== false;
    // Shown only while -v itself is: at rest it is hidden, and so is this.
    const negatedLabel = negatedV
      ? [{ anchor:'negTip', name: '\u2212' + vLabel, value: fmt(vVal.clone().negate()), distanceFactor:8, offset:[0.12,0.12,0], color: operandBColor, revealed: () => negatedV.visible === true && !negatedV.userData.fadingOut }]
      : [];
    group.userData.labels = isPointDifference
      ? [
        { anchor:'rTip', name: pointDifferenceLabel, value: fmt(res), distanceFactor:8, offset:[0.12,0.12,0], color: resultColor, revealed: shownWith(resObj) },
      ]
      : showOperandLabels
        ? [
        // An operand we left to its owner is already labelled by it.
        ...(uOwnerGlyphs ? [] : [{ anchor:'uTip', name: uLabel, value: fmt(uVal), distanceFactor:8, offset:[0.12,0.12,0], color: operandAColor, revealed: shownWith(arrowU) }]),
        // Identical operands share a tip, so stack the second label below it.
        ...(vOwnerGlyphs ? [] : [{ anchor:'vTip', name: vLabel, value: fmt(vVal), distanceFactor:8, offset: operandsIdentical ? [0.12,-0.16,0] : [0.12,0.12,0], color: operandBColor, revealed: shownWith(arrowV || arrowU) }]),
        { anchor:'rTip', name: genericResultLabel, value: fmt(res), distanceFactor:8, offset:[0.12,0.12,0], color: resultColor, revealed: shownWith(resObj) },
        ...negatedLabel,
      ]
        : [
        { anchor:'rTip', name: genericResultLabel, value: fmt(res), distanceFactor:8, offset:[0.12,0.12,0], color: resultColor, revealed: shownWith(resObj) },
        ...negatedLabel,
      ];

    // Staged reveal for the play/scrub transport (AnimationDriver): grow the
    // operands from their anchors, then the result -- exactly the arrangement
    // drawn above, uncovered in sequence. Socket order is not reveal order: an
    // operand carrying a "from point:" tail hangs off the other one's tip, and
    // has to grow after it rather than out of a point in mid-air.
    // See docs/architecture/animation.md#reveal-order-follows-the-tails.
    const orderParts = window.orderRevealParts || ((p) => p);
    // An operand we left to its owner still gets its stage. Where the owner
    // knows how to reveal itself (Scale Vector: v, then k\u00b7v) the slot is
    // handed to that closure, so its whole picture builds inside this one --
    // otherwise the slot just grows the owner's arrow. Either way the scene
    // starts empty and builds from the origin out.
    const ownerReveal = (value) => {
      const owner = window.threeObjStore?.[value.userData?.glyph?.blockId];
      const animate = owner?.userData?.animate;
      return typeof animate === 'function' ? animate : null;
    };
    const operandStage = (arrow, ownerObjs, value, anchor, full) => {
      const where = { anchor: anchor.toArray(), tip: anchor.clone().add(value).toArray() };
      if (arrow) return [{ obj: arrow, full, ...where }];
      const animate = ownerReveal(value);
      if (animate) return [{ animate, ...where }];
      return ownerObjs?.length ? [{ objs: ownerObjs, full, ...where }] : [];
    };
    const operandParts = orderParts([
      ...operandStage(arrowU, uOwnerGlyphs, uVal, uAnchor, safeLen(lenU)),
      ...operandStage(arrowV, vOwnerGlyphs, vVal, vAnchor, safeLen(lenV))
        .map((part) => ({ ...part, isSubtrahend: true })),
    ]);
    const resultStage = { obj: resObj, full: lenR > 1e-8 ? safeLen(lenR) : 0 };
    // -v grows in v's own slot, however v is revealed (its arrow, or an owner's
    // closure), so the two appear together.
    const revealParts = negatedV
      ? operandParts.map((part) => {
        if (!part.isSubtrahend) return part;
        const own = window.makeStagedVectorReveal([part]);
        const withNegated = (progress, ease) => {
          own(progress, ease);
          const ez = typeof ease === 'function' ? ease : (t) => t;
          negatedV.userData.setVectorLength?.(safeLen(lenV) * ez(progress));
          negatedV.visible = progress > 1e-3;
        };
        withNegated.stages = own.stages;
        withNegated.durationScale = own.durationScale;
        return { animate: withNegated, anchor: part.anchor, tip: part.tip };
      })
      : operandParts;

    // P - Q: P and Q grow from the origin, then the difference grows there too,
    // as the free vector it is, and slides over to run from Q to P where it
    // rests. The guides go at progress 1, leaving the static scene.
    // See docs/architecture/animation.md#subtraction-shows-the-negative.
    let pointDifferenceReveal = null;
    if (isPointDifference) {
      const guides = [[arrowU, lenU], [arrowV, lenV]].filter(([guide, len]) => guide && len > 1e-8);
      const resultFull = lenR > 1e-8 ? safeLen(lenR) : 0;
      const canSlide = resultFull > 0 && typeof resObj.userData?.setVectorSegment === 'function';
      const resultDirection = lenR > 1e-8 ? res.clone().normalize() : new THREE.Vector3(1, 0, 0);
      const labelLift = resultLabelPosition.clone().sub(resultOrigin.clone().add(resultTip).multiplyScalar(0.5));
      const restingLabel = group.userData.labelAnchors.rTip.position.slice();
      const slots = guides.length + (canSlide ? 2 : 1);
      pointDifferenceReveal = (progress, ease) => {
        const ez = typeof ease === 'function' ? ease : (t) => t;
        const local = (i) => Math.max(0, Math.min(1, progress * slots - i));
        guides.forEach(([guide, len], i) => {
          guide.userData.setVectorLength?.(len * ez(local(i)));
          guide.visible = progress < 1 && local(i) > 1e-3;
        });
        const grow = local(guides.length);
        resObj.visible = resultFull === 0 || grow > 1e-3;
        if (!canSlide) {
          if (resultFull > 0) resObj.userData.setVectorLength?.(resultFull * ez(grow));
          return;
        }
        const start = origin.clone().lerp(resultOrigin, ez(local(guides.length + 1)));
        const length = resultFull * ez(grow);
        resObj.userData.setVectorSegment(start, resultDirection, length);
        const mid = start.clone().addScaledVector(resultDirection, length / 2).add(labelLift);
        group.userData.labelAnchors.rTip.position = progress >= 1 ? restingLabel.slice() : [mid.x, mid.y, mid.z];
      };
      pointDifferenceReveal.stages = slots;
    }
    // The last two slots hold -v against the finished result for a moment, then
    // fade it out slowly.
    // It is the only thing that sets -v's opacity, and it runs every frame with
    // its own progress (0 before its turn), so scrubbing back restores it.
    const NEGATED_HOLD = 0.2;
    const holdNegated = (progress) => {
      if (!negatedV) return;
      const fade = Math.max(0, Math.min(1, (progress - NEGATED_HOLD) / (1 - NEGATED_HOLD)));
      negatedV.userData.setGlyphOpacity?.(1 - fade);
      negatedV.userData.fadingOut = fade > 0.5;
    };
    holdNegated.stages = 2;
    const staged = window.makeStagedVectorReveal(
      isPointDifference
        ? [{ animate: pointDifferenceReveal }]
        : [...revealParts, resultStage, ...(negatedV ? [{ animate: holdNegated }] : [])]
    );
    // -v goes once the result is up. Progress 1 is also the last frame of any
    // consumer's slot this reveal is handed, so it goes there too.
    group.userData.animate = negatedV
      ? Object.assign((progress, ease) => {
        staged(progress, ease);
        if (progress >= 1) {
          negatedV.visible = false;
          negatedV.userData.setGlyphOpacity?.(1);
          negatedV.userData.fadingOut = false;
        }
      }, {
        stages: staged.stages,
        // The second fade slot is extra time, not a squeeze on the others: scale
        // the run so every other slot keeps the length it had with one.
        durationScale: staged.durationScale * (staged.stages / (staged.stages - 1)),
      })
      : staged;

    // Register
    if (typeof threeObjStore==='object' && threeObjStore) {
      const base = ${JSON.stringify(block.id)};
      if (!isPointDifference) {
        if (arrowU) threeObjStore[base + '_u'] = arrowU;
        if (arrowV) threeObjStore[base + '_v'] = arrowV;
      }
      threeObjStore[base + '_r'] = resObj;
      threeObjStore[base]        = group;
    }
    const resultVector = res.clone();
    if (isPointDifference) {
      resultVector.userData = {
        geoType: 'point_difference_vector',
        // Which block drew the point this difference starts from, so a
        // downstream sweep can move that marker. This userData is assigned
        // wholesale, so it has to be carried explicitly or it is lost here.
        startBlockId: vVal.userData?.srcBlockId ?? null,
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
    // Lets a consumer hand its animation stage to this block's own reveal
    // instead of growing a copy of the result. Carries no anchor on purpose:
    // an anchor is what switches on vectorArithmetic's coincident-copy
    // suppression, a separate decision from whether a reveal can be delegated.
    resultVector.userData = resultVector.userData || {};
    resultVector.userData.glyph = { blockId: ${JSON.stringify(block.id)} };
    return resultVector;
  })()`

    return [code, Order.FUNCTION_CALL]
  }
}
