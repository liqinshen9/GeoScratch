export function buildDotProductVisualExpression(blockId, uExpression, vExpression) {
  const id = JSON.stringify(blockId)
  return `(function(){
    const uVal = ${uExpression};
    const vVal = ${vExpression};

    if (!uVal || !vVal || !uVal.isVector3 || !vVal.isVector3) return 0;

    const dot = uVal.dot(vVal);
    const lenP = uVal.length();
    const lenQ = vVal.length();
    const uLabel = vectorNotation.getLabel(uVal, 'p');
    const vLabel = vectorNotation.getLabel(vVal, 'q');
    const showOperandLabels = vectorNotation.shouldShowOperandLabels(uVal, vVal);
    const safeLen = (x) => (isFinite(x) && x > 0 ? x : 1);
    const headLenRatio = 0.25, headWidthRatio = 0.10;
    const fmt = vectorNotation.formatVector;
    const fmtN = vectorNotation.formatNumber;
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
    const origin = new THREE.Vector3(0, 0, 0);
    const pointDifferenceVal = uVal.userData?.geoType === 'point_difference_vector' ? uVal : (
      vVal.userData?.geoType === 'point_difference_vector' ? vVal : null
    );
    const normalVal = pointDifferenceVal === uVal ? vVal : uVal;
    const normalLen = normalVal.length();
    const isPointPlaneDistance = Boolean(pointDifferenceVal);
    if (isPointPlaneDistance) {
      const distance = normalLen > 1e-12 ? Math.abs(dot) / normalLen : 0;
      const projection = normalLen > 1e-12
        ? normalVal.clone().multiplyScalar(dot / normalVal.lengthSq())
        : new THREE.Vector3(0, 0, 0);
      const distanceStart = pointDifferenceVal.userData.start?.isVector3
        ? pointDifferenceVal.userData.start.clone()
        : pointDifferenceVal.userData.end.clone().sub(projection);
      const distanceEnd = distanceStart.clone().add(projection);
      const labelPos = distanceStart
        .clone()
        .add(distanceEnd)
        .multiplyScalar(0.5);

      let distanceVector;
      if (distance > 1e-8) {
        distanceVector = makeSegment(distanceStart.clone(), distanceEnd.clone(), 0xfacc15);
      } else {
        distanceVector = new THREE.Mesh(
          new THREE.SphereGeometry(0.04, 16, 12),
          new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4, metalness: 0.1 })
        );
        distanceVector.position.copy(distanceStart);
      }
      distanceVector.userData.geoType = 'distance_segment';
      distanceVector.userData.length = safeLen(distance);
      distanceVector.userData.headLenRatio = headLenRatio;
      distanceVector.userData.headWidthRatio = headWidthRatio;
      distanceVector.userData.srcBlockId = ${id};

      const normalUnit = normalLen > 1e-12 ? normalVal.clone().normalize() : new THREE.Vector3(0, 1, 0);
      const labelSide = pointDifferenceVal.userData.end.clone().sub(distanceStart);
      labelSide.addScaledVector(normalUnit, -labelSide.dot(normalUnit));
      if (labelSide.lengthSq() < 1e-10) labelSide.set(1, 0, 0);
      labelSide.normalize().multiplyScalar(-1);
      const normalExtent = Math.max(2.2, distance + 1.4);
      const normalLineGeom = new THREE.BufferGeometry().setFromPoints([
        distanceStart.clone().addScaledVector(normalUnit, -1.0),
        distanceStart.clone().addScaledVector(normalUnit, normalExtent),
      ]);
      const normalLine = new THREE.Line(
        normalLineGeom,
        new THREE.LineDashedMaterial({ color: 0xef4444, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.86 })
      );
      normalLine.computeLineDistances();
      const normalTip = distanceStart.clone().addScaledVector(normalUnit, normalExtent);
      const normalArrowHead = makeArrowHead(normalTip, normalUnit, 0xef4444);

      const guideGeom = new THREE.BufferGeometry().setFromPoints([distanceEnd.clone(), pointDifferenceVal.userData.end.clone()]);
      const guideLine = new THREE.Line(
        guideGeom,
        new THREE.LineDashedMaterial({ color: 0x111827, dashSize: 0.14, gapSize: 0.1, transparent: true, opacity: 0.82 })
      );
      guideLine.computeLineDistances();

      const tangent = pointDifferenceVal.userData.end.clone().sub(distanceEnd);
      if (tangent.lengthSq() < 1e-10) {
        tangent.set(1, 0, 0);
        if (Math.abs(tangent.dot(normalUnit)) > 0.85) tangent.set(0, 0, 1);
      }
      tangent.addScaledVector(normalUnit, -tangent.dot(normalUnit));
      if (tangent.lengthSq() < 1e-10) tangent.set(1, 0, 0);
      tangent.normalize();
      const markerSize = Math.min(0.42, Math.max(0.18, distance * 0.16));
      const rightAngle = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          distanceEnd.clone().addScaledVector(normalUnit, -markerSize),
          distanceEnd.clone().addScaledVector(normalUnit, -markerSize).addScaledVector(tangent, markerSize),
          distanceEnd.clone().addScaledVector(tangent, markerSize),
        ]),
        new THREE.LineBasicMaterial({ color: 0x111827, transparent: true, opacity: 0.9 })
      );
      normalLine.userData.geoType = 'geo_helper';
      normalArrowHead.userData.geoType = 'geo_helper';
      guideLine.userData.geoType = 'geo_helper';
      rightAngle.userData.geoType = 'geo_helper';
      normalLine.userData.srcBlockId = ${id};
      normalArrowHead.userData.srcBlockId = ${id};
      guideLine.userData.srcBlockId = ${id};
      rightAngle.userData.srcBlockId = ${id};

      const group = new THREE.Group();
      group.add(distanceVector, normalLine, normalArrowHead, guideLine, rightAngle);
      group.userData.geoType = 'point_plane_distance_dot';
      group.userData.srcBlockId = ${id};
      group.userData.dot = dot;
      group.userData.distance = distance;
      group.userData.labelAnchors = {
        formula: { type: 'world', position: [labelPos.x + labelSide.x * 0.36, labelPos.y + labelSide.y * 0.36, labelPos.z + labelSide.z * 0.36] },
        normal: { type: 'world', position: [normalTip.x + labelSide.x * 0.42, normalTip.y + labelSide.y * 0.42, normalTip.z + labelSide.z * 0.42] },
      };
      group.userData.labels = [
        {
          anchor: 'normal',
          text: 'n',
          distanceFactor: 8,
          offset: [0, 0, 0],
          className: 'normal-vector-label',
        },
        {
          anchor: 'formula',
          text: 'd = ' + fmtN(distance),
          distanceFactor: 6,
          offset: [0, 0, 0],
          emphasis: true,
          className: 'distance-highlight-label',
        },
      ];

      if (typeof threeObjStore === 'object' && threeObjStore) {
        threeObjStore[${id}] = group;
      }
      return distance;
    }

    const arrowP = new THREE.ArrowHelper(
      (lenP > 0 ? uVal.clone().normalize() : new THREE.Vector3(1, 0, 0)),
      origin, safeLen(lenP), 0xca8a04, headLenRatio, headWidthRatio
    );
    const arrowQ = new THREE.ArrowHelper(
      (lenQ > 0 ? vVal.clone().normalize() : new THREE.Vector3(1, 0, 0)),
      origin, safeLen(lenQ), 0xbe185d, headLenRatio, headWidthRatio
    );

    const projQ = new THREE.Vector3();
    let projLen = 0;
    let projObj;
    const denom = uVal.lengthSq();
    if (denom > 1e-12) {
      projQ.copy(uVal).multiplyScalar(vVal.dot(uVal) / denom);
      projLen = projQ.length();
      if (projLen > 1e-8) {
        projObj = new THREE.ArrowHelper(
          projQ.clone().normalize(), origin, safeLen(projLen),
          0xbe185d, headLenRatio, headWidthRatio
        );
      } else {
        projObj = new THREE.Mesh(
          new THREE.SphereGeometry(0.04, 16, 12),
          new THREE.MeshStandardMaterial({ color: 0xbe185d, roughness: 0.4, metalness: 0.1 })
        );
      }
    } else {
      projObj = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xbe185d, roughness: 0.4, metalness: 0.1 })
      );
    }

    const pDir = lenP > 1e-8 ? uVal.clone().normalize() : new THREE.Vector3(1, 0, 0);
    const extLen = Math.max(lenP, lenQ, projLen, 1) * 1.4;
    const axisGeom = new THREE.BufferGeometry().setFromPoints([
      pDir.clone().multiplyScalar(-extLen),
      pDir.clone().multiplyScalar(extLen),
    ]);
    const axisLine = new THREE.Line(
      axisGeom,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
    );

    const dropGeom = new THREE.BufferGeometry().setFromPoints([vVal.clone(), projQ.clone()]);
    const dropLine = new THREE.Line(
      dropGeom,
      new THREE.LineDashedMaterial({ color: 0xcbd5e1, dashSize: 0.15, gapSize: 0.1 })
    );
    dropLine.computeLineDistances();

    const tag = (o, l) => {
      o.userData.geoType = 'geo_vector';
      o.userData.length = safeLen(l);
      o.userData.headLenRatio = headLenRatio;
      o.userData.headWidthRatio = headWidthRatio;
      o.userData.srcBlockId = ${id};
      return o;
    };
    tag(arrowP, lenP);
    tag(arrowQ, lenQ);
    tag(projObj, projLen);
    axisLine.userData.geoType = 'geo_helper';
    axisLine.userData.srcBlockId = ${id};
    dropLine.userData.geoType = 'geo_helper';
    dropLine.userData.srcBlockId = ${id};

    const group = new THREE.Group();
    group.add(axisLine, arrowP, arrowQ, dropLine, projObj);
    group.userData.geoType = 'vector_dot_product';
    group.userData.srcBlockId = ${id};
    group.userData.dot = dot;

    const projTip = projQ.clone();
    const formulaPos = new THREE.Vector3()
      .addVectors(uVal, vVal)
      .multiplyScalar(0.5)
      .add(new THREE.Vector3(0, 0.35, 0));

    group.userData.labelAnchors = {
      pTip: { type: 'world', position: [uVal.x, uVal.y, uVal.z] },
      qTip: { type: 'world', position: [vVal.x, vVal.y, vVal.z] },
      projTip: { type: 'world', position: [projTip.x, projTip.y, projTip.z] },
      formula: { type: 'world', position: [formulaPos.x, formulaPos.y, formulaPos.z] },
    };
    group.userData.labels = [
      ...(showOperandLabels ? [
        { anchor: 'pTip', text: uLabel + ' = ' + fmt(uVal), distanceFactor: 8, offset: [0.12, 0.12, 0], color: '#ca8a04' },
        { anchor: 'qTip', text: vLabel + ' = ' + fmt(vVal), distanceFactor: 8, offset: [0.12, 0.12, 0], color: '#be185d' },
      ] : []),
      {
        anchor: 'formula',
        text: vectorNotation.dotLabel(uVal, vVal) + ' = ' + fmtN(dot),
        distanceFactor: 6,
        offset: [0, 0, 0],
        emphasis: true,
      },
    ];

    if (typeof threeObjStore === 'object' && threeObjStore) {
      const base = ${id};
      threeObjStore[base + '_axis'] = axisLine;
      threeObjStore[base + '_p'] = arrowP;
      threeObjStore[base + '_q'] = arrowQ;
      threeObjStore[base + '_drop'] = dropLine;
      threeObjStore[base + '_proj'] = projObj;
      threeObjStore[base] = group;
    }
    return dot;
  })()`
}
