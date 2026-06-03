import * as Blockly from 'blockly/core'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { BLOCK_STYLES } from '../blockColours'

let REGISTERED = false

function childSourceIds(block) {
  return ['OBJECT_A', 'OBJECT_B', 'OBJECT_C', 'OBJECT_D']
    .map((name) => block.getInputTargetBlock(name)?.id)
    .filter(Boolean)
}

export default function initObjectCompositionBlocks() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.geo_show_point_on_object = {
    init() {
      this.appendDummyInput().appendField('Show any point on object')
      this.appendValueInput('OBJECT').appendField('object:').setCheck('obj3D')
      this.setStyle(BLOCK_STYLES.CREATE_POINTS_VECTORS)
      this.setTooltip('Adds a visible point marker on the connected object without requiring exact coordinates.')
      this.setOutput(true, 'obj3D')
    },
  }

  javascriptGenerator.forBlock.geo_show_point_on_object = function (block, generator) {
    const objectCode = generator.valueToCode(block, 'OBJECT', Order.FUNCTION_CALL) || 'null'
    const objectBlockId = block.getInputTargetBlock('OBJECT')?.id
    const objectBlockIdCode = JSON.stringify(objectBlockId)

    const code = `(function(){
      const object = (${objectCode});
      if (!object || !object.isObject3D) return null;

      const getAnyPointOnObject = (target) => {
        target.updateMatrixWorld(true);

        const planePoint = target.userData?.point;
        if (planePoint?.isVector3) return planePoint.clone();

        if (target.userData?.geoType === 'geo_sphere') {
          const centre = new THREE.Vector3();
          const scale = new THREE.Vector3();
          target.getWorldPosition(centre);
          target.getWorldScale(scale);
          const radius = Math.max(0.01, Number(target.userData.radius) || 1);
          return centre.add(new THREE.Vector3(radius * Math.max(scale.x, scale.y, scale.z), 0, 0));
        }

        if (target.isMesh && target.geometry?.attributes?.position) {
          const positions = target.geometry.attributes.position;
          if (positions.count > 0) {
            return target.localToWorld(new THREE.Vector3(
              positions.getX(0),
              positions.getY(0),
              positions.getZ(0)
            ));
          }
        }

        const box = new THREE.Box3().setFromObject(target);
        if (!box.isEmpty()) {
          const centre = new THREE.Vector3();
          box.getCenter(centre);
          return new THREE.Vector3(box.max.x, centre.y, centre.z);
        }

        const fallback = new THREE.Vector3();
        target.getWorldPosition(fallback);
        return fallback;
      }

      const markerPoint = getAnyPointOnObject(object);

      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0x49a1ff, roughness: 0.35, metalness: 0.05 })
      );
      marker.position.copy(markerPoint);
      marker.userData.geoType = 'selectable_point_marker';
      marker.userData.coordinate = markerPoint.clone();

      const group = new THREE.Group();
      group.add(object, marker);
      group.userData.geoType = 'annotated_object';
      group.userData.point = markerPoint.clone();
      group.userData.srcBlockId = ${JSON.stringify(block.id)};

      if (typeof threeObjStore === 'object' && threeObjStore) {
        if (${objectBlockIdCode}) {
          for (const key of Object.keys(threeObjStore)) {
            if (key === ${objectBlockIdCode} || key.startsWith(${objectBlockIdCode} + '_')) {
              delete threeObjStore[key];
            }
          }
        }
        threeObjStore[${JSON.stringify(block.id)}] = group;
      }
      return group;
    })()`

    return [code, Order.ATOMIC]
  }

  Blockly.Blocks.geo_composite_object = {
    init() {
      this.appendDummyInput().appendField('Composite object')
      this.appendValueInput('OBJECT_A').appendField('object 1:').setCheck('obj3D')
      this.appendValueInput('OBJECT_B').appendField('object 2:').setCheck('obj3D')
      this.appendValueInput('OBJECT_C').appendField('object 3:').setCheck('obj3D')
      this.appendValueInput('OBJECT_D').appendField('object 4:').setCheck('obj3D')
      this.setStyle(BLOCK_STYLES.CREATE_SOLIDS)
      this.setTooltip('Combines several primitive objects into one reusable 3D object.')
      this.setOutput(true, 'obj3D')
    },
  }

  javascriptGenerator.forBlock.geo_composite_object = function (block, generator) {
    const objectCodes = ['OBJECT_A', 'OBJECT_B', 'OBJECT_C', 'OBJECT_D'].map(
      (name) => generator.valueToCode(block, name, Order.FUNCTION_CALL) || 'null',
    )
    const sourceIds = childSourceIds(block)

    const code = `(function(){
      const parts = [${objectCodes.map((part) => `(${part})`).join(', ')}].filter((part) => part && part.isObject3D);
      const group = new THREE.Group();
      for (const part of parts) group.add(part);

      group.userData.geoType = 'composite_object';
      group.userData.partCount = parts.length;
      group.userData.srcBlockId = ${JSON.stringify(block.id)};

      if (typeof threeObjStore === 'object' && threeObjStore) {
        const sourceIds = ${JSON.stringify(sourceIds)};
        for (const sourceId of sourceIds) {
          for (const key of Object.keys(threeObjStore)) {
            if (key === sourceId || key.startsWith(sourceId + '_')) {
              delete threeObjStore[key];
            }
          }
        }
        threeObjStore[${JSON.stringify(block.id)}] = group;
      }
      return group;
    })()`

    return [code, Order.ATOMIC]
  }
}
