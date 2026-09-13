import THREE from '@/utils/three'

/**
 * Where a solid's label hangs: just past the object's on-screen outline, in the
 * direction labels rest, instead of at its centre. See
 * docs/architecture/label-declutter.md#silhouette-clearance.
 */

// Enough vertices to find an object's extent to well under a percent; a finer
// teapot is thinned rather than walked whole every frame.
const MAX_SAMPLES = 4096
// Matches BASE_OFFSET_ANGLE in labelSim.js: up and to the right on screen.
const EDGE_X = Math.cos((40 * Math.PI) / 180)
const EDGE_Y = Math.sin((40 * Math.PI) / 180)
const MIN_DEPTH = 1e-3

const sampleCache = new WeakMap()
const toView = new THREE.Matrix4()
const viewCentre = new THREE.Vector3()

function localSamples(geometry) {
  const cached = sampleCache.get(geometry)
  if (cached) return cached
  const position = geometry?.attributes?.position
  if (!position) return null
  const stride = Math.max(1, Math.ceil(position.count / MAX_SAMPLES))
  const samples = new Float32Array(Math.ceil(position.count / stride) * 3)
  let n = 0
  for (let i = 0; i < position.count; i += stride) {
    samples[n++] = position.getX(i)
    samples[n++] = position.getY(i)
    samples[n++] = position.getZ(i)
  }
  sampleCache.set(geometry, samples)
  return samples
}

/**
 * The world point, at the centre's depth, that projects exactly as far up and
 * to the right of the centre as the object's outline reaches. Written into
 * `out`. It never reads the DOM, so the label projects in the same frame as the
 * object and follows it the way a point label follows its point. Returns null
 * when there is nothing to measure or the centre is behind the camera.
 */
function clearanceAnchor(object, centre, camera, out) {
  const samples = localSamples(object.geometry)
  if (!samples) return null
  // OrbitControls moves the camera ahead of the render that refreshes its
  // matrices; drei's <Html> refreshes them before projecting, and so must this.
  camera.updateMatrixWorld()
  object.updateWorldMatrix(true, false)

  viewCentre.set(centre[0], centre[1], centre[2]).applyMatrix4(camera.matrixWorldInverse)
  const perspective = !camera.isOrthographicCamera
  const centreDepth = -viewCentre.z
  if (perspective && centreDepth <= MIN_DEPTH) return null

  // Screen position up to a constant factor: view x and y over depth. The
  // factor cancels, since the anchor is placed back through the same division.
  const along = (x, y, depth) =>
    perspective ? (x * EDGE_X + y * EDGE_Y) / depth : x * EDGE_X + y * EDGE_Y
  const centreAlong = along(viewCentre.x, viewCentre.y, centreDepth)

  toView.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld)
  const m = toView.elements
  let reach = 0
  for (let i = 0; i < samples.length; i += 3) {
    const x = samples[i]
    const y = samples[i + 1]
    const z = samples[i + 2]
    const depth = -(m[2] * x + m[6] * y + m[10] * z + m[14])
    // Behind the camera, a vertex's projection flips through the view.
    if (perspective && depth <= MIN_DEPTH) continue
    const screen = along(
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      depth,
    )
    if (screen - centreAlong > reach) reach = screen - centreAlong
  }

  const lateral = perspective ? reach * centreDepth : reach
  out.set(viewCentre.x + EDGE_X * lateral, viewCentre.y + EDGE_Y * lateral, viewCentre.z)
  return out.applyMatrix4(camera.matrixWorld)
}

export { clearanceAnchor }
