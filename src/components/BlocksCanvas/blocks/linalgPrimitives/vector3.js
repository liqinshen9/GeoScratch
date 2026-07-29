import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

let REGISTERED = false

/**
 * Register linalg_vec3 (3-dimensional vector) building blocks + code generator
 * Output type: 'vector3'
 * Field: X/Y/Z (number)
 */
export function initVec3Block() {
  if (REGISTERED) return
  REGISTERED = true

  function appendCoordinateFields(block, label) {
    block.appendDummyInput()
      .appendField(label)
      .appendField(new Blockly.FieldNumber(1), 'X')
      .appendField(',')
      .appendField(new Blockly.FieldNumber(1), 'Y')
      .appendField(',')
      .appendField(new Blockly.FieldNumber(1), 'Z')
      .appendField(')')
  }

  function appendColumnVectorFields(block, label) {
    block.appendDummyInput()
      .appendField(label)
    block.appendDummyInput()
      .setAlign(Blockly.inputs.Align.CENTRE)
      .appendField(new Blockly.FieldNumber(1), 'X')
    block.appendDummyInput()
      .setAlign(Blockly.inputs.Align.CENTRE)
      .appendField(new Blockly.FieldNumber(1), 'Y')
    block.appendDummyInput()
      .setAlign(Blockly.inputs.Align.CENTRE)
      .appendField(new Blockly.FieldNumber(1), 'Z')
  }

  function initVector3LikeBlock(block, label, tooltip, options = {}) {
    if (options.column) {
      appendColumnVectorFields(block, label)
    } else {
      appendCoordinateFields(block, label)
    }
    block.setStyle(BLOCK_STYLES.CREATE_POINTS_VECTORS)
    block.setTooltip(tooltip)
    block.setDeletable(true)
    block.setMovable(true)
    block.setOutput(true, 'vector3')
  }

  Blockly.Blocks['linalg_vec3'] = {
    init() {
      initVector3LikeBlock(this, 'vector: ', '3D vector coordinate', { column: true })
    },
  }

  Blockly.Blocks['linalg_point'] = {
    init() {
      initVector3LikeBlock(this, 'Point: (', '3D point coordinate')
    },
  }

  function vector3Generator(block) {
    const coords = `${block.getFieldValue('X')}, ${block.getFieldValue('Y')}, ${block.getFieldValue('Z')}`
    const blockId = JSON.stringify(block.id)
    // A point/vector block feeding another block's input keeps its old
    // value-only behaviour (rendering that is handled by whatever consumes
    // it); only a block sitting alone on the workspace gets its own glyph.
    const isStandalone = !block.outputConnection?.targetConnection

    if (block.type === 'linalg_point') {
      return [`(function(){
        const point = new THREE.Vector3(${coords});
        const label = vectorNotation.assignPointLabel(${blockId});
        point.userData = {
          geoType: 'linalg_point_vector',
          label,
          point: point.clone(),
        };
        ${isStandalone ? `
        const markerMat = new THREE.MeshStandardMaterial({ color: 0x2563eb });
        const applyPointFinish = (mat, s) => {
          mat.roughness = s.mattePoints ? 1 : 0.35;
          mat.metalness = s.mattePoints ? 0 : 0.05;
        };
        applyPointFinish(markerMat, window.useSettingsStore?.getState().settings || {});
        const marker = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), markerMat);
        marker.position.copy(point);
        marker.userData.zoomInvariantRadius = 0.24;
        marker.userData.zoomInvariantUniform = true;
        marker.userData.geoType = 'linalg_point_marker';
        marker.userData.srcBlockId = ${blockId};
        marker.userData.labelAnchors = { p: { type: 'world', position: [point.x, point.y, point.z] } };
        marker.userData.labels = [
          { anchor: 'p', text: label + ' = ' + vectorNotation.formatVector(point), distanceFactor: 8, offset: [0.12, 0.12, 0], color: '#2563eb' },
        ];
        if (typeof threeObjStore === 'object' && threeObjStore) threeObjStore[${blockId}] = marker;
        if (window.useSettingsStore) {
          const unsubscribe = window.useSettingsStore.subscribe((state) => {
            if (window.threeObjStore?.[${blockId}] !== marker) { unsubscribe(); return; }
            applyPointFinish(markerMat, state.settings);
          });
        }
        ` : ''}
        return point;
      })()`, Order.FUNCTION_CALL]
    }

    return [`(function(){
      const vec = new THREE.Vector3(${coords});
      ${isStandalone ? `
      const label = vectorNotation.assignVectorLabel(${blockId});
      const len = vec.length();
      let visual;
      if (len > 1e-8) {
        visual = new THREE.ArrowHelper(vec.clone().normalize(), new THREE.Vector3(), len, 0x15803d, 0.25, 0.1);
      } else {
        visual = new THREE.Mesh(
          new THREE.SphereGeometry(0.04, 16, 12),
          new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.4, metalness: 0.1 })
        );
        visual.userData.zoomInvariantRadius = 0.04;
        visual.userData.zoomInvariantUniform = true;
      }
      visual.userData.geoType = 'geo_vector';
      visual.userData.srcBlockId = ${blockId};
      visual.userData.labelAnchors = { tip: { type: 'world', position: [vec.x, vec.y, vec.z] } };
      visual.userData.labels = [
        { anchor: 'tip', text: label + ' = ' + vectorNotation.formatVector(vec), distanceFactor: 8, offset: [0.12, 0.12, 0], color: '#15803d' },
      ];
      if (typeof threeObjStore === 'object' && threeObjStore) threeObjStore[${blockId}] = visual;
      ` : ''}
      return vec;
    })()`, Order.FUNCTION_CALL]
  }

  //Linalg primitives
  javascriptGenerator.forBlock['linalg_vec3'] = vector3Generator
  javascriptGenerator.forBlock['linalg_point'] = vector3Generator
}
