export function buildDotProductVisualExpression(blockId, uExpression, vExpression) {
  const id = JSON.stringify(blockId)
  return `(function(){
    const uVal = ${uExpression};
    const vVal = ${vExpression};

    if (!uVal || !vVal || !uVal.isVector3 || !vVal.isVector3) return 0;

    const dot = uVal.dot(vVal);
    const lenP = uVal.length();
    const lenQ = vVal.length();
    const safeLen = (x) => (isFinite(x) && x > 0 ? x : 1);
    const headLenRatio = 0.25, headWidthRatio = 0.10;
    const fmt = (vec) => '[' + [vec.x, vec.y, vec.z].map(n => Number(n.toFixed(3))).join(', ') + ']';
    const fmtN = (n) => Number(Number(n).toFixed(3));
    const origin = new THREE.Vector3(0, 0, 0);
    const isPointPlaneDistance = uVal.userData?.geoType === 'point_difference_vector';
    if (isPointPlaneDistance) {
      const distance = lenQ > 1e-12 ? Math.abs(dot) / lenQ : 0;
      const projection = lenQ > 1e-12
        ? vVal.clone().multiplyScalar(dot / vVal.lengthSq())
        : new THREE.Vector3(0, 0, 0);
      const distanceStart = uVal.userData.end.clone().sub(projection);
      const distanceEnd = uVal.userData.end.clone();
      const labelPos = distanceStart
        .clone()
        .add(distanceEnd)
        .multiplyScalar(0.5);

      let distanceVector;
      if (distance > 1e-8) {
        distanceVector = new THREE.ArrowHelper(
          projection.clone().normalize(),
          distanceStart.clone(),
          safeLen(distance),
          0xfacc15,
          headLenRatio,
          headWidthRatio
        );
      } else {
        distanceVector = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 16, 12),
          new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4, metalness: 0.1 })
        );
        distanceVector.position.copy(distanceStart);
      }
      distanceVector.userData.geoType = 'geo_vector';
      distanceVector.userData.length = safeLen(distance);
      distanceVector.userData.headLenRatio = headLenRatio;
      distanceVector.userData.headWidthRatio = headWidthRatio;
      distanceVector.userData.srcBlockId = ${id};

      const group = new THREE.Group();
      group.add(distanceVector);
      group.userData.geoType = 'point_plane_distance_dot';
      group.userData.srcBlockId = ${id};
      group.userData.dot = dot;
      group.userData.distance = distance;
      group.userData.labelAnchors = {
        formula: { type: 'world', position: [labelPos.x, labelPos.y, labelPos.z] },
      };
      group.userData.labels = [
        {
          anchor: 'formula',
          text: 'distance = |(P - Q) dot n| = ' + fmtN(distance),
          distanceFactor: 6,
          offset: [0.22, 0, 0],
          emphasis: true,
          className: 'distance-highlight-label',
        },
      ];

      if (typeof threeObjStore === 'object' && threeObjStore) {
        threeObjStore[${id} + '_distance'] = distanceVector;
        threeObjStore[${id}] = group;
      }
      return distance;
    }

    const arrowP = new THREE.ArrowHelper(
      (lenP > 0 ? uVal.clone().normalize() : new THREE.Vector3(1, 0, 0)),
      origin, safeLen(lenP), 0xeab308, headLenRatio, headWidthRatio
    );
    const arrowQ = new THREE.ArrowHelper(
      (lenQ > 0 ? vVal.clone().normalize() : new THREE.Vector3(1, 0, 0)),
      origin, safeLen(lenQ), 0xec4899, headLenRatio, headWidthRatio
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
          0xf472b6, headLenRatio, headWidthRatio
        );
      } else {
        projObj = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 16, 12),
          new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.4, metalness: 0.1 })
        );
      }
    } else {
      projObj = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.4, metalness: 0.1 })
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

    const pMid = uVal.clone().multiplyScalar(0.5);
    const projTip = projQ.clone();
    const formulaPos = new THREE.Vector3()
      .addVectors(uVal, vVal)
      .multiplyScalar(0.5)
      .add(new THREE.Vector3(0, 0.35, 0));

    group.userData.labelAnchors = {
      pTip: { type: 'world', position: [uVal.x, uVal.y, uVal.z] },
      qTip: { type: 'world', position: [vVal.x, vVal.y, vVal.z] },
      pMid: { type: 'world', position: [pMid.x, pMid.y, pMid.z] },
      projTip: { type: 'world', position: [projTip.x, projTip.y, projTip.z] },
      formula: { type: 'world', position: [formulaPos.x, formulaPos.y, formulaPos.z] },
    };
    group.userData.labels = [
      { anchor: 'pTip', text: 'p = ' + fmt(uVal), distanceFactor: 8, offset: [0.12, 0.12, 0], color: '#eab308' },
      { anchor: 'qTip', text: 'q = ' + fmt(vVal), distanceFactor: 8, offset: [0.12, 0.12, 0], color: '#ec4899' },
      { anchor: 'pMid', text: '|p| = ' + fmtN(lenP), distanceFactor: 8, offset: [0.1, 0.1, 0], color: '#eab308' },
      { anchor: 'projTip', text: '|proj q| = ' + fmtN(projLen), distanceFactor: 8, offset: [0.1, 0.1, 0], color: '#f472b6' },
      {
        anchor: 'formula',
        text: dot >= 0
          ? 'p · q = (|proj q|)(|p|) = ' + fmtN(projLen) + ' × ' + fmtN(lenP) + ' = ' + fmtN(dot)
          : 'p · q = ' + fmtN(dot) + '  (|proj q| = ' + fmtN(projLen) + ', |p| = ' + fmtN(lenP) + ')',
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
