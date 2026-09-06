import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { isEffectivelyStandalone } from '@/utils/sceneHelpers'

const OPERATORS = Object.freeze({
  add: {
    label: 'a + b',
    symbol: '+',
    fn: '(a, b) => a + b',
  },
  subtract: {
    label: 'a - b',
    symbol: '-',
    fn: '(a, b) => a - b',
  },
  multiply: {
    label: 'a x b',
    symbol: 'x',
    fn: '(a, b) => a * b',
  },
  divide: {
    label: 'a / b',
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
      this.appendDummyInput().appendField('Scalar Arithmetic')
      this.appendValueInput('A').setCheck(['scalar', 'obj3D']).appendField('a:')
      this.appendValueInput('B')
        .setCheck(['scalar', 'obj3D'])
        .appendField(
          new Blockly.FieldDropdown(Object.entries(OPERATORS).map(([value, { label }]) => [label, value])),
          'OP',
        )
        .appendField('b:')
      this.setInputsInline(true)
      this.setOutput(true, 'scalar')
      this.setStyle(BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS)
      this.setTooltip('Compute with two scalar values. Also accepts visual scalar results like Vector Magnitude.')
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
      bVal > 0
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
    ${isStandalone && hasCompleteInputs ? `
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
      Object.values(window.threeObjStore || {}).forEach((object) => {
        object?.traverse?.((child) => {
          if (
            child.userData?.geoType === 'sphere_distance_candidate_highlight' &&
            sameSegment(child.userData.start, child.userData.end, resultMeta.originalStart, resultMeta.originalEnd)
          ) {
            child.visible = false;
          }
        });
        if (
          object.userData?.geoType === 'geo_vector_magnitude' &&
          sameSegment(object.userData.start, object.userData.end, resultMeta.originalStart, resultMeta.originalEnd)
        ) {
          object.visible = false;
          object.userData.labels = [];
          object.userData.labelAnchors = {};
        }
        // the raw point-difference arrow (Vector Arithmetic) always renders, even when
        // it only feeds a further computation -- hide it once its distance is finalized
        if (
          object.userData?.geoType === 'geo_vector_group' &&
          sameSegment(object.userData.start, object.userData.end, resultMeta.originalStart, resultMeta.originalEnd)
        ) {
          object.visible = false;
          object.userData.labels = [];
          object.userData.labelAnchors = {};
        }
      });
      const distanceVector = resultMeta.end.clone().sub(resultMeta.start);
      const distanceLength = distanceVector.length();
      const distanceMid = resultMeta.start.clone().add(resultMeta.end).multiplyScalar(0.5);
      const highlightYellow = '#facc15';
      let distanceHighlight;
      if (distanceLength > 1e-8) {
        distanceHighlight = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.055, distanceLength, 24),
          new THREE.MeshBasicMaterial({ color: highlightYellow, transparent: true, opacity: 0.96, depthWrite: false })
        );
        distanceHighlight.position.copy(distanceMid);
        distanceHighlight.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), distanceVector.normalize());
      } else {
        distanceHighlight = new THREE.Mesh(
          new THREE.SphereGeometry(0.07, 18, 12),
          new THREE.MeshStandardMaterial({ color: highlightYellow, roughness: 0.35, metalness: 0.05 })
        );
        distanceHighlight.userData.zoomInvariantRadius = 0.07;
        distanceHighlight.userData.zoomInvariantUniform = true;
        distanceHighlight.position.copy(distanceMid);
      }
      distanceHighlight.userData.geoType = 'distance_segment';
      distanceHighlight.userData.srcBlockId = ${blockId};
      group.add(distanceHighlight);
    }
    const labelPosition = group.userData.start?.isVector3 && group.userData.end?.isVector3
      ? group.userData.start.clone().add(group.userData.end).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.35, 0))
      : new THREE.Vector3(0, 0.8, 0);
    group.userData.labelAnchors = {
      result: { type: 'world', position: [labelPosition.x, labelPosition.y, labelPosition.z] },
    };
    group.userData.labels = [
      {
        anchor: 'result',
        text: resultMeta.trimCount >= 2
          ? 'd = ' + Number(safeResult.toFixed(3))
          : Number(aVal.toFixed(3)) + ' ${OPERATORS[op].symbol} ' + Number(bVal.toFixed(3)) + ' = ' + Number(safeResult.toFixed(3)),
        distanceFactor: 8,
        offset: [0, 0, 0],
        emphasis: true,
        className: 'distance-highlight-label',
        color: '#facc15',
      },
    ];
    if (typeof threeObjStore === 'object' && threeObjStore) threeObjStore[${blockId}] = group;
    ` : ''}
    return boxedResult;
  })()`

    return [code, Order.FUNCTION_CALL]
  }
}

export default initScalarArithmeticBlock
