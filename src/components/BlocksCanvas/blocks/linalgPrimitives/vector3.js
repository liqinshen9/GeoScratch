import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { forInstance } from '@/store/colorSystem'

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

  function initVector3LikeBlock(block, label, tooltip, objectType, options = {}) {
    if (options.column) {
      appendColumnVectorFields(block, label)
    } else {
      appendCoordinateFields(block, label)
    }
    if (options.origin) {
      block.appendValueInput('ORIGIN').setCheck('vector3').appendField('from point:')
    }
    block.setStyle(objectType === 'point' ? BLOCK_STYLES.CREATE_POINT : BLOCK_STYLES.CREATE_VECTOR)
    block.setColour(forInstance(objectType, block.id))
    block.setTooltip(tooltip)
    block.setDeletable(true)
    block.setMovable(true)
    block.setOutput(true, 'vector3')
  }

  Blockly.Blocks['linalg_vec3'] = {
    init() {
      initVector3LikeBlock(this, 'vector: ', '3D vector coordinate', 'vector', { column: true, origin: true })
    },
  }

  Blockly.Blocks['linalg_point'] = {
    init() {
      initVector3LikeBlock(this, 'Point: (', '3D point coordinate', 'point')
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
        const pointColor = window.GeoScratchColors.forInstance('point', ${blockId});
        const markerMat = new THREE.MeshStandardMaterial({ color: pointColor });
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
          { anchor: 'p', text: label + ' = ' + vectorNotation.formatVector(point), distanceFactor: 8, offset: [0.12, 0.12, 0], color: pointColor },
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

    const originInput = block.getInput && block.getInput('ORIGIN')
    const originConnected = !!originInput?.connection?.targetConnection
    const originCode = originConnected
      ? javascriptGenerator.valueToCode(block, 'ORIGIN', Order.FUNCTION_CALL)
      : ''

    return [`(function(){
      const vec = new THREE.Vector3(${coords});
      const __anchor = ${originConnected ? (originCode || 'new THREE.Vector3(0, 0, 0)') : 'new THREE.Vector3(0, 0, 0)'};
      ${originConnected ? `// "from point:" tail -- consumed by operators (e.g. vector_arithmetic
      // draws this operand from here instead of the origin) as well as the
      // standalone glyph below.
      vec.userData = { ...(vec.userData || {}), anchor: __anchor.clone() };` : ''}
      ${isStandalone ? `
      const label = vectorNotation.assignVectorLabel(${blockId});
      const origin = __anchor.clone();
      const tip = origin.clone().add(vec);
      const len = vec.length();
      const vectorColor = window.GeoScratchColors.forInstance('vector', ${blockId});
      let visual;
      if (len > 1e-8) {
        visual = window.buildVectorShaftGlyph(THREE, ${blockId}, origin, vec.clone().normalize(), len, vectorColor);
      } else {
        visual = new THREE.Mesh(
          new THREE.SphereGeometry(0.04, 16, 12),
          new THREE.MeshStandardMaterial({ color: vectorColor, roughness: 0.4, metalness: 0.1 })
        );
        visual.position.copy(origin);
        visual.userData.zoomInvariantRadius = 0.04;
        visual.userData.zoomInvariantUniform = true;
      }
      visual.userData.geoType = 'geo_vector';
      visual.userData.srcBlockId = ${blockId};
      visual.userData.labelAnchors = { tip: { type: 'world', position: [tip.x, tip.y, tip.z] } };
      visual.userData.labels = [
        { anchor: 'tip', text: label + ' = ' + vectorNotation.formatVector(vec), distanceFactor: 8, offset: [0.12, 0.12, 0], color: vectorColor },
      ];
      ${originConnected ? `
      // "from point:" gives this vector a specific tail -- without this it
      // rendered only the shaft, so the vector appeared to start from
      // nowhere. Same marker look a standalone Point block gets.
      const originPointColor = window.GeoScratchColors.forInstance('point', ${blockId});
      const originMarkerMat = new THREE.MeshStandardMaterial({ color: originPointColor });
      const applyOriginPointFinish = (mat, s) => {
        mat.roughness = s.mattePoints ? 1 : 0.35;
        mat.metalness = s.mattePoints ? 0 : 0.05;
      };
      applyOriginPointFinish(originMarkerMat, window.useSettingsStore?.getState().settings || {});
      const originMarker = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), originMarkerMat);
      originMarker.position.copy(origin);
      originMarker.userData.zoomInvariantRadius = 0.24;
      originMarker.userData.zoomInvariantUniform = true;
      originMarker.userData.geoType = 'linalg_vector_origin_marker';
      originMarker.userData.srcBlockId = ${blockId};

      const vectorGroup = new THREE.Group();
      vectorGroup.add(visual, originMarker);
      vectorGroup.userData.geoType = 'geo_vector';
      vectorGroup.userData.srcBlockId = ${blockId};
      vectorGroup.userData.labelAnchors = visual.userData.labelAnchors;
      vectorGroup.userData.labels = visual.userData.labels;
      visual = vectorGroup;

      if (window.useSettingsStore) {
        const unsubscribe = window.useSettingsStore.subscribe((state) => {
          if (window.threeObjStore?.[${blockId}] !== visual) { unsubscribe(); return; }
          applyOriginPointFinish(originMarkerMat, state.settings);
        });
      }
      ` : ''}
      if (typeof threeObjStore === 'object' && threeObjStore) threeObjStore[${blockId}] = visual;
      ` : ''}
      return vec;
    })()`, Order.FUNCTION_CALL]
  }

  //Linalg primitives
  javascriptGenerator.forBlock['linalg_vec3'] = vector3Generator
  javascriptGenerator.forBlock['linalg_point'] = vector3Generator
}
