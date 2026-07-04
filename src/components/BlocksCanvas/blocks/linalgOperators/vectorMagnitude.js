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
    // Optional name field on the block; fallback to 'v'
    const name = 'j';
    const v = g.valueToCode(block, 'V', Order.FUNCTION_CALL) || 'null';

    const code = `(function () {
    const vVal = ${v};
    if (!vVal || !vVal.isVector3) return null;

    const len = vVal.length();
    const isPointPlaneProjection = vVal.userData?.geoType === 'point_plane_distance_projection_vector';
    const safeLen = (x) => (Number.isFinite(x) && x > 0 ? x : 1);
    const headLenRatio = 0.25, headWidthRatio = 0.10;
    const arrowOrigin = isPointPlaneProjection && vVal.userData.start?.isVector3
      ? vVal.userData.start.clone()
      : new THREE.Vector3(0,0,0);
    const arrowTip = isPointPlaneProjection && vVal.userData.end?.isVector3
      ? vVal.userData.end.clone()
      : vVal.clone();

    // Render vector as arrow, or sphere if zero-length
    let obj;
    if (len > 1e-8) {
      obj = new THREE.ArrowHelper(
        vVal.clone().normalize(),
        arrowOrigin.clone(),
        safeLen(len),
        isPointPlaneProjection ? 0xfacc15 : 0x0ea5e9,
        headLenRatio,
        headWidthRatio
      );
    } else {
      obj = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.4, metalness: 0.1 })
      );
    }

    // Group wrapper
    const group = new THREE.Group();
    group.add(obj);

    // Metadata
    group.userData.geoType = isPointPlaneProjection
      ? 'point_plane_distance_projection_magnitude'
      : 'geo_vector_magnitude';
    group.userData.srcBlockId = ${JSON.stringify(block.id)};
    group.userData.input = vVal.clone();
    group.userData.length = len;
    if (isPointPlaneProjection) group.userData.distance = len;

    // Label: only one line -> "length of <name> = <len>"
    const tip = (len > 1e-8) ? arrowTip.clone() : arrowOrigin.clone();
    const fmtLen = Number(len.toFixed(3));
    group.userData.labelAnchors = {
      tip: { type: 'world', position: [tip.x, tip.y, tip.z] },
    };
    group.userData.labels = [
      {
        anchor: 'tip',
        text: isPointPlaneProjection
          ? 'distance = |proj(P - Q onto n)| = ' + fmtLen
          : 'length of ${name} = ' + fmtLen,
        distanceFactor: isPointPlaneProjection ? 6 : 8,
        offset: [0.12, 0.12, 0],
        emphasis: isPointPlaneProjection,
        className: isPointPlaneProjection ? 'distance-highlight-label' : undefined,
      },
    ];

    if (typeof threeObjStore === 'object' && threeObjStore) {
      threeObjStore[${JSON.stringify(block.id)}] = group;
    }
    return group;
  })()`;

    return [code, Order.FUNCTION_CALL];
  };

}