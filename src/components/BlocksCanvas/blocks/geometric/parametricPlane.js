import * as Blockly from 'blockly/core'
import { javascriptGenerator, Order } from 'blockly/javascript'

// ===================
// 1. RUNTIME THREE.JS
// ===================
function geoParametricPlaneDefinition(pointInput, normInput, normLabel, blockId, THREE, threeObjStore) {
  const p = (pointInput && pointInput.isVector3) ? pointInput.clone() : new THREE.Vector3();
  let nRaw = (normInput && normInput.isVector3) ? normInput.clone() : new THREE.Vector3(0, 1, 0);

  let normLen = nRaw.length();
  if (!isFinite(normLen) || normLen === 0) {
    nRaw.set(0, 1, 0);
    normLen = 1;
  }
  const nUnit = nRaw.clone().normalize();

  // Plane geometry setup
  const geom = new THREE.PlaneGeometry(40, 40, 1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffb6c1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.35
  });
  const plane = new THREE.Mesh(geom, mat);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nUnit);
  plane.setRotationFromQuaternion(quat);
  plane.position.copy(p);

  // Position point marker setup
  const pointMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.4, metalness: 0.1 })
  );
  pointMesh.position.copy(p);

  // Normal arrow layout configuration (Capped visually to 5.0 units max)
  const headLenRatio = 0.25;
  const headWidthRatio = 0.10;
  const visualArrowLen = Math.min(5.0, normLen);

  const headLen = Math.max(0.001, visualArrowLen * headLenRatio);
  const headWidth = Math.max(0.001, visualArrowLen * headWidthRatio);

  const arrow = new THREE.ArrowHelper(nUnit.clone(), p.clone(), visualArrowLen, 0x3b82f6, headLen, headWidth);

  // Anchor structures for tooltips/labels
  const fmt = (vec) => '[' + [vec.x, vec.y, vec.z].map(v => Number(v.toFixed(3))).join(', ') + ']';
  const nTip = p.clone().add(nRaw);

  const group = new THREE.Group();
  group.add(plane, pointMesh, arrow);

  group.userData.geoType = 'point_normal_plane_group';
  group.userData.srcBlockId = blockId;
  group.userData.point = p.clone();
  group.userData.normalRaw = nRaw.clone();
  group.userData.normalUnit = nUnit.clone();
  group.userData.planeSize = 20;

  group.userData.labelAnchors = {
    pAnchor: { type: 'world', position: [p.x, p.y, p.z] },
    nTip: { type: 'world', position: [nTip.x, nTip.y, nTip.z] },
  };
  group.userData.labels = [
    { anchor: 'pAnchor', text: 'point = ' + fmt(p), distanceFactor: 8, offset: [0.12, 0.12, 0] },
    { anchor: 'nTip', text: 'normal = ' + fmt(nRaw), distanceFactor: 8, offset: [0.12, 0.12, 0] },
  ];

  plane.userData = Object.assign(plane.userData || {}, { geoType: 'plane_mesh', srcBlockId: blockId });
  pointMesh.userData = Object.assign(pointMesh.userData || {}, { geoType: 'point_marker', srcBlockId: blockId });
  arrow.userData = Object.assign(arrow.userData || {}, {
    geoType: 'normal_arrow',
    name: normLabel,
    headLenRatio,
    headWidthRatio,
    srcBlockId: blockId
  });

  if (typeof threeObjStore === 'object' && threeObjStore) {
    threeObjStore[blockId + '_plane'] = plane;
    threeObjStore[blockId + '_point'] = pointMesh;
    threeObjStore[blockId + '_normal'] = arrow;
    threeObjStore[blockId] = group;
  }

  return group;
}

// ==========================================
// 2. BLOCKLY BLOCK DEFINITION
// ==========================================
let REGISTERED = false

export function initParametricPlaneBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['parametric_plane'] = {
    init() {
      this.appendDummyInput().appendField('Plane')
      this.appendValueInput('point').appendField('Point:').setCheck('vector3')
      this.appendValueInput('norm').appendField('Normal:').setCheck('vector3')
      this.setStyle('math_blocks')
      this.setTooltip('Plane defined by a point p and a normal n (normalized internally).')
      this.setDeletable(true)
      this.setMovable(true)
      this.setOutput(true, 'obj3D')
      this.setColour(205)
    },
  }

  javascriptGenerator.forBlock['parametric_plane'] = function(block, generator) {
    const point = generator.valueToCode(block, 'point', Order.FUNCTION_CALL) || 'new THREE.Vector3()';
    const norm = generator.valueToCode(block, 'norm', Order.FUNCTION_CALL) || 'new THREE.Vector3(0,1,0)';

    const getNormLabel = (() => {
      try {
        const tgt = block.getInputTargetBlock && block.getInputTargetBlock('norm');
        if (!tgt || typeof tgt.getFieldValue !== 'function') return 'n';
        const fields = ['NAME', 'Label', 'LABEL', 'VAR', 'Var', 'ID', 'TITLE', 'TEXT'];
        for (const f of fields) {
          const v = tgt.getFieldValue(f);
          if (v) return String(v);
        }
        return tgt.type || 'n';
      } catch { return 'n'; }
    })();

    const blockId = JSON.stringify(block.id);
    const normLabelStr = JSON.stringify(getNormLabel);

    const code = `(${geoParametricPlaneDefinition.toString()})(${point}, ${norm}, ${normLabelStr}, ${blockId}, THREE, threeObjStore)`;

    return [code, Order.FUNCTION_CALL];
  };
}

export default initParametricPlaneBlock;
