import * as Blockly from 'blockly/core'
import { javascriptGenerator, Order } from 'blockly/javascript'

// ===================
// 1. RUNTIME THREE.JS
// ===================
function geoVectorLineDefinition(posInput, dirInput, tRaw, blockId, THREE, threeObjStore) {
  // FUNCTION GUARD: Safely extract mathematical values if a visual mesh/group was passed
  const getRawVector = (input) => {
    if (!input) return new THREE.Vector3(0, 0, 0);
    // If it's a structural mesh/group containing custom userData parameters
    if (input.isObject3D && input.userData && input.userData.direction) {
      return input.userData.direction.clone();
    }
    if (input.isObject3D && input.position) {
      return input.position.clone();
    }
    // If it's already a raw THREE.Vector3
    if (input.isVector3) return input.clone();
    return new THREE.Vector3(0, 0, 0);
  };

  const origin = getRawVector(posInput);
  let v = getRawVector(dirInput);

  // Fallback if direction invalid/zero
  if (!isFinite(v.length()) || v.length() === 0) {
    v = new THREE.Vector3(1, 0, 0);
  }

  // Build visual guide line using completely fresh vectors
  const n = v.clone().normalize();
  const lineExtent = 20;
  const p1 = origin.clone().addScaledVector(n, -lineExtent);
  const p2 = origin.clone().addScaledVector(n, lineExtent);

  const lineGeom = new THREE.BufferGeometry().setFromPoints([p1, p2]);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x6b7280 });
  const line = new THREE.Line(lineGeom, lineMat);

  const r = 0.08;
  const sphereGeom = new THREE.SphereGeometry(r, 16, 12);
  const posMat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.4, metalness: 0.1 });
  const posSphere = new THREE.Mesh(sphereGeom, posMat);
  posSphere.position.copy(origin);

  const group = new THREE.Group();
  group.add(line, posSphere);

  if (typeof tRaw !== 'undefined' && isFinite(Number(tRaw))) {
    const tVal = Number(tRaw);
    const rPoint = origin.clone().addScaledVector(v, tVal);

    const tMat = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.4, metalness: 0.1 });
    const tSphere = new THREE.Mesh(sphereGeom, tMat);
    tSphere.position.copy(rPoint);
    group.add(tSphere);

    group.userData.t = tVal;
    group.userData.rPoint = rPoint.clone();
  }

  group.userData.geoType = 'geo_vector_line';
  group.userData.origin = origin.clone();
  group.userData.direction = v.clone();
  group.userData.lineExtent = lineExtent;
  group.userData.srcBlockId = blockId;

  if (threeObjStore) {
    threeObjStore[blockId] = group;
  }

  return group;
}

// ==========================================
// 2. BLOCKLY BLOCK DEFINITION
// ==========================================
let REGISTERED = false

export function initVector3Block() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['geo_vector'] = {
    init() {
      this.appendDummyInput().appendField('Vector Equation of Line')
      this.setStyle('math_blocks')
      this.setTooltip('A line in R3 defined by r = a + tv where a is a position the line passes through v is a direction vector and t is a scalar')
      this.setDeletable(true)
      this.setMovable(true)
      this.setOutput(true, 'obj3D')
      this.setColour(205)

      this.appendValueInput('POS').appendField('Position:').setCheck('vector3')
      this.appendValueInput('DIR').appendField('Direction:').setCheck('vector3')
      this.appendValueInput('SCALE').appendField('t:').setCheck('scalar')
    },
  }

  javascriptGenerator.forBlock['geo_vector'] = function(block, generator) {
    const vecPos = generator.valueToCode(block, 'POS', Order.FUNCTION_CALL) || 'new THREE.Vector3()'
    const vecDir = generator.valueToCode(block, 'DIR', Order.FUNCTION_CALL) || 'new THREE.Vector3(1,0,0)'

    // Detect if "scale" (t) input is connected
    const scaleInput = block.getInput('SCALE');
    const hasScaleInput = !!(scaleInput && scaleInput.connection && scaleInput.connection.targetConnection);
    const vecScaleCode = hasScaleInput
      ? (generator.valueToCode(block, 'SCALE', Order.FUNCTION_CALL) || '0')
      : 'undefined';

    const blockId = JSON.stringify(block.id)

    const code = `(${geoVectorLineDefinition.toString()})(${vecPos}, ${vecDir}, ${vecScaleCode}, ${blockId}, THREE, threeObjStore)`

    return [code, Order.FUNCTION_CALL]
  };
}
