import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { isEffectivelyStandalone } from '@/utils/sceneHelpers'
import { alignRowsByInput } from '@/components/BlocksCanvas/renderers/geoScratchRenderer'

const OPERATORS = Object.freeze({
  add: {
    label: '+',
    symbol: '+',
    fn: '(a, b) => a + b',
  },
  subtract: {
    label: '−',
    symbol: '-',
    fn: '(a, b) => a - b',
  },
  multiply: {
    label: '×',
    symbol: 'x',
    fn: '(a, b) => a * b',
  },
  divide: {
    label: '÷',
    symbol: '/',
    fn: '(a, b) => (Math.abs(b) > 1e-12 ? a / b : 0)',
  },
})

let REGISTERED = false

export function initScalarArithmeticBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.scalar_arithmetic = {
    init() {
      // Operand, operator, operand, a row each, so a long left operand (a whole
      // |VB - VA|) does not push the right one off to the side. Same end-row layout as Vector
      // Magnitude; see docs/architecture/blockly-integration.md#operator-input-layout.
      this.appendEndRowInput('ARITHMETIC_TITLE').appendField('Scalar Arithmetic')
      const centre = Blockly.inputs.Align.CENTRE
      this.appendValueInput('A').setCheck(['scalar', 'obj3D']).setAlign(centre)
      this.appendEndRowInput('ARITHMETIC_A_ROW_END').setAlign(centre)
      this.appendEndRowInput('ARITHMETIC_OP_ROW')
        .setAlign(centre)
        .appendField(
          new Blockly.FieldDropdown(
            Object.entries(OPERATORS).map(([value, { label }]) => [label, value]),
          ),
          'OP',
        )
      this.appendValueInput('B').setCheck(['scalar', 'obj3D']).setAlign(centre)
      this.appendEndRowInput('ARITHMETIC_B_ROW_END').setAlign(centre)
      this.setInputsInline(true)
      // Centred under the title, so the rows read as one expression.
      alignRowsByInput(this)
      this.setOutput(true, 'scalar')
      this.setStyle(BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS)
      this.setTooltip(
        'Compute with two scalar values. Also accepts visual scalar results like Vector Magnitude.',
      )
      this.setDeletable(true)
      this.setMovable(true)
    },
  }

  javascriptGenerator.forBlock.scalar_arithmetic = function (block, generator) {
    const op = OPERATORS[block.getFieldValue('OP')] ? block.getFieldValue('OP') : 'add'
    const hasCompleteInputs = !!block.getInputTargetBlock('A') && !!block.getInputTargetBlock('B')
    const a = generator.valueToCode(block, 'A', Order.FUNCTION_CALL) || '0'
    const b = generator.valueToCode(block, 'B', Order.FUNCTION_CALL) || '0'
    const blockId = JSON.stringify(block.id)
    const isStandalone = isEffectivelyStandalone(block)
    // A distance with nothing subtracted yet still draws its bar, full length, so
    // the answer shows (wrong) from the moment the subtraction is started.
    const startsFromDistance = op === 'subtract' && !!block.getInputTargetBlock('A')

    const code = `(function(){
    const rawA = ${a};
    const rawB = ${b};
    const scalarValue = (value) => {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      const numericValue = Number(value);
      if (Number.isFinite(numericValue)) return numericValue;
      if (value?.isObject3D) {
        const fromDistance = Number(value.userData?.distance);
        if (Number.isFinite(fromDistance)) return fromDistance;
        const fromLength = Number(value.userData?.length);
        if (Number.isFinite(fromLength)) return fromLength;
        const fromValue = Number(value.userData?.value);
        if (Number.isFinite(fromValue)) return fromValue;
      }
      return 0;
    };
    const scalarMeta = (value) => {
      if (value?.userData) return value.userData;
      return null;
    };
    const aVal = scalarValue(rawA);
    const bVal = scalarValue(rawB);
    const result = (${OPERATORS[op].fn})(aVal, bVal);
    const safeResult = Number.isFinite(result) ? result : 0;
    const aMeta = scalarMeta(rawA);
    const resultMeta = {
      geoType: 'scalar_value',
      value: safeResult,
      distance: safeResult,
      subtractedValues: Array.isArray(aMeta?.subtractedValues) ? [...aMeta.subtractedValues] : [],
    };
    if (
      ${JSON.stringify(op)} === 'subtract' &&
      aMeta?.start?.isVector3 &&
      aMeta?.end?.isVector3 &&
      bVal >= 0
    ) {
      const samePoint = (p, q) => p?.isVector3 && q?.isVector3 && p.distanceTo(q) <= 1e-5;
      const originalStart = aMeta.originalStart?.isVector3 ? aMeta.originalStart.clone() : aMeta.start.clone();
      const originalEnd = aMeta.originalEnd?.isVector3 ? aMeta.originalEnd.clone() : aMeta.end.clone();
      const directionVector = originalEnd.clone().sub(originalStart);
      const sourceLength = directionVector.length();
      if (sourceLength > 1e-8) {
        const direction = directionVector.normalize();
        const spheres = Object.values(window.threeObjStore || {}).filter((object) => (
          object?.userData?.geoType === 'geo_sphere' &&
          object.userData?.centre?.isVector3 &&
          Number.isFinite(Number(object.userData?.radius))
        ));
        const radiusMatches = (sphere) => Math.abs(Number(sphere.userData.radius) - bVal) <= 1e-5;
        const endpointSphere = (point) => spheres.find((sphere) => samePoint(sphere.userData.centre, point)) || null;
        const startSphere = endpointSphere(originalStart);
        const endSphere = endpointSphere(originalEnd);
        const startRadius = Number(startSphere?.userData?.radius);
        const endRadius = Number(endSphere?.userData?.radius);
        const startSphereMatches = spheres.some((sphere) => samePoint(sphere.userData.centre, originalStart) && radiusMatches(sphere));
        const endSphereMatches = spheres.some((sphere) => samePoint(sphere.userData.centre, originalEnd) && radiusMatches(sphere));
        // e.g. |B - A| - (rA + rB) in one step: bVal is the combined sum, not either single radius.
        const combinedRadiusMatches = (
          Number.isFinite(startRadius) &&
          Number.isFinite(endRadius) &&
          Math.abs(startRadius + endRadius - bVal) <= 1e-5
        );
        const subtractedValues = combinedRadiusMatches
          ? (Array.isArray(aMeta.subtractedValues) ? [...aMeta.subtractedValues, startRadius, endRadius] : [startRadius, endRadius])
          : (Array.isArray(aMeta.subtractedValues) ? [...aMeta.subtractedValues, bVal] : [bVal]);
        const hasSubtractedRadius = (radius) => (
          Number.isFinite(radius) &&
          subtractedValues.some((value) => Math.abs(Number(value) - radius) <= 1e-5)
        );
        let trimStart = Number(aMeta.trimStart) || 0;
        let trimEnd = Number(aMeta.trimEnd) || 0;
        if (hasSubtractedRadius(startRadius) && hasSubtractedRadius(endRadius)) {
          trimStart = startRadius;
          trimEnd = endRadius;
        } else if (combinedRadiusMatches) {
          trimStart += startRadius;
          trimEnd += endRadius;
        } else if (startSphereMatches && !endSphereMatches) {
          trimStart += bVal;
        } else if (endSphereMatches && !startSphereMatches) {
          trimEnd += bVal;
        } else {
          const trimCount = Number(aMeta.trimCount) || 0;
          if (trimCount === 0) trimStart += bVal;
          else trimEnd += bVal;
        }
        let start = originalStart.clone().addScaledVector(direction, trimStart);
        let end = originalEnd.clone().addScaledVector(direction, -trimEnd);
        if (end.clone().sub(start).dot(direction) < 0) {
          const midpoint = start.clone().add(end).multiplyScalar(0.5);
          start = midpoint.clone();
          end = midpoint.clone();
        }
        resultMeta.start = start.clone();
        resultMeta.end = end.clone();
        resultMeta.originalStart = originalStart.clone();
        resultMeta.originalEnd = originalEnd.clone();
        resultMeta.trimStart = trimStart;
        resultMeta.trimEnd = trimEnd;
        resultMeta.trimCount = (Number(aMeta.trimCount) || 0) + 1;
        resultMeta.subtractedValues = subtractedValues;
      }
    }
    const boxedResult = Object(safeResult);
    boxedResult.userData = resultMeta;
    ${
      isStandalone && (hasCompleteInputs || startsFromDistance)
        ? `
    if (${hasCompleteInputs} || resultMeta.start?.isVector3) {
    const group = new THREE.Group();
    group.userData.geoType = 'scalar_arithmetic_result';
    group.userData.srcBlockId = ${blockId};
    group.userData.value = safeResult;
    group.userData.distance = safeResult;
    if (resultMeta.start?.isVector3 && resultMeta.end?.isVector3) {
      group.userData.start = resultMeta.start.clone();
      group.userData.end = resultMeta.end.clone();
      const samePoint = (p, q) => p?.isVector3 && q?.isVector3 && p.distanceTo(q) <= 1e-5;
      const sameSegment = (startA, endA, startB, endB) => (
        (samePoint(startA, startB) && samePoint(endA, endB)) ||
        (samePoint(startA, endB) && samePoint(endA, startB))
      );
      // The answer bar replaces the centre-to-centre working (the difference
      // arrow and the magnitude's bar) at rest. The working stays in the scene,
      // hidden, for this block's animation to play.
      // See docs/architecture/animation.md#the-answer-plays-its-working.
      let showWorking = false;
      let differenceFaded = false;
      const candidates = [];
      const working = [];
      let magnitude = null;
      let difference = null;
      const gateLabel = (object) => (label) => {
        const revealed = label.revealed;
        return Object.assign({}, label, {
          revealed: () =>
            showWorking &&
            !(object === difference && differenceFaded) &&
            (typeof revealed === 'function' ? revealed() : true),
        });
      };
      const hideAtRest = (object) => {
        object.visible = false;
        working.push(object);
        object.userData.labels = (object.userData.labels || []).map(gateLabel(object));
      };
      Object.values(window.threeObjStore || {}).forEach((object) => {
        object?.traverse?.((child) => {
          if (
            child.userData?.geoType === 'sphere_distance_candidate_highlight' &&
            sameSegment(child.userData.start, child.userData.end, resultMeta.originalStart, resultMeta.originalEnd)
          ) {
            child.visible = false;
            candidates.push(child);
          }
        });
        if (
          object.userData?.geoType === 'geo_vector_magnitude' &&
          sameSegment(object.userData.start, object.userData.end, resultMeta.originalStart, resultMeta.originalEnd)
        ) {
          hideAtRest(object);
          magnitude = object;
        }
        if (
          object.userData?.geoType === 'geo_vector_group' &&
          sameSegment(object.userData.start, object.userData.end, resultMeta.originalStart, resultMeta.originalEnd)
        ) {
          // Only B - A gives way to the bar: position vectors the student
          // built (a measured vector difference) stay.
          difference = object;
          const differenceArrow = window.threeObjStore[object.userData.srcBlockId + '_r'];
          if (differenceArrow) differenceArrow.visible = false;
          object.userData.labels = (object.userData.labels || []).map((label) => (
            label.anchor === 'rTip' ? gateLabel(object)(label) : label
          ));
        }
      });
      // Which radius belongs at which end needs the spheres, and the stack that
      // builds them may run after this one, so the bar is built after the run.
      // See docs/architecture/generated-code-runtime.md#after-run.
      const buildAnswerBar = () => {
        const spheres = Object.values(window.threeObjStore || {}).filter((object) => (
          object?.userData?.geoType === 'geo_sphere' &&
          object.userData?.centre?.isVector3 &&
          Number.isFinite(Number(object.userData?.radius))
        ));
        const radiusAt = (point) => Number(
          spheres.find((sphere) => samePoint(sphere.userData.centre, point))?.userData?.radius
        );
        const fullStart = resultMeta.originalStart.clone();
        const fullEnd = resultMeta.originalEnd.clone();
        const startRadius = radiusAt(fullStart);
        const endRadius = radiusAt(fullEnd);
        const subtracted = resultMeta.subtractedValues || [];
        const total = subtracted.reduce((sum, value) => sum + (Number(value) || 0), 0);
        const wasSubtracted = (radius) => (
          Number.isFinite(radius) &&
          subtracted.some((value) => Math.abs(Number(value) - radius) <= 1e-5)
        );
        let trimStart = Number(resultMeta.trimStart) || 0;
        let trimEnd = Number(resultMeta.trimEnd) || 0;
        if (
          (wasSubtracted(startRadius) && wasSubtracted(endRadius)) ||
          (Number.isFinite(startRadius) && Number.isFinite(endRadius) && wasSubtracted(startRadius + endRadius))
        ) {
          trimStart = startRadius;
          trimEnd = endRadius;
        } else if (wasSubtracted(startRadius)) {
          trimStart = startRadius;
          trimEnd = total - startRadius;
        } else if (wasSubtracted(endRadius)) {
          trimStart = total - endRadius;
          trimEnd = endRadius;
        }
        const direction = fullEnd.clone().sub(fullStart).normalize();
        let barStart = fullStart.clone().addScaledVector(direction, trimStart);
        let barEnd = fullEnd.clone().addScaledVector(direction, -trimEnd);
        if (barEnd.clone().sub(barStart).dot(direction) < 0) {
          const middle = barStart.clone().add(barEnd).multiplyScalar(0.5);
          barStart = middle.clone();
          barEnd = middle.clone();
        }
        group.userData.start = barStart.clone();
        group.userData.end = barEnd.clone();

        const distanceMid = barStart.clone().add(barEnd).multiplyScalar(0.5);
        const distanceColor = window.GeoScratchColors.forRole('distance');
        // A finite line, so it follows the line settings; built at its resting
        // span and re-spanned by the animation.
        // See docs/architecture/vector-line-glyphs.md#finite-segments.
        let distanceHighlight = window.geoLineSegment(
          barStart.clone(), barEnd.clone(), ${blockId} + '_distance', distanceColor
        );
        if (!distanceHighlight) {
          distanceHighlight = window.geoPointMarker({ color: distanceColor, radius: 0.06, widthSegments: 18 });
          distanceHighlight.position.copy(distanceMid);
        }
        distanceHighlight.userData.geoType = 'distance_segment';
        distanceHighlight.userData.srcBlockId = ${blockId};
        group.add(distanceHighlight);
        group.userData.answerBar = distanceHighlight;

        // Plays the working, fades the difference arrow, then shows the bar at
        // the full centre distance -- wrong, so it glows red -- and shrinks it by
        // the subtracted radii to the answer.
        // See docs/architecture/animation.md#the-answer-plays-its-working.
        const inner = typeof magnitude?.userData?.animate === 'function' ? magnitude.userData.animate : null;
        const innerStages = Math.max(1, Number(inner?.stages) || 1);
        const slots = innerStages + 2;
        const differenceArrow = difference ? window.threeObjStore[difference.userData.srcBlockId + '_r'] : null;
        const placeBar = (start, end) => distanceHighlight.userData.setSegment?.(start, end);
        const BAR_HOLD = 0.35;
        const animate = (progress, ease) => {
          const p = Math.max(0, Math.min(1, progress));
          const ez = typeof ease === 'function' ? ease : (t) => t;
          const resting = p >= 1;
          const local = (i) => Math.max(0, Math.min(1, p * slots - i));
          showWorking = !resting;
          working.forEach((object) => {
            object.visible = !resting;
          });
          if (inner) inner(resting ? 1 : Math.min(1, (p * slots) / innerStages), ease);
          const fade = resting ? 1 : local(innerStages);
          differenceArrow?.userData?.setGlyphOpacity?.(resting ? 1 : 1 - fade);
          if (resting && differenceArrow) differenceArrow.visible = false;
          differenceFaded = fade > 0.5;
          const barLocal = resting ? 1 : local(innerStages + 1);
          const barShown = resting || barLocal > 0;
          candidates.forEach((candidate) => {
            if (barShown) candidate.visible = false;
          });
          const trim = ez(Math.max(0, Math.min(1, (barLocal - BAR_HOLD) / (1 - BAR_HOLD))));
          placeBar(fullStart.clone().lerp(barStart, trim), fullEnd.clone().lerp(barEnd, trim));
          distanceHighlight.visible = barShown;
          // Read by AnswerTint: the untrimmed bar is not the answer yet.
          distanceHighlight.userData.answerStateOverride = resting
            ? null
            : !barShown
              ? 'none'
              : trim < 1
                ? 'incorrect'
                : null;
        };
        animate.stages = slots;
        // A base duration per stage, like one pipeline step, rather than the
        // whole derivation squeezed into one base duration.
        animate.durationScale = Math.max(Number(inner?.durationScale) || 1, slots);
        group.userData.animate = animate;

        const labelPosition = distanceMid.clone().add(new THREE.Vector3(0, 0.35, 0));
        group.userData.labelAnchors = {
          result: { type: 'world', position: [labelPosition.x, labelPosition.y, labelPosition.z] },
        };
      };
      if (typeof window.geoAfterRun === 'function') window.geoAfterRun(buildAnswerBar);
      else buildAnswerBar();
    }
    if (!group.userData.labelAnchors) {
      group.userData.labelAnchors = { result: { type: 'world', position: [0, 0.8, 0] } };
    }
    group.userData.labels = [
      {
        anchor: 'result',
        text: resultMeta.trimCount >= 2
          ? 'd = ' + Number(safeResult.toFixed(3))
          : Number(aVal.toFixed(3)) + ' ${OPERATORS[op].symbol} ' + Number(bVal.toFixed(3)) + ' = ' + Number(safeResult.toFixed(3)),
        distanceFactor: 8,
        offset: [0, 0, 0],
        emphasis: true,
        role: 'distance',
        color: window.GeoScratchColors.forRole('distance'),
        // Waits for the bar to reach the answer, so it never contradicts its glow.
        revealed: () => {
          const bar = group.userData.answerBar;
          return !bar || (bar.visible !== false && !bar.userData.answerStateOverride);
        },
      },
    ];
    if (typeof threeObjStore === 'object' && threeObjStore) threeObjStore[${blockId}] = group;
    }
    `
        : ''
    }
    return boxedResult;
  })()`

    return [code, Order.FUNCTION_CALL]
  }
}

export default initScalarArithmeticBlock
