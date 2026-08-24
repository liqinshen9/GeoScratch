import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

let REGISTERED = false

export function initSphereDistanceBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.sphere_distance = {
    init() {
      this.appendDummyInput().appendField('Sphere Surface Distance')
      this.appendValueInput('A').setCheck('obj3D').appendField('Sphere A:')
      this.appendValueInput('B').setCheck('obj3D').appendField('Sphere B:')
      this.setInputsInline(false)
      this.setOutput(true, 'obj3D')
      this.setStyle(BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS)
      this.setTooltip('Draw and check the surface gap: distance between centers minus both radii.')
      this.setDeletable(true)
      this.setMovable(true)
    },
  }

  javascriptGenerator.forBlock.sphere_distance = function (block, generator) {
    const sphereA = generator.valueToCode(block, 'A', Order.FUNCTION_CALL) || 'null'
    const sphereB = generator.valueToCode(block, 'B', Order.FUNCTION_CALL) || 'null'
    const blockId = JSON.stringify(block.id)

    const code = `(function(){
    const sphereA = ${sphereA};
    const sphereB = ${sphereB};
    if (!sphereA?.isObject3D || !sphereB?.isObject3D) return null;
    if (sphereA.userData?.geoType !== 'geo_sphere' || sphereB.userData?.geoType !== 'geo_sphere') return null;

    const centreA = sphereA.userData?.centre?.isVector3 ? sphereA.userData.centre.clone() : sphereA.position?.clone?.();
    const centreB = sphereB.userData?.centre?.isVector3 ? sphereB.userData.centre.clone() : sphereB.position?.clone?.();
    const radiusA = Number(sphereA.userData?.radius);
    const radiusB = Number(sphereB.userData?.radius);
    if (!centreA?.isVector3 || !centreB?.isVector3 || !Number.isFinite(radiusA) || !Number.isFinite(radiusB)) return null;

    const betweenCenters = centreB.clone().sub(centreA);
    const centerDistance = betweenCenters.length();
    const surfaceDistance = Math.max(0, centerDistance - radiusA - radiusB);
    const direction = centerDistance > 1e-8 ? betweenCenters.clone().normalize() : new THREE.Vector3(1, 0, 0);
    const surfaceA = centreA.clone().addScaledVector(direction, radiusA);
    const surfaceB = centreB.clone().addScaledVector(direction, -radiusB);
    const midpoint = surfaceA.clone().add(surfaceB).multiplyScalar(0.5);
    const safeLength = surfaceDistance > 1e-8 ? surfaceDistance : 1;
    const distanceColor = window.GeoScratchColors.forRole('distance');
    const centerLineColor = window.GeoScratchColors.forRole('accent');

    const group = new THREE.Group();
    group.add(sphereA, sphereB);

    const centerLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([centreA.clone(), centreB.clone()]),
      new THREE.LineDashedMaterial({ color: centerLineColor, dashSize: 0.22, gapSize: 0.14, transparent: true, opacity: 0.7 })
    );
    centerLine.computeLineDistances();

    let distanceSegment;
    if (surfaceDistance > 1e-8) {
      distanceSegment = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, safeLength, 18),
        new THREE.MeshBasicMaterial({ color: distanceColor, transparent: true, opacity: 0.94, depthWrite: false })
      );
      distanceSegment.position.copy(midpoint);
      distanceSegment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    } else {
      distanceSegment = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 16, 12),
        new THREE.MeshStandardMaterial({ color: distanceColor, roughness: 0.35, metalness: 0.05 })
      );
      distanceSegment.userData.zoomInvariantRadius = 0.06;
      distanceSegment.userData.zoomInvariantUniform = true;
      distanceSegment.position.copy(midpoint);
    }
    distanceSegment.userData.geoType = 'distance_segment';
    distanceSegment.userData.srcBlockId = ${blockId};

    const centerDotGeom = new THREE.SphereGeometry(0.045, 16, 12);
    const centerDotMat = new THREE.MeshStandardMaterial({ color: centerLineColor, roughness: 0.35, metalness: 0.05 });
    const centerDotA = new THREE.Mesh(centerDotGeom, centerDotMat);
    const centerDotB = new THREE.Mesh(centerDotGeom.clone(), centerDotMat.clone());
    centerDotA.userData.zoomInvariantRadius = 0.045;
    centerDotB.userData.zoomInvariantRadius = 0.045;
    centerDotA.userData.zoomInvariantUniform = true;
    centerDotB.userData.zoomInvariantUniform = true;
    centerDotA.position.copy(centreA);
    centerDotB.position.copy(centreB);

    group.add(centerLine, distanceSegment, centerDotA, centerDotB);
    group.userData.geoType = 'sphere_sphere_distance';
    group.userData.srcBlockId = ${blockId};
    group.userData.distance = surfaceDistance;
    group.userData.centerDistance = centerDistance;
    group.userData.radiusA = radiusA;
    group.userData.radiusB = radiusB;
    group.userData.centreA = centreA.clone();
    group.userData.centreB = centreB.clone();
    group.userData.labelAnchors = {
      distanceMid: { type: 'world', position: [midpoint.x, midpoint.y, midpoint.z] },
      centerMid: { type: 'world', position: [
        centreA.clone().add(centreB).multiplyScalar(0.5).x,
        centreA.clone().add(centreB).multiplyScalar(0.5).y,
        centreA.clone().add(centreB).multiplyScalar(0.5).z,
      ] },
    };
    group.userData.labels = [
      {
        anchor: 'centerMid',
        text: '|B - A| = ' + Number(centerDistance.toFixed(3)),
        distanceFactor: 8,
        offset: [0.12, 0.12, 0],
        color: centerLineColor,
      },
      {
        anchor: 'distanceMid',
        text: 'd = ' + Number(surfaceDistance.toFixed(3)),
        distanceFactor: 6,
        offset: [0, 0, 0],
        emphasis: true,
        className: 'distance-highlight-label',
      },
    ];

    if (typeof threeObjStore === 'object' && threeObjStore) threeObjStore[${blockId}] = group;
    return group;
  })()`

    return [code, Order.FUNCTION_CALL]
  }
}

export default initSphereDistanceBlock
