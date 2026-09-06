import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

let REGISTERED = false

export function initVectorMagnitude() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['vector_magnitude'] = {
    init() {
      this.appendDummyInput().appendField('Vector Magnitude')
      this.appendValueInput('V').setCheck('vector3').appendField('j:')
      this.setInputsInline(true)
      this.setOutput(true, 'obj3D')
      this.setStyle(BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS)
      this.setTooltip('Render j and show its vector magnitude / length')
      this.setDeletable(true)
      this.setMovable(true)
    },
  }

  javascriptGenerator.forBlock['vector_magnitude'] = function (block, g) {
    const v = g.valueToCode(block, 'V', Order.FUNCTION_CALL) || 'null'

    const code = `(function () {
    const vVal = ${v};
    if (!vVal || !vVal.isVector3) return null;

    const len = vVal.length();
    const isPointPlaneProjection = vVal.userData?.geoType === 'point_plane_distance_projection_vector';
    const isPointDifference = vVal.userData?.geoType === 'point_difference_vector';
    const valueLabel = vectorNotation.getLabel(vVal, 'j');
    const safeLen = (x) => (Number.isFinite(x) && x > 0 ? x : 1);
    const baseId = ${JSON.stringify(block.id)};
    const usesPlacedVector = (isPointPlaneProjection || isPointDifference) && vVal.userData.start?.isVector3;
    const arrowOrigin = usesPlacedVector
      ? vVal.userData.start.clone()
      : new THREE.Vector3(0,0,0);
    const arrowTip = (isPointPlaneProjection || isPointDifference) && vVal.userData.end?.isVector3
      ? vVal.userData.end.clone()
      : vVal.clone();

    const operandAColor = window.GeoScratchColors.forRole('operandA');
    const distanceColor = window.GeoScratchColors.forRole('distance');
    const warningColor = window.GeoScratchColors.forRole('warning');
    const isPointToPointDistance = isPointDifference && vVal.userData?.pointToPoint;

    // Render vector as arrow, or sphere if zero-length
    let obj;
    if (len > 1e-8) {
      obj = window.buildVectorShaftGlyph(
        THREE, baseId + '_v', arrowOrigin.clone(), vVal.clone().normalize(), safeLen(len),
        isPointPlaneProjection ? distanceColor : operandAColor
      );
    } else {
      obj = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 16, 12),
        new THREE.MeshStandardMaterial({ color: warningColor, roughness: 0.4, metalness: 0.1 })
      );
      obj.userData.zoomInvariantRadius = 0.04;
      obj.userData.zoomInvariantUniform = true;
    }

    // Group wrapper
    const group = new THREE.Group();
    if (!isPointPlaneProjection && !isPointToPointDistance) group.add(obj);
    if (isPointToPointDistance && len > 1e-8) {
      const distanceVector = arrowTip.clone().sub(arrowOrigin);
      const highlight = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, len, 24),
        new THREE.MeshBasicMaterial({ color: '#facc15', transparent: true, opacity: 0.9, depthWrite: false })
      );
      highlight.position.copy(arrowOrigin.clone().add(arrowTip).multiplyScalar(0.5));
      highlight.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), distanceVector.normalize());
      highlight.userData.geoType = 'sphere_distance_candidate_highlight';
      highlight.userData.srcBlockId = ${JSON.stringify(block.id)};
      highlight.userData.start = arrowOrigin.clone();
      highlight.userData.end = arrowTip.clone();
      group.add(highlight);
    }

    // Metadata
    group.userData.geoType = isPointPlaneProjection
      ? 'point_plane_distance_projection_magnitude'
      : 'geo_vector_magnitude';
    group.userData.srcBlockId = ${JSON.stringify(block.id)};
    group.userData.input = vVal.clone();
    group.userData.length = len;
    if (isPointDifference) {
      group.userData.start = arrowOrigin.clone();
      group.userData.end = arrowTip.clone();
    }
    if (isPointPlaneProjection) group.userData.distance = len;

    // Label: only one line -> "length of <name> = <len>"
    const tip = (len > 1e-8) ? arrowTip.clone() : arrowOrigin.clone();
    const distanceMid = arrowOrigin.clone().add(arrowTip).multiplyScalar(0.5);
    const distanceLabelPosition = isPointPlaneProjection && vVal.userData.labelSide?.isVector3
      ? distanceMid.clone().addScaledVector(vVal.userData.labelSide, 0.36)
      : distanceMid.clone();
    const fmtLen = Number(len.toFixed(3));
    group.userData.labelAnchors = {
      tip: { type: 'world', position: [tip.x, tip.y, tip.z] },
      distanceMid: { type: 'world', position: [distanceLabelPosition.x, distanceLabelPosition.y, distanceLabelPosition.z] },
    };
    group.userData.labels = [
      {
        anchor: isPointPlaneProjection || isPointToPointDistance ? 'distanceMid' : 'tip',
        text: isPointPlaneProjection
          ? 'd = ' + fmtLen
          : isPointToPointDistance
            ? 'center distance = ' + fmtLen
          : '|' + valueLabel + '| = ' + fmtLen,
        distanceFactor: isPointPlaneProjection || isPointToPointDistance ? 6 : 8,
        offset: isPointPlaneProjection || isPointToPointDistance ? [0, 0, 0] : [0.12, 0.12, 0],
        emphasis: isPointPlaneProjection || isPointToPointDistance,
        className: isPointPlaneProjection || isPointToPointDistance ? 'distance-highlight-label' : undefined,
        color: isPointToPointDistance
          ? '#facc15'
          : (!isPointPlaneProjection && len > 1e-8) ? operandAColor : undefined,
      },
    ];

    if (typeof threeObjStore === 'object' && threeObjStore) {
      if (!isPointPlaneProjection && !isPointToPointDistance) threeObjStore[baseId + '_v'] = obj;
      threeObjStore[baseId] = group;
    }
    return group;
  })()`

    return [code, Order.FUNCTION_CALL]
  }
}
