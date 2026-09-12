import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { forInstance } from '@/store/colorSystem'
import { FieldObjectName } from '@/components/BlocksCanvas/blocks/naming/FieldObjectName'
import { isEffectivelyStandalone } from '@/utils/sceneHelpers'
import { allowOverflowingInputs } from '@/components/BlocksCanvas/renderers/geoScratchRenderer'

let REGISTERED = false

/**
 * Register linalg_vec3 (3-dimensional vector) building blocks + code generator
 * Output type: 'vector3'
 * Field: X/Y/Z (number)
 */
export function initVec3Block() {
  if (REGISTERED) return
  REGISTERED = true

  // The name badge shares the label's row rather than getting one of its
  // own: on its own it cost a whole row of height for a two-character badge.
  function appendCoordinateFields(block, label) {
    block
      .appendDummyInput()
      .appendField(label)
      .appendField(new Blockly.FieldNumber(1), 'X')
      .appendField(',')
      .appendField(new Blockly.FieldNumber(1), 'Y')
      .appendField(',')
      .appendField(new Blockly.FieldNumber(1), 'Z')
      .appendField(')')
      .appendField(new FieldObjectName(), 'GEOSCRATCH_NAME')
  }

  // Column-vector layout: the name badge takes the top row and the origin
  // socket shares it, carrying no label text, so a plugged-in block sits
  // flush with this block's top edge. The socket is marked as overflowing
  // (see geoScratchRenderer.js) so connecting a tall block parks it alongside
  // this one instead of stretching the top row and shoving the coordinates
  // down the body.
  function appendColumnVectorFields(block, label) {
    block
      .appendValueInput('ORIGIN')
      .setCheck('vector3')
      .appendField(new FieldObjectName(), 'GEOSCRATCH_NAME')
    allowOverflowingInputs(block, 'ORIGIN')
    block.appendDummyInput().appendField(label)
    for (const axis of ['X', 'Y', 'Z']) {
      block
        .appendDummyInput()
        .setAlign(Blockly.inputs.Align.CENTRE)
        .appendField(`${axis.toLowerCase()}:`)
        .appendField(new Blockly.FieldNumber(1), axis)
    }
  }

  function initVector3LikeBlock(block, label, tooltip, objectType, options = {}) {
    if (options.column) {
      appendColumnVectorFields(block, label)
    } else {
      appendCoordinateFields(block, label)
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
      initVector3LikeBlock(this, 'vector', '3D vector coordinate', 'vector', { column: true })
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
    const isStandalone = isEffectivelyStandalone(block)

    if (block.type === 'linalg_point') {
      return [
        `(function(){
        const point = new THREE.Vector3(${coords});
        const label = geoNaming.nameFor(${blockId});
        point.userData = {
          geoType: 'linalg_point_vector',
          label,
          point: point.clone(),
        };
        ${
          isStandalone
            ? `
        const pointColor = window.GeoScratchColors.forInstance('point', ${blockId});
        const marker = window.geoPointMarker({ color: pointColor, geoType: 'linalg_point_marker', srcBlockId: ${blockId} });
        marker.position.copy(point);
        marker.userData.labelAnchors = { p: { type: 'world', position: [point.x, point.y, point.z] } };
        marker.userData.labels = [
          { anchor: 'p', name: label, value: vectorNotation.formatVector(point), distanceFactor: 8, offset: [0.12, 0.12, 0], color: pointColor },
        ];
        if (typeof threeObjStore === 'object' && threeObjStore) threeObjStore[${blockId}] = marker;
        `
            : ''
        }
        return point;
      })()`,
        Order.FUNCTION_CALL,
      ]
    }

    const originInput = block.getInput && block.getInput('ORIGIN')
    const originConnected = !!originInput?.connection?.targetConnection
    const originCode = originConnected
      ? javascriptGenerator.valueToCode(block, 'ORIGIN', Order.FUNCTION_CALL)
      : ''

    return [
      `(function(){
      const vec = new THREE.Vector3(${coords});
      const __anchor = ${originConnected ? originCode || 'new THREE.Vector3(0, 0, 0)' : 'new THREE.Vector3(0, 0, 0)'};
      ${
        originConnected
          ? `// "from point:" tail -- consumed by operators (e.g. vector_arithmetic
      // draws this operand from here instead of the origin) as well as the
      // standalone glyph below.
      vec.userData = { ...(vec.userData || {}), anchor: __anchor.clone() };`
          : ''
      }
      ${
        isStandalone
          ? `
      const label = geoNaming.nameFor(${blockId});
      const origin = __anchor.clone();
      const tip = origin.clone().add(vec);
      const len = vec.length();
      const vectorColor = window.GeoScratchColors.forInstance('vector', ${blockId});
      let visual;
      if (len > 1e-8) {
        visual = window.buildVectorShaftGlyph(THREE, ${blockId}, origin, vec.clone().normalize(), len, vectorColor);
      } else {
        visual = window.geoPointMarker({ color: vectorColor, radius: 0.04 });
        visual.position.copy(origin);
      }
      visual.userData.geoType = 'geo_vector';
      visual.userData.srcBlockId = ${blockId};
      // The shaft itself, before the tail-marker wrapper below replaces
      // visual with a group -- a group can't be grown, this can.
      const shaftGlyph = visual;
      visual.userData.labelAnchors = { tip: { type: 'world', position: [tip.x, tip.y, tip.z] } };
      visual.userData.labels = [
        { anchor: 'tip', name: label, value: vectorNotation.formatVector(vec), distanceFactor: 8, offset: [0.12, 0.12, 0], color: vectorColor },
      ];
      ${
        originConnected
          ? `
      // A marker at the tail of a vector given a specific origin. Off by
      // default and behind the "Show Tail Point" setting: the tail is already
      // implied by where the shaft starts, and the extra dot reads as a
      // separate object that nobody asked for.
      const originPointColor = window.GeoScratchColors.forInstance('point', ${blockId});
      const originMarker = window.geoPointMarker({ color: originPointColor });
      originMarker.visible = !!(window.useSettingsStore?.getState().settings?.showVectorOriginPoint);
      originMarker.position.copy(origin);
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
          originMarker.visible = !!state.settings.showVectorOriginPoint;
        });
      }
      `
          : ''
      }
      // Another block is already drawing this exact vector: two coincident
      // glyphs can't be depth-ordered (speckling) and one label hides the
      // other. Hand our label to the owner and drop our own glyph.
      // See src/utils/duplicateVectorRegistry.js.
      const duplicateOwnerId = window.registerVectorGlyph
        ? window.registerVectorGlyph(${blockId}, origin, vec)
        : null;
      if (duplicateOwnerId) {
        const owner = window.threeObjStore?.[duplicateOwnerId];
        const ownerAnchor = Object.keys(owner?.userData?.labelAnchors || {})[0];
        if (owner?.userData?.labels && ownerAnchor) {
          owner.userData.labels.push({
            anchor: ownerAnchor,
            name: label,
            value: vectorNotation.formatVector(vec),
            distanceFactor: 8,
            offset: [0.12, 0.12 - owner.userData.labels.length * 0.3, 0],
            color: vectorColor,
          });
        }
        visual.traverse((child) => {
          child.geometry?.dispose?.();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => m?.dispose?.());
        });
      } else if (typeof threeObjStore === 'object' && threeObjStore) {
        threeObjStore[${blockId}] = visual;
      }
      // Provenance: this exact arrow is already on screen, from this tail, so
      // an operator downstream draws no coincident copy of it (and its reveal
      // skips a stage that could only grow underneath this one).
      // See vectorArithmetic.js's ownerGlyphs.
      if (len > 1e-8) {
        const ownerShaft = duplicateOwnerId
          ? window.threeObjStore?.[duplicateOwnerId]
          : shaftGlyph;
        vec.userData = {
          ...(vec.userData || {}),
          glyph: {
            blockId: duplicateOwnerId || ${blockId},
            anchor: origin.clone(),
            // What a consumer's staged reveal grows in place of a copy.
            objs: ownerShaft?.userData?.setVectorLength ? [ownerShaft] : [],
          },
        };
      }
      `
          : ''
      }
      // Which block this value came from. Deliberately NOT a label: a value
      // carrying one makes shouldShowOperandLabels false, which suppresses the
      // operand labels an operator draws, and a socketed vec3 renders no glyph
      // of its own to carry the name instead. This just lets a consumer look the
      // name up when it wants to show it.
      vec.userData = { ...(vec.userData || {}), srcBlockId: ${blockId} };
      return vec;
    })()`,
      Order.FUNCTION_CALL,
    ]
  }

  //Linalg primitives
  javascriptGenerator.forBlock['linalg_vec3'] = vector3Generator
  javascriptGenerator.forBlock['linalg_point'] = vector3Generator
}
