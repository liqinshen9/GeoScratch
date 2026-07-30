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
      
      //Three.js mesh geometry is rendered/stored internally as triangles, even when the visible edge grid looks rectangular
      const getTriangleVertexIndices = (geometry, triangleIndex) => {
        const index = geometry.index;
        if (index) {
          const offset = triangleIndex * 3;
          return [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
        }
        const offset = triangleIndex * 3;
        return [offset, offset + 1, offset + 2];
      };
      const pickTeapotSurfaceParams = (target) => {
        const position = target.geometry?.attributes?.position;
        if (!position || position.count < 3) return null;

        const triangleCount = target.geometry.index
          ? Math.floor(target.geometry.index.count / 3)
          : Math.floor(position.count / 3);
        if (triangleCount < 1) return null;

        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        const c = new THREE.Vector3();
        const ab = new THREE.Vector3();
        const ac = new THREE.Vector3();
        const areas = [];
        let totalArea = 0;

        for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
          const [ia, ib, ic] = getTriangleVertexIndices(target.geometry, triangleIndex);
          a.fromBufferAttribute(position, ia);
          b.fromBufferAttribute(position, ib);
          c.fromBufferAttribute(position, ic);
          const area = ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() * 0.5;
          totalArea += area;
          areas.push(area);
        }

        if (totalArea <= 0) return null;

        let remainingArea = Math.random() * totalArea;
        let triangleIndex = 0;
        for (; triangleIndex < areas.length - 1; triangleIndex += 1) {
          remainingArea -= areas[triangleIndex];
          if (remainingArea <= 0) break;
        }

        const [ia, ib, ic] = getTriangleVertexIndices(target.geometry, triangleIndex);
        const sqrtR1 = Math.sqrt(Math.random());
        const u = 1 - sqrtR1;
        const v = sqrtR1 * (1 - Math.random());
        const w = 1 - u - v;
        return { type: 'teapot-surface', triangleIndex, indices: [ia, ib, ic], barycentric: [u, v, w] };
      };

      const pickPointParams = (target) => {
        if (target.userData?.geoType === 'geo_vector_line') {
          return { type: 'line', ratio: randomInteriorRatio() };
        }

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

        //added a geo_teapot path
        if (target.userData?.geoType === 'geo_teapot') {
          const params = pickTeapotSurfaceParams(target);
          if (params) return params;
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

        if (params.type === 'line' && target.userData?.geoType === 'geo_vector_line') {
          const direction = target.userData.direction?.isVector3 ? target.userData.direction.clone() : new THREE.Vector3(1, 0, 0);
          const directionLength = direction.length();
          const unitDirection = directionLength > 1e-12 ? direction.clone().normalize() : new THREE.Vector3(1, 0, 0);
          const segmentMid = target.userData.segmentMid?.isVector3 ? target.userData.segmentMid.clone() : new THREE.Vector3();
          const halfLength = Math.max(0.01, Number(target.userData.segmentHalfLength) || 1);
          const clampedRatio = Math.max(-0.65, Math.min(0.65, Number(params.ratio) || 0));
          return target.localToWorld(segmentMid.addScaledVector(unitDirection, clampedRatio * halfLength));
        }

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

        if (params.type === 'teapot-surface') {
          const position = target.geometry?.attributes?.position;
          const indices = Array.isArray(params.indices) ? params.indices : [];
          const barycentric = Array.isArray(params.barycentric) ? params.barycentric : [];
          const validCachedIndices = indices.length === 3 && indices.every((index) => Number.isInteger(index) && index >= 0 && index < position?.count);
          let surfaceIndices = validCachedIndices ? indices : null;
          if (!surfaceIndices && position && Number.isInteger(params.triangleIndex)) {
            const triangleCount = target.geometry.index
              ? Math.floor(target.geometry.index.count / 3)
              : Math.floor(position.count / 3);
            if (triangleCount > 0) {
              surfaceIndices = getTriangleVertexIndices(target.geometry, Math.abs(params.triangleIndex) % triangleCount);
            }
          }
          if (position && surfaceIndices && barycentric.length === 3) {
            const a = new THREE.Vector3().fromBufferAttribute(position, surfaceIndices[0]);
            const b = new THREE.Vector3().fromBufferAttribute(position, surfaceIndices[1]);
            const c = new THREE.Vector3().fromBufferAttribute(position, surfaceIndices[2]);
            const local = a
              .multiplyScalar(Number(barycentric[0]) || 0)
              .addScaledVector(b, Number(barycentric[1]) || 0)
              .addScaledVector(c, Number(barycentric[2]) || 0);
            return target.localToWorld(local);
          }
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
      const pointLabel = vectorNotation.assignAnyPointLabel(${JSON.stringify(block.id)});

      const markerMat = new THREE.MeshStandardMaterial({ color: 0x2563eb });
      const applyPointFinish = (mat, s) => {
        mat.roughness = s.mattePoints ? 1 : 0.35;
        mat.metalness = s.mattePoints ? 0 : 0.05;
      };
      applyPointFinish(markerMat, window.useSettingsStore?.getState().settings || {});
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), markerMat);
      marker.position.copy(markerPoint);
      marker.userData.zoomInvariantRadius = 0.24;
      marker.userData.zoomInvariantUniform = true;
      marker.userData.geoType = 'selectable_point_marker';
      marker.userData.coordinate = markerPoint.clone();

      const group = new THREE.Group();
      group.add(object, marker);
      group.userData.geoType = 'annotated_object';
      group.userData.point = markerPoint.clone();
      group.userData.srcBlockId = ${JSON.stringify(block.id)};
      group.userData.labelAnchors = {
        q: { type: 'world', position: [markerPoint.x, markerPoint.y, markerPoint.z] },
      };
      group.userData.labels = [
        { anchor: 'q', text: pointLabel + ' = ' + vectorNotation.formatVector(markerPoint), distanceFactor: 8, offset: [0.12, 0.12, 0], color: '#2563eb' },
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
      if (window.useSettingsStore) {
        const unsubscribe = window.useSettingsStore.subscribe((state) => {
          if (window.threeObjStore?.[${JSON.stringify(block.id)}] !== group) { unsubscribe(); return; }
          applyPointFinish(markerMat, state.settings);
        });
      }
      const pointVector = markerPoint.clone();
      pointVector.userData = {
        geoType: 'point_on_object_vector',
        label: pointLabel,
        labelVisible: true,
        point: markerPoint.clone(),
      };
      return pointVector;
    })()`

    return [code, Order.ATOMIC]
  }
}
