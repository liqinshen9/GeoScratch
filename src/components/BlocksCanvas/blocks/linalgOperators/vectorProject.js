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
    const fmt = (vec) => '[' + [vec.x, vec.y, vec.z].map(n => Number(n.toFixed(3))).join(', ') + ']';
    const makeProjectionShadow = (foot, normal, sourcePoint) => {
      const normalUnit = normal.lengthSq() > 1e-12 ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
      const shadowGroup = new THREE.Group();

      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.34, 48),
        new THREE.MeshBasicMaterial({
          color: 0x111827,
          transparent: true,
          opacity: 0.24,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      shadow.setRotationFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normalUnit)
      );
      shadow.position.copy(foot).addScaledVector(normalUnit, 0.012);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.34, 0.39, 48),
        new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      ring.quaternion.copy(shadow.quaternion);
      ring.position.copy(shadow.position).addScaledVector(normalUnit, 0.004);

      const footDot = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35, metalness: 0.05 })
      );
      footDot.position.copy(foot);

      const dropGeom = new THREE.BufferGeometry().setFromPoints([sourcePoint.clone(), foot.clone()]);
      const dropLine = new THREE.Line(
        dropGeom,
        new THREE.LineDashedMaterial({ color: 0xf8fafc, dashSize: 0.16, gapSize: 0.1, transparent: true, opacity: 0.64 })
      );
      dropLine.computeLineDistances();

      shadowGroup.add(shadow, ring, footDot, dropLine);
      shadowGroup.userData.geoType = 'projection_shadow';
      shadowGroup.userData.srcBlockId=${JSON.stringify(block.id)};
      return shadowGroup;
    };

    // Inputs
    const lenU = uVal.length();
    const lenV = vVal.length();

    const arrowU = THREE.makeArrow(
      (lenU>0?uVal.clone().normalize():new THREE.Vector3(1,0,0)),
      new THREE.Vector3(0,0,0), safeLen(lenU), 0x1d4ed8, headLenRatio, headWidthRatio
    );

    const arrowV = THREE.makeArrow(
      (lenV>0?vVal.clone().normalize():new THREE.Vector3(1,0,0)),
      new THREE.Vector3(0,0,0), safeLen(lenV), 0xdc2626, headLenRatio, headWidthRatio
    );

    // Projection u onto v
    let projObj, projVec=new THREE.Vector3(), projLen=0, projOrigin=new THREE.Vector3(0,0,0);
    const isPointPlaneDistanceProjection = uVal.userData?.geoType === 'point_difference_vector';
    const pointEnd = isPointPlaneDistanceProjection && uVal.userData.end?.isVector3
      ? uVal.userData.end.clone()
      : null;
    const denom = vVal.lengthSq();
    if (denom>1e-12) {
      const scale = uVal.dot(vVal) / denom;
      projVec = vVal.clone().multiplyScalar(scale);
      projLen = projVec.length();
      projOrigin = pointEnd ? pointEnd.clone().sub(projVec) : new THREE.Vector3(0,0,0);
      if (projLen>1e-8) {
        projObj = THREE.makeArrow(
          projVec.clone().normalize(), projOrigin.clone(),
          safeLen(projLen), isPointPlaneDistanceProjection ? 0xfacc15 : 0x7c3aed, headLenRatio, headWidthRatio
        );
      } else {
        projVec.set(0,0,0);
        projOrigin = pointEnd ? pointEnd.clone() : new THREE.Vector3(0,0,0);
        projObj = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 16, 12),
          new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.4, metalness: 0.1 })
        );
      }
    } else {
      projVec.set(0,0,0);
      projOrigin = pointEnd ? pointEnd.clone() : new THREE.Vector3(0,0,0);
      projObj = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.4, metalness: 0.1 })
      );
    }

    const tag=(o,l)=>{o.userData.geoType='geo_vector';o.userData.length=safeLen(l);o.userData.headLenRatio=headLenRatio;o.userData.headWidthRatio=headWidthRatio;o.userData.srcBlockId=${JSON.stringify(block.id)};return o;};
    tag(arrowU,lenU); tag(arrowV,lenV); tag(projObj,projLen);

    // Guide: tip(u) -> tip(proj). Hide it for point-plane distance so it is not mistaken for the distance.
    const uTip = pointEnd ? pointEnd.clone() : uVal.clone();
    const pTip = projOrigin.clone().add(projVec);
    let guideLine = null;
    let projectionShadow = null;
    if (!isPointPlaneDistanceProjection) {
      const guideGeom = new THREE.BufferGeometry().setFromPoints([uTip, pTip]);
      const guideMat  = new THREE.LineBasicMaterial({ color: 0xffff00, transparent:true, opacity:1 });
      guideLine = new THREE.Line(guideGeom, guideMat);
      guideLine.userData.geoType='geo_helper';
      guideLine.userData.srcBlockId=${JSON.stringify(block.id)};
    } else {
      projectionShadow = makeProjectionShadow(projOrigin, vVal, uTip);
    }

    const group = new THREE.Group();
    if (isPointPlaneDistanceProjection) {
      group.add(projObj, projectionShadow);
    } else {
      group.add(arrowU, arrowV, projObj, guideLine);
    }
    group.userData.geoType='geo_vector_group';
    group.userData.srcBlockId=${JSON.stringify(block.id)};

    // Labels at tips
    group.userData.labelAnchors = {
      uTip:{type:'world', position:[uTip.x,     uTip.y,     uTip.z    ]},
      vTip:{type:'world', position:[vVal.x,     vVal.y,     vVal.z    ]},
      pTip:{type:'world', position:[pTip.x,  pTip.y,  pTip.z ]},
    };
    group.userData.labels = isPointPlaneDistanceProjection
      ? []
      : [
        { anchor:'uTip', text:'u = ' + fmt(uVal),      distanceFactor:8, offset:[0.12,0.12,0], color: '#1d4ed8' },
        { anchor:'vTip', text:'v = ' + fmt(vVal),      distanceFactor:8, offset:[0.12,0.12,0], color: '#dc2626' },
        { anchor:'pTip', text:'result = ' + fmt(projVec), distanceFactor:8, offset:[0.12,0.12,0], color: projLen > 1e-8 ? '#7c3aed' : '#ffff00' },
      ];

    if (typeof threeObjStore==='object' && threeObjStore){
      const base=${JSON.stringify(block.id)};
      if (!isPointPlaneDistanceProjection) {
        threeObjStore[base + '_u']     = arrowU;
        threeObjStore[base + '_v']     = arrowV;
        threeObjStore[base + '_guide'] = guideLine;
      }
      threeObjStore[base + '_proj']  = projObj;
      if (projectionShadow) threeObjStore[base + '_shadow'] = projectionShadow;
      threeObjStore[base]            = group;
    }
    const resultVector = projVec.clone();
    if (isPointPlaneDistanceProjection) {
      resultVector.userData = {
        geoType: 'point_plane_distance_projection_vector',
        start: projOrigin.clone(),
        end: pTip.clone(),
        label: 'proj(P - Q onto n)',
      };
    }
    return resultVector;
  })()`;

    return [code, Order.FUNCTION_CALL];
  };
}
