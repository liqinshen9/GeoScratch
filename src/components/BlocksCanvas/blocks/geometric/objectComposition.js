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

      // The marker's point is randomly chosen on the object's surface, but we
      // don't want it to re-randomize on every unrelated workspace edit (any
      // edit anywhere regenerates the whole scene). So instead of caching the
      // final world-space position, we cache the *recipe* used to pick it
      // (axis choices / ratios along the object's current bounds, relative
      // offsets, etc) and re-resolve it against the object's current
      // transform/size every time. That keeps the chosen point stable while
      // still tracking the object if it's moved, resized, or rotated.
      const randomBetween = (min, max) => min + Math.random() * (max - min);
      const randomInteriorRatio = () => randomBetween(-0.65, 0.65);
      const randomSignRatio = () => (Math.random() < 0.5 ? -1 : 1);

      const pickPointParams = (target) => {
        const planePoint = target.userData?.point;
        const planeNormal = target.userData?.normalUnit;
        if (planePoint?.isVector3 && planeNormal?.isVector3) {
          return { type: 'plane', tangentRatio: randomInteriorRatio(), bitangentRatio: randomInteriorRatio() };
        }

        if (planePoint?.isVector3) return { type: 'plane-point' };

        if (target.userData?.geoType === 'geo_cube') {
          const faceAxis = Math.floor(Math.random() * 3);
          const ratios = [0, 1, 2].map((axis) => (axis === faceAxis ? randomSignRatio() : randomInteriorRatio()));
          return { type: 'cube', ratios };
        }

        if (target.userData?.geoType === 'geo_sphere') {
          const direction = new THREE.Vector3(
            randomBetween(-1, 1),
            randomBetween(-0.85, 0.85),
            randomBetween(-1, 1)
          );
          if (direction.lengthSq() < 0.001) direction.set(1, 0.2, 0.3);
          direction.normalize();
          return { type: 'sphere', direction: [direction.x, direction.y, direction.z] };
        }

        if (target.isMesh && target.geometry?.attributes?.position) {
          const box = new THREE.Box3().setFromObject(target);
          if (!box.isEmpty()) {
            const faceAxis = Math.floor(Math.random() * 3);
            const ratios = [0, 1, 2].map((axis) => (axis === faceAxis ? randomSignRatio() : randomInteriorRatio()));
            return { type: 'mesh-box', ratios };
          }
        }

        const fallbackBox = new THREE.Box3().setFromObject(target);
        if (!fallbackBox.isEmpty()) {
          return { type: 'box-max-x', ratioY: randomInteriorRatio(), ratioZ: randomInteriorRatio() };
        }

        return { type: 'origin' };
      };

      const resolvePointFromParams = (target, params) => {
        target.updateMatrixWorld(true);

        if (params.type === 'plane' && target.userData?.point?.isVector3 && target.userData?.normalUnit?.isVector3) {
          const planeSize = Math.max(1, Number(target.userData?.planeSize) || 12);
          const normal = target.userData.normalUnit.clone().normalize();
          const tangent = new THREE.Vector3(1, 0, 0);
          if (Math.abs(tangent.dot(normal)) > 0.85) tangent.set(0, 0, 1);
          tangent.cross(normal).normalize();
          const bitangent = normal.clone().cross(tangent).normalize();
          return target.userData.point
            .clone()
            .addScaledVector(tangent, params.tangentRatio * (planeSize / 2))
            .addScaledVector(bitangent, params.bitangentRatio * (planeSize / 2));
        }

        if (params.type === 'plane-point' && target.userData?.point?.isVector3) {
          return target.userData.point.clone();
        }

        if (params.type === 'cube') {
          const sideLength = Math.max(0.01, Number(target.userData.sideLength ?? target.userData.side) || 1);
          const half = sideLength / 2;
          const local = new THREE.Vector3(
            params.ratios[0] * half,
            params.ratios[1] * half,
            params.ratios[2] * half
          );
          return target.localToWorld(local);
        }

        if (params.type === 'sphere') {
          const centre = new THREE.Vector3();
          const scale = new THREE.Vector3();
          target.getWorldPosition(centre);
          target.getWorldScale(scale);
          const radius = Math.max(0.01, Number(target.userData.radius) || 1);
          const direction = new THREE.Vector3(params.direction[0], params.direction[1], params.direction[2]);
          return centre.add(direction.multiplyScalar(radius * Math.max(scale.x, scale.y, scale.z)));
        }

        if (params.type === 'mesh-box') {
          const box = new THREE.Box3().setFromObject(target);
          if (!box.isEmpty()) {
            const centre = new THREE.Vector3();
            const size = new THREE.Vector3();
            box.getCenter(centre);
            box.getSize(size);
            const half = size.multiplyScalar(0.5);
            const point = centre.clone();
            ['x', 'y', 'z'].forEach((axis, index) => {
              point[axis] += half[axis] * params.ratios[index];
            });
            return point;
          }
        }

        if (params.type === 'box-max-x') {
          const box = new THREE.Box3().setFromObject(target);
          if (!box.isEmpty()) {
            const centre = new THREE.Vector3();
            const size = new THREE.Vector3();
            box.getCenter(centre);
            box.getSize(size);
            const half = size.multiplyScalar(0.5);
            return new THREE.Vector3(
              box.max.x,
              centre.y + half.y * params.ratioY,
              centre.z + half.z * params.ratioZ
            );
          }
        }

        const fallback = new THREE.Vector3();
        target.getWorldPosition(fallback);
        return fallback;
      };

      const anyPointCache = window.__geoScratchAnyPointCache || (window.__geoScratchAnyPointCache = {});
      // Re-roll the recipe if a different object gets connected to this
      // block, but keep it stable while it's still the same one.
      const cacheKey = ${JSON.stringify(block.id)} + ':' + (${objectBlockIdCode} || 'none');
      const cachedParams = anyPointCache[cacheKey];
      const pointParams = cachedParams || pickPointParams(object);
      anyPointCache[cacheKey] = pointParams;
      const markerPoint = resolvePointFromParams(object, pointParams);

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
        { anchor: 'q', text: 'Q = ' + formatPoint(markerPoint), distanceFactor: 8, offset: [0.12, 0.12, 0], color: '#49a1ff' },
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
