import * as THREE from 'three'

/**
 * Animation opt-in for a line driven by a transform pipeline (#38). Drives the
 * already-built group with a world matrix (x = O1+s*u1 -> Op+(k*s+c)*up:
 * rotate, stretch along the line, slide) rather than re-baking per frame.
 * See docs/architecture/transform-and-line-rebuild.md#line-transform-animation.
 */
export function bakeLineTransformAnimation(line, startOrigin, startDirection, pipelineBlockIds) {
  const boxInterval = line?.userData?.boxInterval
  const extent = line?.userData?.boxExtent
  const endOrigin = line?.userData?.origin
  const endDirection = line?.userData?.direction
  if (typeof boxInterval !== 'function' || !extent || !endOrigin || !endDirection) return
  if (!startOrigin || !startDirection) return

  const [extentStart, extentEnd] = extent
  const span = extentEnd - extentStart
  const o0 = startOrigin.clone()
  const o1 = endOrigin.clone()
  const d0 = startDirection.clone()
  const d1 = endDirection.clone()
  const len0 = d0.length()
  const len1 = d1.length()
  if (!Number.isFinite(span) || Math.abs(span) < 1e-9 || len0 < 1e-9 || len1 < 1e-9) return

  const u0 = d0.clone().divideScalar(len0)
  const u1 = d1.clone().divideScalar(len1)
  // Rotation BACK toward progress 0 -- resting state is progress 1.
  const qToStart = new THREE.Quaternion().setFromUnitVectors(u1, u0)
  const identityQuat = new THREE.Quaternion()

  line.updateMatrix()
  const resting = line.matrix.clone()
  // Keep the build's z-fight jitter offset, or the marker shifts at rest.
  // See docs/architecture/transform-and-line-rebuild.md#keep-the-jitter.
  const jitter = new THREE.Vector3().setFromMatrixPosition(resting)
  const marker = line.userData.tMarker || null
  const tValue = Number(line.userData.t)
  const restingMarkerPos = marker ? marker.position.clone() : null
  const hasMarker = !!marker && Number.isFinite(tValue)

  const qp = new THREE.Quaternion()
  const up = new THREE.Vector3()
  const op = new THREE.Vector3()
  const markerPos = new THREE.Vector3()
  const mScale = new THREE.Matrix4()
  const mRot = new THREE.Matrix4()
  const mFrom = new THREE.Matrix4()
  const mTo = new THREE.Matrix4()
  const mWorld = new THREE.Matrix4()
  const mMarker = new THREE.Matrix4()
  const mInverse = new THREE.Matrix4()

  const rest = () => {
    // Back to the normal matrixAutoUpdate path.
    // See docs/architecture/transform-and-line-rebuild.md#hand-back-to-matrixautoupdate.
    line.matrixAutoUpdate = true
    if (hasMarker) {
      marker.matrixAutoUpdate = true
      marker.position.copy(restingMarkerPos)
    }
    line.updateMatrix()
    line.updateMatrixWorld(true)
  }

  line.userData.lineTransformAnim = {
    startOrigin: o0,
    startDirection: d0,
    pipelineBlockIds,
  }
  line.userData.animAliasBlockIds = pipelineBlockIds
  line.userData.animate = (p, ease) => {
    const e = typeof ease === 'function' ? ease(p) : p
    const back = 1 - e
    if (back <= 0) {
      rest()
      return
    }

    qp.slerpQuaternions(identityQuat, qToStart, back)
    up.copy(u1).applyQuaternion(qp)
    op.lerpVectors(o1, o0, back)

    // Pose misses the box: carry the segment rigidly (k = 1) this frame.
    // See docs/architecture/transform-and-line-rebuild.md#missed-box-carry-rigidly.
    const clipped = boxInterval(op, up) || extent
    const k = (clipped[1] - clipped[0]) / span
    const c = clipped[0] - k * extentStart

    // I + (k-1)*u1(x)u1 -- scale k along u1, identity across it (symmetric).
    const g = k - 1
    mScale.set(
      1 + g * u1.x * u1.x,
      g * u1.x * u1.y,
      g * u1.x * u1.z,
      0,
      g * u1.y * u1.x,
      1 + g * u1.y * u1.y,
      g * u1.y * u1.z,
      0,
      g * u1.z * u1.x,
      g * u1.z * u1.y,
      1 + g * u1.z * u1.z,
      0,
      0,
      0,
      0,
      1,
    )
    mRot.makeRotationFromQuaternion(qp)
    mFrom.makeTranslation(-o1.x, -o1.y, -o1.z)
    mTo.makeTranslation(op.x + c * up.x, op.y + c * up.y, op.z + c * up.z)
    mWorld.multiplyMatrices(mTo, mRot).multiply(mScale).multiply(mFrom)

    line.matrixAutoUpdate = false
    line.matrix.multiplyMatrices(mWorld, resting)
    line.updateMatrixWorld(true)

    if (hasMarker) {
      // The marker is pinned to interpolated origin + t*direction, not slid
      // or stretched. See docs/architecture/transform-and-line-rebuild.md#marker-not-part-of-extent.
      markerPos
        .copy(op)
        .addScaledVector(up, tValue * THREE.MathUtils.lerp(len1, len0, back))
        .add(jitter)
      mMarker.compose(markerPos, identityQuat, marker.scale)
      mInverse.copy(line.matrix).invert()
      marker.matrixAutoUpdate = false
      marker.matrix.multiplyMatrices(mInverse, mMarker)
      marker.updateMatrixWorld(true)
    }
  }
}
