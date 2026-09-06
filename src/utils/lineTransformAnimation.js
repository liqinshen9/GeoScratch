import * as THREE from 'three'

/**
 * Animation opt-in for a line driven by a transform pipeline (issue #38).
 *
 * A line can't use the pose-lerp path runConnectedTransformPipelines
 * (generateAndRun.js) bakes for every other object. Its wall-to-wall extent is baked
 * into geometry, so interpolating position/rotation would carry the wrong
 * extent through every intermediate frame -- the same #77 problem
 * rebuildTransformedLine (generateAndRun.js) exists to solve, once per frame
 * instead of once per edit. Actually rebuilding per frame is far too expensive (a build makes
 * canvas textures and a full set of glyph styles), so instead we drive the
 * already-built group with an explicit world matrix that maps its baked
 * segment onto the correctly re-clipped segment for the pose:
 *
 *     x = O1 + s*u1   ->   Op + (k*s + c)*up
 *
 * a rotation u1->up, a stretch of k ALONG u1, and a slide of c along the line.
 * The stretch axis is the line's own direction, so the tube's cross-section --
 * and with it the apparent thickness at every zoom level -- is untouched. k and
 * c come from re-running the same box clip the build used, so both ends sit
 * exactly on the bounding box at every frame; the map is affine in s, so the
 * midpoint (and the label anchored to it) lands on the new midpoint. At
 * progress 1 the matrix is the identity: pixel-identical to the static scene.
 *
 * `startOrigin`/`startDirection` describe the untransformed line (progress 0);
 * `line` is the rebuilt, fully transformed one (progress 1, its resting state).
 * The matrix is a world matrix, so this assumes the line is top-level in the
 * scene (its <primitive> wrapper group is identity) -- the same assumption
 * rebuildTransformedLine and the pose path already make.
 * This replaces the line's own t-sweep closure (geoVectorLine.js) when both
 * apply -- the marker instead rides along at its fixed t, which is what the
 * pipeline is actually doing to it.
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
  // Rotation BACK to the untransformed direction: the resting state is progress
  // 1, so everything here is parameterised by how far back towards 0 we are.
  const qToStart = new THREE.Quaternion().setFromUnitVectors(u1, u0)
  const identityQuat = new THREE.Quaternion()

  line.updateMatrix()
  const resting = line.matrix.clone()
  // The build offsets the whole group by a sub-visual perpendicular jitter to
  // break z-fighting between coincident lines; the marker's world position has
  // to keep it, or it would shift by that much at rest.
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
    // Hand the group (and the marker) back to the normal matrixAutoUpdate path,
    // so nothing about a line that is merely selected differs from one that is
    // not -- ZoomInvariantScaler in particular writes the marker's scale every
    // frame and needs its matrix derived from it again.
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

    // A pose whose line misses the box entirely has no interval to clip to;
    // carry the segment rigidly (k = 1) for that frame rather than collapsing
    // it. Only reachable off-screen, since both ends of the animation cross it.
    const clipped = boxInterval(op, up) || extent
    const k = (clipped[1] - clipped[0]) / span
    const c = clipped[0] - k * extentStart

    // I + (k-1)*u1(x)u1 -- scale k along u1, identity across it. Symmetric, so
    // Matrix4.set's row-major order doesn't come into it.
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
      // The marker is a point ON the line at a fixed t, not part of its baked
      // extent, so it neither slides with c nor stretches with k: pin it to
      // "interpolated origin + t * interpolated direction" and undo the group's
      // matrix so the sphere stays round. Its zoom-invariant scale is still
      // whatever ZoomInvariantScaler last wrote -- read here rather than
      // overwritten, since with matrixAutoUpdate off its own write is inert.
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
