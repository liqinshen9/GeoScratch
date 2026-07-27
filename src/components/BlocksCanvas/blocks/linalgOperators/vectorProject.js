import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

let REGISTERED = false

export function initVectorProjectBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['vector_project'] = {
    init() {
      this.appendDummyInput().appendField('Vector Project')
      this.appendValueInput('U').setCheck('vector3').appendField('u:')
      this.appendValueInput('V').setCheck('vector3').appendField('onto ').appendField('v:')
      this.setInputsInline(true)

      this.setOutput(true, 'vector3')
      this.setStyle(BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS)
      this.setTooltip('Compute projection of u onto v, show it, and return the projection vector')
      this.setDeletable(true)
      this.setMovable(true)
    },
  }

  javascriptGenerator.forBlock['vector_project'] = function (block, g) {
    const u = g.valueToCode(block, 'U', Order.FUNCTION_CALL) || 'null';
    const v = g.valueToCode(block, 'V', Order.FUNCTION_CALL) || 'null';

    const code = `(function(){
    const uVal = ${u};
    const vVal = ${v};
    if (!uVal || !vVal || !uVal.isVector3 || !vVal.isVector3) return null;

    const headLenRatio = 0.25, headWidthRatio = 0.10;
    const safeLen = (x) => (isFinite(x) && x > 0 ? x : 1);
    const fmt = vectorNotation.formatVector;
    const uLabel = vectorNotation.getLabel(uVal, 'u');
    const vLabel = vectorNotation.getLabel(vVal, 'v');
    const showOperandLabels = vectorNotation.shouldShowOperandLabels(uVal, vVal);
    const projectionLabel = 'proj ' + uLabel + ' on ' + vLabel;
    const makeSegment = (start, end, color, radius = 0.035) => {
      const delta = end.clone().sub(start);
      const length = delta.length();
      const segment = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, safeLen(length), 18),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthWrite: false })
      );
      segment.position.copy(start).add(end).multiplyScalar(0.5);
      if (length > 1e-8) {
        segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
      }
      return segment;
    };
    const makeArrowHead = (tip, direction, color) => {
      const dir = direction.lengthSq() > 1e-12 ? direction.clone().normalize() : new THREE.Vector3(0, 1, 0);
      const height = 0.38;
      const head = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, height, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
      );
      head.position.copy(tip).addScaledVector(dir, -height / 2);
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      return head;
    };
    const makeProjectionShadow = (foot) => {
      const shadowGroup = new THREE.Group();
      const footDot = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35, metalness: 0.05 })
      );
      footDot.userData.zoomInvariantRadius = 0.04;
      footDot.userData.zoomInvariantUniform = true;
      footDot.position.copy(foot);

      shadowGroup.add(footDot);
      shadowGroup.userData.geoType = 'projection_shadow';
      shadowGroup.userData.srcBlockId=${JSON.stringify(block.id)};
      return shadowGroup;
    };
    const makeDistanceIllustration = (basePoint, topPoint, pointP, normal, distanceLength) => {
      const normalUnit = normal.lengthSq() > 1e-12 ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
      const group = new THREE.Group();

      const normalExtent = Math.max(2.2, distanceLength + 1.4);
      const normalLineGeom = new THREE.BufferGeometry().setFromPoints([
        basePoint.clone().addScaledVector(normalUnit, -1.0),
        basePoint.clone().addScaledVector(normalUnit, normalExtent),
      ]);
      const normalLine = new THREE.Line(
        normalLineGeom,
        new THREE.LineDashedMaterial({ color: 0xef4444, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.86 })
      );
      normalLine.computeLineDistances();
      const normalTip = basePoint.clone().addScaledVector(normalUnit, normalExtent);
      const normalArrowHead = makeArrowHead(normalTip, normalUnit, 0xef4444);

      const guideGeom = new THREE.BufferGeometry().setFromPoints([topPoint.clone(), pointP.clone()]);
      const guideLine = new THREE.Line(
        guideGeom,
        new THREE.LineDashedMaterial({ color: 0x111827, dashSize: 0.14, gapSize: 0.1, transparent: true, opacity: 0.82 })
      );
      guideLine.computeLineDistances();

      const tangent = pointP.clone().sub(topPoint);
      if (tangent.lengthSq() < 1e-10) {
        tangent.set(1, 0, 0);
        if (Math.abs(tangent.dot(normalUnit)) > 0.85) tangent.set(0, 0, 1);
      }
      tangent.addScaledVector(normalUnit, -tangent.dot(normalUnit));
      if (tangent.lengthSq() < 1e-10) tangent.set(1, 0, 0);
      tangent.normalize();
      const markerSize = Math.min(0.42, Math.max(0.18, distanceLength * 0.16));
      const cornerPoints = [
        topPoint.clone().addScaledVector(normalUnit, -markerSize),
        topPoint.clone().addScaledVector(normalUnit, -markerSize).addScaledVector(tangent, markerSize),
        topPoint.clone().addScaledVector(tangent, markerSize),
      ];
      const rightAngle = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(cornerPoints),
        new THREE.LineBasicMaterial({ color: 0x111827, transparent: true, opacity: 0.9 })
      );

      group.add(normalLine, normalArrowHead, guideLine, rightAngle);
      group.userData.geoType = 'distance_projection_illustration';
      group.userData.srcBlockId=${JSON.stringify(block.id)};
      return group;
    };

    // Inputs
    const lenU = uVal.length();
    const lenV = vVal.length();

    const arrowU = new THREE.ArrowHelper(
      (lenU>0?uVal.clone().normalize():new THREE.Vector3(1,0,0)),
      new THREE.Vector3(0,0,0), safeLen(lenU), 0x1e40af, headLenRatio, headWidthRatio
    );

    const arrowV = new THREE.ArrowHelper(
      (lenV>0?vVal.clone().normalize():new THREE.Vector3(1,0,0)),
      new THREE.Vector3(0,0,0), safeLen(lenV), 0xb91c1c, headLenRatio, headWidthRatio
    );

    // Projection u onto v
    let projObj, projVec=new THREE.Vector3(), projLen=0, projOrigin=new THREE.Vector3(0,0,0);
    const isPointPlaneDistanceProjection = uVal.userData?.geoType === 'point_difference_vector';
    const inputLabel = vectorNotation.getLabel(uVal, 'u');
    const pointEnd = isPointPlaneDistanceProjection && uVal.userData.end?.isVector3
      ? uVal.userData.end.clone()
      : null;
    const denom = vVal.lengthSq();
    if (denom>1e-12) {
      const scale = uVal.dot(vVal) / denom;
      projVec = vVal.clone().multiplyScalar(scale);
      projLen = projVec.length();
      projOrigin = isPointPlaneDistanceProjection && uVal.userData.start?.isVector3
        ? uVal.userData.start.clone()
        : (pointEnd ? pointEnd.clone().sub(projVec) : new THREE.Vector3(0,0,0));
      if (projLen>1e-8) {
        projObj = isPointPlaneDistanceProjection
          ? makeSegment(projOrigin.clone(), projOrigin.clone().add(projVec), 0xfacc15)
          : new THREE.ArrowHelper(
            projVec.clone().normalize(), projOrigin.clone(),
            safeLen(projLen), 0x5b21b6, headLenRatio, headWidthRatio
          );
      } else {
        projVec.set(0,0,0);
        projOrigin = pointEnd ? pointEnd.clone() : new THREE.Vector3(0,0,0);
        projObj = new THREE.Mesh(
          new THREE.SphereGeometry(0.04, 16, 12),
          new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.4, metalness: 0.1 })
        );
        projObj.userData.zoomInvariantRadius = 0.04;
        projObj.userData.zoomInvariantUniform = true;
      }
    } else {
      projVec.set(0,0,0);
      projOrigin = pointEnd ? pointEnd.clone() : new THREE.Vector3(0,0,0);
      projObj = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.4, metalness: 0.1 })
      );
      projObj.userData.zoomInvariantRadius = 0.04;
      projObj.userData.zoomInvariantUniform = true;
    }

    const tag=(o,l)=>{o.userData.geoType='geo_vector';o.userData.length=safeLen(l);o.userData.headLenRatio=headLenRatio;o.userData.headWidthRatio=headWidthRatio;o.userData.srcBlockId=${JSON.stringify(block.id)};return o;};
    tag(arrowU,lenU); tag(arrowV,lenV); tag(projObj,projLen);
    if (isPointPlaneDistanceProjection) projObj.userData.geoType = 'distance_segment';

    // Guide: tip(u) -> tip(proj). Hide it for point-plane distance so it is not mistaken for the distance.
    const uTip = pointEnd ? pointEnd.clone() : uVal.clone();
    const pTip = projOrigin.clone().add(projVec);
    let guideLine = null;
    let projectionShadow = null;
    let distanceIllustration = null;
    if (!isPointPlaneDistanceProjection) {
      const guideGeom = new THREE.BufferGeometry().setFromPoints([uTip, pTip]);
      const guideMat  = new THREE.LineBasicMaterial({ color: 0xffff00, transparent:true, opacity:1 });
      guideLine = new THREE.Line(guideGeom, guideMat);
      guideLine.userData.geoType='geo_helper';
      guideLine.userData.srcBlockId=${JSON.stringify(block.id)};
    } else {
      projectionShadow = makeProjectionShadow(projOrigin);
      distanceIllustration = makeDistanceIllustration(projOrigin, pTip, uTip, vVal, projLen);
    }

    const group = new THREE.Group();
    if (isPointPlaneDistanceProjection) {
      group.add(projObj, projectionShadow, distanceIllustration);
    } else {
      group.add(arrowU, arrowV, projObj, guideLine);
    }
    group.userData.geoType='geo_vector_group';
    group.userData.srcBlockId=${JSON.stringify(block.id)};

    const normalLabelUnit = lenV > 1e-12 ? vVal.clone().normalize() : new THREE.Vector3(0, 1, 0);
    const normalLabelExtent = Math.max(2.2, projLen + 1.4);
    const normalLabelSide = uTip.clone().sub(projOrigin);
    normalLabelSide.addScaledVector(normalLabelUnit, -normalLabelSide.dot(normalLabelUnit));
    if (normalLabelSide.lengthSq() < 1e-10) normalLabelSide.set(1, 0, 0);
    normalLabelSide.normalize();
    const normalLabelTip = projOrigin.clone()
      .addScaledVector(normalLabelUnit, normalLabelExtent)
      .addScaledVector(normalLabelSide, -0.42);

    // Labels at tips
    group.userData.labelAnchors = {
      uTip:{type:'world', position:[uTip.x,     uTip.y,     uTip.z    ]},
      vTip:{type:'world', position:[vVal.x,     vVal.y,     vVal.z    ]},
      pTip:{type:'world', position:[pTip.x,  pTip.y,  pTip.z ]},
      normal:{type:'world', position:[normalLabelTip.x, normalLabelTip.y, normalLabelTip.z]},
    };
    group.userData.labels = isPointPlaneDistanceProjection
      ? [
        { anchor:'normal', text:'n', distanceFactor:8, offset:[0,0,0], className: 'normal-vector-label' },
      ]
      : showOperandLabels
        ? [
        { anchor:'uTip', text: uLabel + ' = ' + fmt(uVal),      distanceFactor:8, offset:[0.12,0.12,0], color: '#1e40af' },
        { anchor:'vTip', text: vLabel + ' = ' + fmt(vVal),      distanceFactor:8, offset:[0.12,0.12,0], color: '#b91c1c' },
        { anchor:'pTip', text: projectionLabel + ' = ' + fmt(projVec), distanceFactor:8, offset:[0.12,0.12,0], color: projLen > 1e-8 ? '#5b21b6' : '#ffff00' },
      ]
        : [
        { anchor:'pTip', text: projectionLabel + ' = ' + fmt(projVec), distanceFactor:8, offset:[0.12,0.12,0], color: projLen > 1e-8 ? '#5b21b6' : '#ffff00' },
      ];

    if (typeof threeObjStore==='object' && threeObjStore){
      const base=${JSON.stringify(block.id)};
      if (!isPointPlaneDistanceProjection) {
        threeObjStore[base + '_u']     = arrowU;
        threeObjStore[base + '_v']     = arrowV;
        threeObjStore[base + '_guide'] = guideLine;
      }
      if (!isPointPlaneDistanceProjection) {
        threeObjStore[base + '_proj'] = projObj;
      }
      threeObjStore[base]            = group;
    }
    const resultVector = projVec.clone();
    if (isPointPlaneDistanceProjection) {
      const labelSide = uTip.clone().sub(projOrigin);
      const normalUnitForLabel = lenV > 1e-12 ? vVal.clone().normalize() : new THREE.Vector3(0, 1, 0);
      labelSide.addScaledVector(normalUnitForLabel, -labelSide.dot(normalUnitForLabel));
      if (labelSide.lengthSq() < 1e-10) labelSide.set(1, 0, 0);
      labelSide.normalize().multiplyScalar(-1);
      vectorNotation.setVectorMetadata(resultVector, {
        geoType: 'point_plane_distance_projection_vector',
        start: projOrigin.clone(),
        end: pTip.clone(),
        labelSide,
        label: 'proj(' + inputLabel + ' onto n)',
      });
    } else {
      vectorNotation.setVectorMetadata(resultVector, {
        geoType: 'named_vector_expression',
        label: projectionLabel,
      });
    }
    return resultVector;
  })()`;

    return [code, Order.FUNCTION_CALL];
  };
}
