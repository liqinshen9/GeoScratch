import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

let REGISTERED = false

export function initPointPlaneDistanceBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.point_plane_distance = {
    init() {
      this.appendDummyInput().appendField('Distance from Point to Plane')
      this.appendValueInput('POINT').setCheck('vector3').appendField('Point:')
      this.appendValueInput('PLANE').setCheck('obj3D').appendField('Plane:')
      this.setInputsInline(false)
      this.setOutput(true, 'obj3D')
      this.setStyle(BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS)
      this.setTooltip('Compute the distance from any point to any point-normal plane.')
      this.setDeletable(true)
      this.setMovable(true)
    },
  }

  javascriptGenerator.forBlock.point_plane_distance = function (block, generator) {
    const point = generator.valueToCode(block, 'POINT', Order.FUNCTION_CALL) || 'null'
    const plane = generator.valueToCode(block, 'PLANE', Order.FUNCTION_CALL) || 'null'

    const code = `(function(){
    const point = ${point};
    const plane = ${plane};
    if (!point?.isVector3 || !plane?.isObject3D) return null;

    const planePoint = plane.userData?.point?.isVector3 ? plane.userData.point.clone() : null;
    const normalSource = plane.userData?.normalUnit?.isVector3
      ? plane.userData.normalUnit.clone()
      : plane.userData?.normalRaw?.isVector3
        ? plane.userData.normalRaw.clone()
        : null;
    if (!planePoint || !normalSource || normalSource.lengthSq() < 1e-12) return null;

    // Captured before normalize() mutates it: n is drawn at its own magnitude.
    const normalLength = normalSource.length();
    // The plane is an input here, so its normal can take the plane's own colour,
    // matching the arrow parametricPlane draws for the same thing. vectorProject
    // and the dot product keep the operand colour: there the vector really is an
    // arbitrary projection target, not a plane's normal.
    const planeBlockId = plane?.userData?.srcBlockId;
    const normalColor = planeBlockId
      ? window.GeoScratchColors.forInstance('plane', planeBlockId)
      : window.GeoScratchColors.forRole('operandB');
    const normal = normalSource.normalize();
    const signedDistance = point.clone().sub(planePoint).dot(normal);
    const distance = Math.abs(signedDistance);
    const distanceStart = planePoint.clone();
    const distanceEnd = planePoint.clone().addScaledVector(normal, signedDistance);
    const safeLength = Number.isFinite(distance) && distance > 1e-8 ? distance : 1;
    const midpoint = distanceStart.clone().add(distanceEnd).multiplyScalar(0.5);
    const difference = point.clone().sub(planePoint);
    const fmt = vectorNotation.formatVector;
    // Just enough to clear the distance bar's radius plus the glyph's tube;
    // fixed rather than distance-scaled, which threw it far sideways.
    const NORMAL_SIDE_CLEARANCE = 0.08;
    const makeDistanceIllustration = () => {
      const illustration = new THREE.Group();
      // n through the shared glyph at its own magnitude, so it follows the
      // vector style setting and takes a halo like any other vector. It was a
      // bespoke dashed ray of length max(2.2, d + 1.4), labelled "n" while
      // showing nothing of the sort.
      const normalTip = distanceStart.clone().addScaledVector(normal, normalLength);
      const normalGlyph = window.buildVectorShaftGlyph(
        THREE, ${JSON.stringify(block.id)} + '_normal',
        distanceStart.clone(), normal.clone(), normalLength > 1e-8 ? normalLength : 1, normalColor
      );
      normalGlyph.userData.geoType = 'distance_normal_arrow';
      normalGlyph.userData.srcBlockId = ${JSON.stringify(block.id)};

      const guideGeom = new THREE.BufferGeometry().setFromPoints([distanceEnd.clone(), point.clone()]);
      const guideLine = new THREE.Line(
        guideGeom,
        new THREE.LineDashedMaterial({ color: window.GeoScratchColors.forRole('accent'), dashSize: 0.14, gapSize: 0.1, transparent: true, opacity: 0.82 })
      );
      guideLine.computeLineDistances();

      const tangent = point.clone().sub(distanceEnd);
      tangent.addScaledVector(normal, -tangent.dot(normal));
      if (tangent.lengthSq() < 1e-10) {
        tangent.set(1, 0, 0);
        if (Math.abs(tangent.dot(normal)) > 0.85) tangent.set(0, 0, 1);
      }
      tangent.normalize();
      const markerSize = Math.min(0.42, Math.max(0.18, distance * 0.16));
      const cornerPoints = [
        distanceEnd.clone().addScaledVector(normal, -markerSize),
        distanceEnd.clone().addScaledVector(normal, -markerSize).addScaledVector(tangent, markerSize),
        distanceEnd.clone().addScaledVector(tangent, markerSize),
      ];
      const rightAngle = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(cornerPoints),
        new THREE.LineBasicMaterial({ color: window.GeoScratchColors.forRole('accent'), transparent: true, opacity: 0.9 })
      );

      const footDot = window.geoPointMarker({ color: window.GeoScratchColors.forRole('distance'), radius: 0.04 });
      footDot.position.copy(distanceStart);


      // The normal shares the distance bar's origin AND axis, so drawn true it
      // sits inside the bar. Shift it along the tangent -- the same
      // perpendicular the right-angle marker uses, pointing toward P -- so the
      // two read as two things. The tail no longer sits exactly on the plane
      // point; this arrow shows a direction, not an anchor.
      normalGlyph.position.addScaledVector(tangent, NORMAL_SIDE_CLEARANCE);
      // Keep the label with the arrow, which just moved off the axis.
      normalTip.addScaledVector(tangent, NORMAL_SIDE_CLEARANCE);

      illustration.add(normalGlyph, guideLine, rightAngle, footDot);
      illustration.userData.geoType = 'distance_projection_illustration';
      illustration.userData.srcBlockId = ${JSON.stringify(block.id)};
      return { illustration, normalTip };
    };

    const pointColor = window.GeoScratchColors.forInstance('point', ${JSON.stringify(block.id)});
    const differenceVectorColor = window.GeoScratchColors.forInstance('vector', ${JSON.stringify(block.id)});
    const distanceColor = window.GeoScratchColors.forRole('distance');

    const group = new THREE.Group();
    const pointDot = window.geoPointMarker({ color: pointColor, radius: 0.045 });
    pointDot.position.copy(point);

    const planePointDot = window.geoPointMarker({ color: pointColor, radius: 0.045 });
    planePointDot.position.copy(planePoint);

    let differenceArrow = null;
    if (difference.lengthSq() > 1e-12) {
      differenceArrow = window.buildVectorShaftGlyph(
        THREE, ${JSON.stringify(block.id)} + '_diff', planePoint.clone(),
        difference.clone().normalize(), difference.length(), differenceVectorColor
      );
      differenceArrow.userData.geoType = 'geo_vector';
      differenceArrow.userData.srcBlockId = ${JSON.stringify(block.id)};
    }

    let segment;
    if (distance > 1e-8) {
      segment = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, safeLength, 18),
        new THREE.MeshBasicMaterial({ color: distanceColor, transparent: true, opacity: 0.92, depthWrite: false })
      );
      segment.position.copy(midpoint);
      segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), distanceEnd.clone().sub(distanceStart).normalize());
    } else {
      segment = window.geoPointMarker({ color: distanceColor, radius: 0.05 });
      segment.position.copy(point);
    }
    segment.userData.geoType = 'distance_segment';
    segment.userData.srcBlockId = ${JSON.stringify(block.id)};
    const { illustration, normalTip } = makeDistanceIllustration();
    group.add(segment, illustration, pointDot, planePointDot);
    if (differenceArrow) group.add(differenceArrow);

    group.userData.geoType = 'point_plane_distance_projection_magnitude';
    group.userData.srcBlockId = ${JSON.stringify(block.id)};
    group.userData.distance = distance;
    group.userData.point = point.clone();
    group.userData.planePoint = planePoint.clone();
    group.userData.normalUnit = normal.clone();
    group.userData.labelAnchors = {
      distanceMid: { type: 'world', position: [midpoint.x, midpoint.y, midpoint.z] },
      normal: { type: 'world', position: [normalTip.x, normalTip.y, normalTip.z] },
      differenceMid: { type: 'world', position: [
        planePoint.clone().add(point).multiplyScalar(0.5).x,
        planePoint.clone().add(point).multiplyScalar(0.5).y,
        planePoint.clone().add(point).multiplyScalar(0.5).z,
      ] },
    };
    group.userData.labels = [
      {
        anchor: 'differenceMid',
        text: 'P - Q1 = ' + fmt(difference),
        distanceFactor: 8,
        offset: [0.12, 0.12, 0],
        color: differenceVectorColor,
      },
      {
        anchor: 'distanceMid',
        text: 'd = ' + Number(distance.toFixed(3)),
        distanceFactor: 6,
        offset: [0, 0, 0],
        emphasis: true,
        role: 'distance',
        color: window.GeoScratchColors.forRole('distance'),
      },
      {
        anchor: 'normal',
        text: 'n',
        distanceFactor: 8,
        offset: [0, 0, 0],
        emphasis: true,
        color: normalColor,
      },
    ];

    if (typeof threeObjStore === 'object' && threeObjStore) {
      if (differenceArrow) threeObjStore[${JSON.stringify(block.id)} + '_diff'] = differenceArrow;
      threeObjStore[${JSON.stringify(block.id)}] = group;
    }
    return group;
  })()`

    return [code, Order.FUNCTION_CALL]
  }
}

export default initPointPlaneDistanceBlock
