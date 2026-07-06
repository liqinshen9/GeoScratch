import * as Blockly from 'blockly/core'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { BLOCK_STYLES } from '../blockColours'

let REGISTERED = false

export default function initObjectCompositionBlocks() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.geo_show_point_on_object = {
    init() {
      this.appendDummyInput().appendField('Show any point on object')
      this.appendValueInput('OBJECT').appendField('object:').setCheck('obj3D')
      this.setStyle(BLOCK_STYLES.CREATE_POINTS_VECTORS)
      this.setTooltip('Adds a visible point marker on the connected object and returns its R3 coordinate vector.')
      this.setOutput(true, 'vector3')
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

        const randomBetween = (min, max) => min + Math.random() * (max - min);
        const randomInteriorOffset = (halfSize) => randomBetween(-halfSize * 0.65, halfSize * 0.65);
        const randomSigned = (value) => (Math.random() < 0.5 ? -value : value);

        const planePoint = target.userData?.point;
        const planeNormal = target.userData?.normalUnit;
        if (planePoint?.isVector3 && planeNormal?.isVector3) {
          const planeSize = Math.max(1, Number(target.userData?.planeSize) || 12);
          const normal = planeNormal.clone().normalize();
          const tangent = new THREE.Vector3(1, 0, 0);
          if (Math.abs(tangent.dot(normal)) > 0.85) tangent.set(0, 0, 1);
          tangent.cross(normal).normalize();
          const bitangent = normal.clone().cross(tangent).normalize();
          return planePoint
            .clone()
            .addScaledVector(tangent, randomInteriorOffset(planeSize / 2))
            .addScaledVector(bitangent, randomInteriorOffset(planeSize / 2));
        }

        if (planePoint?.isVector3) return planePoint.clone();

        if (target.userData?.geoType === 'geo_cube') {
          const sideLength = Math.max(0.01, Number(target.userData.sideLength ?? target.userData.side) || 1);
          const half = sideLength / 2;
          const faceAxis = Math.floor(Math.random() * 3);
          const local = new THREE.Vector3(
            randomInteriorOffset(half),
            randomInteriorOffset(half),
            randomInteriorOffset(half)
          );
          local.setComponent(faceAxis, randomSigned(half));
          return target.localToWorld(local);
        }

        if (target.userData?.geoType === 'geo_sphere') {
          const centre = new THREE.Vector3();
          const scale = new THREE.Vector3();
          target.getWorldPosition(centre);
          target.getWorldScale(scale);
          const radius = Math.max(0.01, Number(target.userData.radius) || 1);
          const direction = new THREE.Vector3(
            randomBetween(-1, 1),
            randomBetween(-0.85, 0.85),
            randomBetween(-1, 1)
          );
          if (direction.lengthSq() < 0.001) direction.set(1, 0.2, 0.3);
          direction.normalize();
          return centre.add(direction.multiplyScalar(radius * Math.max(scale.x, scale.y, scale.z)));
        }

        if (target.isMesh && target.geometry?.attributes?.position) {
          const box = new THREE.Box3().setFromObject(target);
          if (!box.isEmpty()) {
            const centre = new THREE.Vector3();
            const size = new THREE.Vector3();
            box.getCenter(centre);
            box.getSize(size);
            const half = size.multiplyScalar(0.5);
            const faceAxis = Math.floor(Math.random() * 3);
            const point = centre.clone();
            const axes = ['x', 'y', 'z'];
            point[axes[faceAxis]] += randomSigned(half[axes[faceAxis]]);
            for (const axis of axes.filter((_, index) => index !== faceAxis)) {
              point[axis] += randomInteriorOffset(half[axis]);
            }
            return point;
          }
        }

        const box = new THREE.Box3().setFromObject(target);
        if (!box.isEmpty()) {
          const centre = new THREE.Vector3();
          const size = new THREE.Vector3();
          box.getCenter(centre);
          box.getSize(size);
          const half = size.multiplyScalar(0.5);
          return new THREE.Vector3(
            box.max.x,
            centre.y + randomInteriorOffset(half.y),
            centre.z + randomInteriorOffset(half.z)
          );
        }

        const fallback = new THREE.Vector3();
        target.getWorldPosition(fallback);
        return fallback;
      }

      const anyPointCache = window.__geoScratchAnyPointCache || (window.__geoScratchAnyPointCache = {});
      const cachedPoint = anyPointCache[${JSON.stringify(block.id)}];
      const markerPoint = cachedPoint?.isVector3 ? cachedPoint.clone() : getAnyPointOnObject(object);
      anyPointCache[${JSON.stringify(block.id)}] = markerPoint.clone();

      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0x49a1ff, roughness: 0.35, metalness: 0.05 })
      );
      marker.position.copy(markerPoint);
      marker.userData.geoType = 'selectable_point_marker';
      marker.userData.coordinate = markerPoint.clone();

      const formatPoint = (point) => '[' + [point.x, point.y, point.z].map((value) => Number(value.toFixed(3))).join(', ') + ']';

      const group = new THREE.Group();
      group.add(object, marker);
      group.userData.geoType = 'annotated_object';
      group.userData.point = markerPoint.clone();
      group.userData.srcBlockId = ${JSON.stringify(block.id)};
      group.userData.labelAnchors = {
        q: { type: 'world', position: [markerPoint.x, markerPoint.y, markerPoint.z] },
      };
      group.userData.labels = [
        { anchor: 'q', text: 'Q = ' + formatPoint(markerPoint), distanceFactor: 8, offset: [0.12, 0.12, 0] },
      ];

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
      const pointVector = markerPoint.clone();
      pointVector.userData = {
        geoType: 'point_on_object_vector',
        label: 'Q',
        point: markerPoint.clone(),
      };
      return pointVector;
    })()`

    return [code, Order.ATOMIC]
  }
}
