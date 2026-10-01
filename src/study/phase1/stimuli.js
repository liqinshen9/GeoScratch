import THREE from '@/utils/three'
import { closestApproach } from '@/utils/lineIntersection'
import { createRng } from './prng'
import {
  CAMERA,
  VIEWPORT,
  STUDY_STIMULUS_SEED,
  DEPTH_SEPARATIONS,
  DISTANCE_RATIOS,
  DIFFICULTY_LEVELS,
  CLUTTER_DISTRACTORS,
  CLUTTER_LEVELS,
  MEASURED_DIFFICULTY_COUNTS,
  PRACTICE_TRIALS_PER_BLOCK,
  PAIR_KINDS,
  PAIR_TYPES,
  OCCLUSION_PAIR_TYPES,
  DISTANCE_PAIR_TYPES,
  PROBE_BANDS,
  QUESTION_TYPES,
  PLACEMENT,
} from './stimulusConfig'

// Procedural Phase 1 stimuli. Pure: a stimulus is plain data (targets,
// distractors, ground truth) that stimulusToXml turns into real blocks.
// See docs/architecture/study-phase1.md#stimuli.

const { Vector3 } = THREE
const DISTRACTOR_KINDS = ['line', 'point', 'cube', 'sphere']

const round = (value) => Math.round(value * 1000) / 1000
const roundVec = (v) => [round(v.x), round(v.y), round(v.z)]
const toVec = (arr) => new Vector3(arr[0], arr[1], arr[2])

export function makeStudyCamera(viewport = VIEWPORT) {
  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov,
    viewport.width / viewport.height,
    0.1,
    5000,
  )
  camera.position.set(...CAMERA.position)
  camera.lookAt(...CAMERA.target)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  return camera
}

/** Camera-space depth: distance in front of the camera along its view axis. */
export function viewDepth(camera, point) {
  return -point.clone().applyMatrix4(camera.matrixWorldInverse).z
}

export function toNdc(camera, point) {
  const p = point.clone().project(camera)
  return { x: p.x, y: p.y }
}

const ndcDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

function cameraBasis(camera) {
  const forward = new Vector3()
  camera.getWorldDirection(forward)
  return {
    forward,
    right: new Vector3().setFromMatrixColumn(camera.matrixWorld, 0),
    up: new Vector3().setFromMatrixColumn(camera.matrixWorld, 1),
  }
}

/** The world point on the ray through `ndc` whose camera-space depth is `depth`. */
function worldAtNdc(camera, ndc, depth) {
  const direction = new Vector3(ndc.x, ndc.y, 0.5)
    .unproject(camera)
    .sub(camera.position)
    .normalize()
  const { forward } = cameraBasis(camera)
  return camera.position.clone().addScaledVector(direction, depth / direction.dot(forward))
}

/** The point on a line closest to the view ray through `ndc`. */
function lineAtNdc(camera, ndc, origin, direction) {
  const rayDir = new Vector3(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position).normalize()
  const d = direction.clone().normalize()
  const w0 = camera.position.clone().sub(origin)
  const a = rayDir.dot(rayDir)
  const b = rayDir.dot(d)
  const c = d.dot(d)
  const dd = rayDir.dot(w0)
  const e = d.dot(w0)
  const denom = a * c - b * b
  if (Math.abs(denom) < 1e-12) return origin.clone()
  const t = (a * e - b * dd) / denom
  return origin.clone().addScaledVector(d, t)
}

/**
 * How far along `direction` from `origin` the line's image crosses the screen
 * column `ndcX`, or null if it runs parallel to it. Clip x and w are both
 * affine in t, so this is one linear solve rather than a search.
 */
export function lineParamAtNdcX(camera, ndcX, origin, direction) {
  const m = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  ).elements
  const rowX = [m[0], m[4], m[8], m[12]]
  const rowW = [m[3], m[7], m[11], m[15]]
  const dot = (row, v, w) => row[0] * v.x + row[1] * v.y + row[2] * v.z + row[3] * w
  const numerator = ndcX * dot(rowW, origin, 1) - dot(rowX, origin, 1)
  const denominator = dot(rowX, direction, 0) - ndcX * dot(rowW, direction, 0)
  if (Math.abs(denominator) < 1e-9) return null
  return numerator / denominator
}

// Mirrors geoVectorLineDefinition's line-vs-box clip. The builder anchors a
// line's label at the clipped midpoint (userData.segmentMid) and cannot import
// this; stimulusScene.test.js pins the two together.
const SCENE_BOX_HALF_EXTENT = 20

/** Where the line builder anchors this line's label: its box-clipped midpoint. */
export function lineLabelAnchor(origin, direction) {
  const d = direction.clone().normalize()
  let tEnter = -Infinity
  let tExit = Infinity
  for (const axis of ['x', 'y', 'z']) {
    const o = origin[axis]
    const component = d[axis]
    if (Math.abs(component) < 1e-9) {
      if (o < -SCENE_BOX_HALF_EXTENT || o > SCENE_BOX_HALF_EXTENT) return origin.clone()
      continue
    }
    let tNear = (-SCENE_BOX_HALF_EXTENT - o) / component
    let tFar = (SCENE_BOX_HALF_EXTENT - o) / component
    if (tNear > tFar) [tNear, tFar] = [tFar, tNear]
    tEnter = Math.max(tEnter, tNear)
    tExit = Math.min(tExit, tFar)
  }
  if (!Number.isFinite(tEnter) || !Number.isFinite(tExit) || tExit < tEnter) return origin.clone()
  return origin.clone().addScaledVector(d, (tEnter + tExit) / 2)
}

const isLinear = (object) => object.kind === 'line' || object.kind === 'vector'
const isSolid = (object) => object.kind === 'cube' || object.kind === 'sphere'

/** A line or vector as (origin, unit direction); a vector also carries its length. */
function rayOf(object) {
  const origin = toVec(object.origin)
  if (object.kind === 'vector') {
    const vector = toVec(object.vector)
    return { origin, direction: vector.clone().normalize(), length: vector.length() }
  }
  return { origin, direction: toVec(object.direction).normalize(), length: Infinity }
}

/** The point a stimulus object hangs from, for bounds and neighbourhood checks. */
export function anchorPoint(object) {
  return toVec(object.position ?? object.centre ?? object.origin)
}

/** Closest 3D distance between two stimulus objects, surface to surface for solids. */
export function separation3d(a, b) {
  if (isLinear(a) && isLinear(b)) {
    const ra = rayOf(a)
    const rb = rayOf(b)
    const approach = closestApproach(ra.origin, ra.direction, rb.origin, rb.direction)
    return approach ? approach.distance : Infinity
  }
  if (isLinear(b)) return separation3d(b, a)
  if (isLinear(a)) {
    const { origin, direction } = rayOf(a)
    const offset = anchorPoint(b).sub(origin)
    const distance = offset.sub(direction.clone().multiplyScalar(offset.dot(direction))).length()
    return b.kind === 'sphere' ? distance - b.radius : distance
  }
  const distance = anchorPoint(a).distanceTo(anchorPoint(b))
  const radii = (a.kind === 'sphere' ? a.radius : 0) + (b.kind === 'sphere' ? b.radius : 0)
  return distance - radii
}

/** Screen distance from `ndc` to the projected image of an infinite line. */
export function ndcDistanceToLine(camera, ndc, origin, direction) {
  const p0 = toNdc(camera, origin)
  const p1 = toNdc(camera, origin.clone().addScaledVector(direction.clone().normalize(), 2))
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const length = Math.hypot(dx, dy)
  if (length < 1e-9) return ndcDistance(ndc, p0)
  return Math.abs(dx * (p0.y - ndc.y) - dy * (p0.x - ndc.x)) / length
}

/** Approximate on-screen radius of a sphere of `radius` at `centre`, in NDC y units. */
function projectedRadius(camera, centre, radius) {
  const depth = viewDepth(camera, centre)
  return radius / (depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
}

function solidBoundingRadius(object) {
  return object.kind === 'cube' ? (object.size * Math.sqrt(3)) / 2 : object.radius
}

function ndcDistanceToSegment(camera, ndc, object) {
  const { origin, direction, length } = rayOf(object)
  const a = toNdc(camera, origin)
  const b = toNdc(camera, origin.clone().addScaledVector(direction, length))
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq < 1e-12) return ndcDistance(ndc, a)
  const t = Math.max(0, Math.min(1, ((ndc.x - a.x) * dx + (ndc.y - a.y) * dy) / lengthSq))
  return ndcDistance(ndc, { x: a.x + t * dx, y: a.y + t * dy })
}

/** Screen distance from `ndc` to an object's drawn image, 0 inside a solid. */
function ndcDistanceToObject(camera, ndc, object) {
  if (object.kind === 'point') return ndcDistance(ndc, toNdc(camera, toVec(object.position)))
  if (object.kind === 'vector') return ndcDistanceToSegment(camera, ndc, object)
  if (isSolid(object)) {
    const centre = toVec(object.centre)
    const gap =
      ndcDistance(ndc, toNdc(camera, centre)) -
      projectedRadius(camera, centre, solidBoundingRadius(object))
    return Math.max(0, gap)
  }
  return ndcDistanceToLine(camera, ndc, toVec(object.origin), toVec(object.direction))
}

/**
 * The judged point of a trial: a crossing, a screen column for a band, or the
 * reference point C for a distance question.
 */
export function probeOf(stimulus) {
  const ndc = { x: stimulus.probeNdc[0], y: stimulus.probeNdc[1] }
  if (stimulus.question.type === 'occlusion') return { type: 'occlusion', ndc }
  return { type: stimulus.question.type, ndc, x: ndc.x }
}

const bandX = (id) => PROBE_BANDS.find((band) => band.id === id)?.x ?? 0

/**
 * The point on a target the trial asks about: where the pair crosses for an
 * occlusion question, or where the target sits in the named screen column for a
 * proximity one. Null when the target does not reach that column at all.
 */
export function pointOfTargetAt(camera, object, probe) {
  if (object.kind === 'point') return toVec(object.position)
  if (isSolid(object)) return toVec(object.centre)
  const { origin, direction, length } = rayOf(object)
  // A distance question judges a vector by its tip.
  if (probe.type === 'distance' && object.kind === 'vector') {
    return origin.clone().addScaledVector(direction, length)
  }
  if (probe.type === 'occlusion') return lineAtNdc(camera, probe.ndc, origin, direction)
  const t = lineParamAtNdcX(camera, probe.x, origin, direction)
  // A line runs both ways from its origin; a vector stops at its tip.
  if (t == null || (object.kind === 'vector' && (t < 0 || t > length))) return null
  return origin.clone().addScaledVector(direction, t)
}

/**
 * Camera-space depth of a target at that point. A solid answers with its near
 * surface, which is the surface being judged.
 */
export function depthOfTargetAt(camera, object, probe) {
  const point = pointOfTargetAt(camera, object, probe)
  if (!point) return null
  const depth = viewDepth(camera, point)
  return object.kind === 'sphere' ? depth - object.radius : depth
}

/** An object's screen height in the column `ndcX`, with its own on-screen reach. */
function screenSpanAt(camera, object, ndcX) {
  if (object.kind === 'point') return { y: toNdc(camera, toVec(object.position)).y, reach: 0 }
  if (isSolid(object)) {
    const centre = toVec(object.centre)
    return {
      y: toNdc(camera, centre).y,
      reach: projectedRadius(camera, centre, solidBoundingRadius(object)),
    }
  }
  const point = pointOfTargetAt(camera, object, { type: 'proximity', x: ndcX })
  return point ? { y: toNdc(camera, point).y, reach: 0 } : null
}

/**
 * A proximity trial is only answerable if the same target stays nearer, and the
 * two stay visibly apart, right across the band -- not only at its centre.
 */
function bandIsUnambiguous(camera, targets, probe) {
  const half = PLACEMENT.probeBandHalfWidthNdc
  let order = 0
  for (const x of [probe.x - half, probe.x, probe.x + half]) {
    const depths = targets.map((t) => depthOfTargetAt(camera, t, { type: 'proximity', x }))
    if (depths.some((d) => d == null)) return false
    const sign = Math.sign(depths[1] - depths[0])
    if (sign === 0 || (order !== 0 && sign !== order)) return false
    order = sign

    const spans = targets.map((t) => screenSpanAt(camera, t, x))
    if (spans.some((s) => s == null)) return false
    const gap = Math.abs(spans[0].y - spans[1].y) - spans[0].reach - spans[1].reach
    if (gap < PLACEMENT.minProximityGapNdc) return false
  }
  return true
}

const withinBounds = (v) =>
  Math.abs(v.x) <= PLACEMENT.maxCoordinate &&
  Math.abs(v.y) <= PLACEMENT.maxCoordinate &&
  Math.abs(v.z) <= PLACEMENT.maxCoordinate

function lineDirection(camera, rng, screenAngle) {
  const { right, up, forward } = cameraBasis(camera)
  return right
    .clone()
    .multiplyScalar(Math.cos(screenAngle))
    .addScaledVector(up, Math.sin(screenAngle))
    .addScaledVector(forward, rng.range(-PLACEMENT.lineDepthTilt, PLACEMENT.lineDepthTilt))
    .normalize()
}

function makeSolid(rng, kind, centre) {
  if (kind === 'cube') {
    const { min, max } = PLACEMENT.cubeSize
    return { kind, centre: roundVec(centre), size: round(rng.range(min, max)) }
  }
  const { min, max } = PLACEMENT.sphereRadius
  return { kind, centre: roundVec(centre), radius: round(rng.range(min, max)) }
}

function solidClearOfProbe(camera, solid, keepClearOf) {
  const centre = toVec(solid.centre)
  const radius = projectedRadius(camera, centre, solidBoundingRadius(solid))
  return (
    withinBounds(centre) &&
    keepClearOf.every(
      (ndc) => ndcDistance(toNdc(camera, centre), ndc) - radius >= PLACEMENT.clearOfCrossingNdc,
    )
  )
}

/**
 * Whether a solid's drawn disc clears every solid already placed. Two
 * see-through solids that overlap on screen composite by draw order rather than
 * by depth, which looks wrong from some angles and is a depth cue nobody chose.
 * See docs/architecture/render-order.md#solid-depthwrite.
 */
function solidClearOfSolids(camera, solid, solids) {
  const centre = toVec(solid.centre)
  const ndc = toNdc(camera, centre)
  const radius = projectedRadius(camera, centre, solidBoundingRadius(solid))
  return solids.every((other) => {
    const otherCentre = toVec(other.centre)
    const gap =
      ndcDistance(ndc, toNdc(camera, otherCentre)) -
      radius -
      projectedRadius(camera, otherCentre, solidBoundingRadius(other))
    return gap >= PLACEMENT.solidClearOfSolidNdc
  })
}

function clearOfTargetLabels(camera, object, labelAnchors) {
  const min = PLACEMENT.clearOfTargetLabelNdc
  return labelAnchors.every((ndc) => ndcDistanceToObject(camera, ndc, object) >= min)
}

/** Where the scene's label layer will anchor this target's label. */
export function targetLabelAnchor(object) {
  switch (object.kind) {
    case 'line':
      return lineLabelAnchor(toVec(object.origin), toVec(object.direction))
    case 'vector':
      return toVec(object.origin).add(toVec(object.vector))
    case 'point':
      return toVec(object.position)
    default:
      return toVec(object.centre)
  }
}

/**
 * Screen positions of the target labels. A line's or a vector's label hangs
 * away from the object, so it is rejected if it would sit off screen, on the
 * judged point, or on the other target, where it could be read as belonging to
 * the wrong one. A point's or a solid's label sits on the object itself.
 */
function targetLabelAnchors(camera, probeNdc, targets) {
  const anchors = []
  for (const target of targets) {
    const ndc = toNdc(camera, targetLabelAnchor(target))
    anchors.push(ndc)
    if (!isLinear(target)) continue
    const other = targets.find((t) => t !== target)
    if (
      Math.abs(ndc.x) > PLACEMENT.labelOnScreenNdc.x ||
      Math.abs(ndc.y) > PLACEMENT.labelOnScreenNdc.y ||
      ndcDistance(ndc, probeNdc) < PLACEMENT.labelClearOfCrossingNdc ||
      ndcDistanceToObject(camera, ndc, other) < PLACEMENT.labelClearOfOtherTargetNdc
    ) {
      return null
    }
  }
  return anchors
}

/** Camera-space depth of each target at the judged point, from the rounded geometry. */
export function targetDepths(camera, stimulus) {
  const probe = probeOf(stimulus)
  const depths = {}
  for (const object of stimulus.objects) {
    if (object.role !== 'target') continue
    depths[object.key] = depthOfTargetAt(camera, object, probe)
  }
  return depths
}

/** Where on screen each target meets the judged point, and the probe itself. */
function probeAnchors(params, rng) {
  const bounds = PLACEMENT.crossingNdc
  if (params.question.type === 'occlusion') {
    const shared = { x: rng.range(-bounds.x, bounds.x), y: rng.range(-bounds.y, bounds.y) }
    return { probe: shared, A: shared, B: shared }
  }
  const jitter = PLACEMENT.probeBandXJitterNdc
  const x = bandX(params.question.band) + rng.range(-jitter, jitter)
  const limit = PLACEMENT.proximityYLimitNdc
  const gap = rng.range(PLACEMENT.proximityGapNdc.min, PLACEMENT.proximityGapNdc.max)
  const lower = rng.range(-limit, limit - gap)
  // The nearer target sits higher on screen exactly when the plan says so.
  const upper = params.nearerHigher === (params.nearer === 'A') ? 'A' : 'B'
  const [yA, yB] = upper === 'A' ? [lower + gap, lower] : [lower, lower + gap]
  return { probe: { x, y: (yA + yB) / 2 }, A: { x, y: yA }, B: { x, y: yB } }
}

/** Screen angles for the two targets: crossing for occlusion, flat for a band. */
function targetAngles(params, rng) {
  if (params.question.type === 'occlusion') {
    const first = rng.range(0, Math.PI)
    const minAngle = THREE.MathUtils.degToRad(PLACEMENT.minCrossingAngleDeg)
    return { A: first, B: first + rng.sign() * rng.range(minAngle, Math.PI - minAngle) }
  }
  // Near-parallel on screen: two lines that converge inside the band would
  // cross there, and "which is closer in the band" would stop having an answer.
  const tilt = THREE.MathUtils.degToRad(PLACEMENT.maxProximityScreenTiltDeg)
  const jitter = THREE.MathUtils.degToRad(PLACEMENT.proximityAngleJitterDeg)
  const base = rng.range(-tilt, tilt)
  return { A: base + rng.range(-jitter, jitter), B: base + rng.range(-jitter, jitter) }
}

function makeTarget(key, kind, anchorNdc, depth, angle, rng, camera) {
  if (kind === 'sphere') {
    const radius = PLACEMENT.targetSphereRadius
    // The judgement is about the surface you can see, so that is what sits at
    // `depth`; the centre goes one radius further back.
    const centre = worldAtNdc(camera, anchorNdc, depth + radius)
    return withinBounds(centre)
      ? { key, role: 'target', kind, centre: roundVec(centre), radius }
      : null
  }

  const anchor = worldAtNdc(camera, anchorNdc, depth)
  if (!withinBounds(anchor)) return null
  if (kind === 'point') return { key, role: 'target', kind, position: roundVec(anchor) }

  const direction = lineDirection(camera, rng, angle)
  if (kind === 'line') {
    return { key, role: 'target', kind, origin: roundVec(anchor), direction: roundVec(direction) }
  }

  const { min, max } = PLACEMENT.vectorLength
  const length = rng.range(min, max)
  const fraction = rng.range(PLACEMENT.vectorAnchorFraction.min, PLACEMENT.vectorAnchorFraction.max)
  const tail = anchor.clone().addScaledVector(direction, -length * fraction)
  const tip = tail.clone().addScaledVector(direction, length)
  if (!withinBounds(tail) || !withinBounds(tip)) return null
  return {
    key,
    role: 'target',
    kind,
    origin: roundVec(tail),
    vector: roundVec(direction.clone().multiplyScalar(length)),
  }
}

/** Where a distance target's label hangs, and the point a vector is judged by. */
function judgedPoint(object) {
  if (object.kind === 'vector') return toVec(object.origin).add(toVec(object.vector))
  if (object.kind === 'line') return lineLabelAnchor(toVec(object.origin), toVec(object.direction))
  return toVec(object.position ?? object.centre)
}

/**
 * Shortest 3D distance from `c` to what a distance question judges: a point, a
 * vector's tip, a line's nearest point, or a sphere's surface.
 */
export function distanceToTarget(c, object) {
  if (object.kind === 'line') {
    const { origin, direction } = rayOf(object)
    const offset = c.clone().sub(origin)
    return offset.addScaledVector(direction, -offset.dot(direction)).length()
  }
  if (object.kind === 'sphere') return toVec(object.centre).distanceTo(c) - object.radius
  return judgedPoint(object).distanceTo(c)
}

/** Each target's 3D distance to the reference point C, from the rounded geometry. */
export function targetDistances(stimulus) {
  const reference = stimulus.objects.find((o) => o.role === 'reference')
  if (!reference) return null
  const c = toVec(reference.position)
  const distances = {}
  for (const object of stimulus.objects) {
    if (object.role === 'target') distances[object.key] = distanceToTarget(c, object)
  }
  return distances
}

/** The point of a distance target nearest C: its tip, its foot on C, or its surface. */
function closestPointTo(c, object) {
  if (object.kind === 'line') {
    const { origin, direction } = rayOf(object)
    return origin.clone().addScaledVector(direction, c.clone().sub(origin).dot(direction))
  }
  if (object.kind === 'sphere') {
    const centre = toVec(object.centre)
    return centre.clone().addScaledVector(c.clone().sub(centre).normalize(), object.radius)
  }
  return judgedPoint(object)
}

/**
 * Whether the nearer target's judged point sits higher on screen than the
 * other's. Height in the visual field reads as distance (higher looks
 * farther), while from this raised camera higher objects are often nearer, so
 * this is balanced and logged. Null for occlusion: both meet at the crossing.
 */
export function nearerIsHigher(camera, stimulus) {
  const other = stimulus.nearer === 'A' ? 'B' : 'A'
  if (stimulus.question.type === 'occlusion') return null
  if (stimulus.question.type === 'proximity') {
    return stimulus.anchorsNdc[stimulus.nearer][1] > stimulus.anchorsNdc[other][1]
  }
  const reference = stimulus.objects.find((o) => o.role === 'reference')
  const c = toVec(reference.position)
  const y = (key) =>
    toNdc(
      camera,
      closestPointTo(
        c,
        stimulus.objects.find((o) => o.key === key),
      ),
    ).y
  return y(stimulus.nearer) > y(other)
}

const toPixels = (ndc) => ({ x: (ndc.x * VIEWPORT.width) / 2, y: (ndc.y * VIEWPORT.height) / 2 })

/**
 * On-screen distance in CSS pixels from `ndc` to what a distance target draws
 * there: its point or tip, its line, or its sphere's outline.
 */
export function imagePixelDistance(camera, ndc, object) {
  const p = toPixels(ndc)
  if (object.kind === 'line') {
    const { origin, direction } = rayOf(object)
    const a = toPixels(toNdc(camera, origin))
    const b = toPixels(toNdc(camera, origin.clone().addScaledVector(direction, 2)))
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    return Math.abs((b.x - a.x) * (a.y - p.y) - (b.y - a.y) * (a.x - p.x)) / length
  }
  const centre = toPixels(toNdc(camera, judgedPoint(object)))
  const gap = Math.hypot(centre.x - p.x, centre.y - p.y)
  if (object.kind !== 'sphere') return gap
  const radiusPx =
    (projectedRadius(camera, toVec(object.centre), object.radius) * VIEWPORT.height) / 2
  return gap - radiusPx
}

/** Where on the view ray through `ndc` a point sits `distance` from `centre`, or null. */
function pointOnRayAtDistance(camera, ndc, centre, distance, side) {
  const u = new Vector3(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position).normalize()
  const w = centre.clone().sub(camera.position)
  const along = w.dot(u)
  const across = w.clone().addScaledVector(u, -along).length()
  if (distance < across) return null
  const s = along + side * Math.sqrt(distance * distance - across * across)
  return s > 1 ? camera.position.clone().addScaledVector(u, s) : null
}

const withinScreen = (ndc, bounds) => Math.abs(ndc.x) <= bounds.x && Math.abs(ndc.y) <= bounds.y
const roundedVec = (v) => toVec(roundVec(v))

/**
 * A vector whose tip sits at `tip`, with its arrow aimed roughly at `towardNdc`
 * so the shaft trails away from it. Null if the tail leaves the scene box.
 */
function vectorWithTip(key, tip, towardNdc, rng, camera) {
  const cfg = PLACEMENT.distance
  const tipNdc = toNdc(camera, tip)
  const aim = Math.atan2(
    ((towardNdc.y - tipNdc.y) * VIEWPORT.height) / 2,
    ((towardNdc.x - tipNdc.x) * VIEWPORT.width) / 2,
  )
  const jitter = THREE.MathUtils.degToRad(cfg.vectorAimJitterDeg)
  const direction = lineDirection(camera, rng, aim + rng.range(-jitter, jitter))
  const length = rng.range(PLACEMENT.vectorLength.min, PLACEMENT.vectorLength.max)
  const tail = tip.clone().addScaledVector(direction, -length)
  if (!withinBounds(tail)) return null
  return {
    key,
    role: 'target',
    kind: 'vector',
    origin: roundVec(tail),
    vector: roundVec(tip.clone().sub(roundedVec(tail))),
  }
}

/**
 * A line whose nearest point to `c` is `nearest`: it runs perpendicular to
 * `nearest - c`, and not so end-on to the camera that it reads as a dot.
 */
function lineWithNearestPoint(key, nearest, c, rng, camera) {
  const normal = nearest.clone().sub(c).normalize()
  const { forward } = cameraBasis(camera)
  for (let attempt = 0; attempt < 20; attempt++) {
    const direction = new Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1))
    direction.addScaledVector(normal, -direction.dot(normal))
    if (direction.length() < 0.2) continue
    direction.normalize()
    if (Math.abs(direction.dot(forward)) > PLACEMENT.distance.maxLineViewAlignment) continue
    return {
      key,
      role: 'target',
      kind: 'line',
      origin: roundVec(nearest),
      direction: roundVec(direction),
    }
  }
  return null
}

/**
 * Distance question: C near the middle on an unlabelled line, A and B around it
 * on screen so the one nearer C in 3D is never clearly nearer on screen, their
 * 3D distances to C in the difficulty's ratio. A line is judged by its nearest
 * point and a sphere by its surface, so both are built from the distance they
 * must have. See docs/architecture/study-phase1.md#distance-questions.
 */
function placeDistanceTargets(params, rng, camera) {
  const cfg = PLACEMENT.distance
  const cameraDistance = camera.position.distanceTo(toVec(CAMERA.target))
  const base = cameraDistance + rng.range(-PLACEMENT.depthJitter, PLACEMENT.depthJitter)
  const cNdc = {
    x: rng.range(-cfg.referenceNdc.x, cfg.referenceNdc.x),
    y: rng.range(-cfg.referenceNdc.y, cfg.referenceNdc.y),
  }
  const cPoint = roundedVec(worldAtNdc(camera, cNdc, base))
  if (!withinBounds(cPoint)) return null

  const near = params.nearer
  const far = near === 'A' ? 'B' : 'A'
  const farPx = rng.range(cfg.targetScreenPx.min, cfg.targetScreenPx.max)
  const px = { [far]: farPx, [near]: farPx * rng.range(cfg.screenRatio.min, cfg.screenRatio.max) }
  const firstAngle = rng.range(0, Math.PI * 2)
  const minAngle = THREE.MathUtils.degToRad(cfg.minScreenAngleDeg)
  const angle = { A: firstAngle, B: firstAngle + rng.sign() * rng.range(minAngle, Math.PI) }
  const ndc = {}
  for (const key of ['A', 'B']) {
    ndc[key] = {
      x: cNdc.x + (Math.cos(angle[key]) * px[key]) / (VIEWPORT.width / 2),
      y: cNdc.y + (Math.sin(angle[key]) * px[key]) / (VIEWPORT.height / 2),
    }
    if (!withinScreen(ndc[key], cfg.onScreenNdc)) return null
  }

  const [firstKind, secondKind] = PAIR_KINDS[params.pairType]
  const kinds =
    firstKind === secondKind || rng.next() < 0.5
      ? { A: firstKind, B: secondKind }
      : { A: secondKind, B: firstKind }
  const radius = {}
  for (const key of ['A', 'B']) {
    if (kinds[key] === 'sphere') {
      radius[key] = PLACEMENT.targetSphereRadius
    }
  }

  // The shortest distance each target could have along its ray; the nearer one
  // is stretched past it so it has to leave C's depth, and the farther one is
  // then the ratio further.
  const shortest = (key) =>
    worldAtNdc(camera, ndc[key], base).distanceTo(cPoint) - (radius[key] ?? 0)
  const nearDistance = shortest(near) * rng.range(cfg.depthStretch.min, cfg.depthStretch.max)
  const distance = {
    [near]: nearDistance,
    [far]: nearDistance * DISTANCE_RATIOS[params.difficulty],
  }

  const targets = []
  for (const key of ['A', 'B']) {
    const alongRay = distance[key] + (radius[key] ?? 0)
    const point = pointOnRayAtDistance(camera, ndc[key], cPoint, alongRay, rng.sign())
    if (!point || !withinBounds(point)) return null
    let target
    if (kinds[key] === 'point') {
      target = { key, role: 'target', kind: 'point', position: roundVec(point) }
    } else if (kinds[key] === 'sphere') {
      target = { key, role: 'target', kind: 'sphere', centre: roundVec(point), radius: radius[key] }
    } else if (kinds[key] === 'line') {
      target = lineWithNearestPoint(key, point, cPoint, rng, camera)
    } else {
      target = vectorWithTip(key, point, cNdc, rng, camera)
    }
    if (!target) return null
    targets.push(target)
  }
  const reference = { key: 'C', role: 'reference', kind: 'point', position: roundVec(cPoint) }

  for (const [a, b] of [
    [targets[0], targets[1]],
    [targets[0], reference],
    [targets[1], reference],
  ]) {
    if (separation3d(a, b) < PLACEMENT.minSeparation3d) return null
  }

  // The screen must not give it away, measured to what each target draws.
  const referenceNdc = toNdc(camera, cPoint)
  const imagePx = Object.fromEntries(
    targets.map((t) => [t.key, imagePixelDistance(camera, referenceNdc, t)]),
  )
  if (Math.min(imagePx.A, imagePx.B) < cfg.minImagePx) return null
  if (imagePx[near] < imagePx[far] * cfg.screenRatio.min) return null

  // Labels on screen and apart from each other.
  const labelNdc = Object.fromEntries(targets.map((t) => [t.key, toNdc(camera, judgedPoint(t))]))
  const labels = [labelNdc.A, labelNdc.B, referenceNdc]
  if (labels.some((l) => !withinScreen(l, PLACEMENT.labelOnScreenNdc))) return null
  for (let i = 0; i < labels.length; i++) {
    for (let k = i + 1; k < labels.length; k++) {
      if (ndcDistance(labels[i], labels[k]) < PLACEMENT.labelClearOfOtherTargetNdc) return null
    }
  }
  // A drawn target must not run over another label.
  for (const target of targets) {
    const others = [referenceNdc, labelNdc[target.key === 'A' ? 'B' : 'A']]
    for (const other of others) {
      if (ndcDistanceToObject(camera, other, target) < cfg.shaftClearNdc) return null
    }
  }

  // C sits on an unlabelled line, which gives it a place in depth for the cues
  // to act on: a lone point marker is drawn the same size at any depth. The
  // line runs clear of the other labels on screen and never touches a target.
  const referenceLine = {
    key: 'Cline',
    role: 'context',
    kind: 'line',
    origin: roundVec(cPoint),
    direction: roundVec(lineDirection(camera, rng, rng.range(0, Math.PI))),
  }
  for (const target of targets) {
    if (ndcDistanceToObject(camera, labelNdc[target.key], referenceLine) < cfg.shaftClearNdc) {
      return null
    }
    if (separation3d(referenceLine, target) < PLACEMENT.minSeparation3d) return null
  }

  return {
    anchors: { probe: referenceNdc, A: labelNdc.A, B: labelNdc.B },
    probe: { type: 'distance', ndc: referenceNdc, x: referenceNdc.x },
    base,
    targets,
    reference,
    referenceLine,
    labelAnchors: labels,
    keepClearOf: labels,
  }
}

function placeTargets(params, rng, camera) {
  if (params.question.type === 'distance') return placeDistanceTargets(params, rng, camera)
  const anchors = probeAnchors(params, rng)
  if (!anchors) return null

  const cameraDistance = camera.position.distanceTo(toVec(CAMERA.target))
  const base = cameraDistance + rng.range(-PLACEMENT.depthJitter, PLACEMENT.depthJitter)
  const gap = DEPTH_SEPARATIONS[params.difficulty]
  const depth = {
    A: params.nearer === 'A' ? base - gap / 2 : base + gap / 2,
    B: params.nearer === 'A' ? base + gap / 2 : base - gap / 2,
  }

  const [firstKind, secondKind] = PAIR_KINDS[params.pairType]
  const kinds =
    firstKind === secondKind || rng.next() < 0.5
      ? { A: firstKind, B: secondKind }
      : { A: secondKind, B: firstKind }
  const angles = targetAngles(params, rng)

  const targets = []
  for (const key of ['A', 'B']) {
    const target = makeTarget(key, kinds[key], anchors[key], depth[key], angles[key], rng, camera)
    if (!target) return null
    targets.push(target)
  }
  if (separation3d(targets[0], targets[1]) < PLACEMENT.minSeparation3d) return null

  const probe =
    params.question.type === 'occlusion'
      ? { type: 'occlusion', ndc: anchors.probe }
      : { type: 'proximity', ndc: anchors.probe, x: anchors.probe.x }
  if (probe.type === 'proximity' && !bandIsUnambiguous(camera, targets, probe)) return null

  const labelAnchors = targetLabelAnchors(camera, anchors.probe, targets)
  if (!labelAnchors) return null

  const keepClearOf = [anchors.probe, anchors.A, anchors.B]
  return { anchors, probe, base, targets, labelAnchors, keepClearOf }
}

/** A solid threaded on one of `carriers`, away from the judged point, so T4/T7 have something to show. */
function placeSolidOnTarget(rng, camera, placed, carriers, key, solids) {
  const { probe, keepClearOf, labelAnchors } = placed
  if (!carriers.length) return null
  const carrier = rng.pick(carriers)
  const { origin, direction, length } = rayOf(carrier)
  const judged = pointOfTargetAt(camera, carrier, probe)
  if (!judged) return null
  // Screen size of a world unit where the solid is going, not at the line's
  // origin: under perspective those differ, and the offset is in screen units.
  const perUnit = ndcDistance(toNdc(camera, judged.clone().add(direction)), toNdc(camera, judged))
  if (perUnit < 1e-6) return null
  const wanted = rng.range(PLACEMENT.solidOnTargetMinNdc, PLACEMENT.solidOnTargetMaxNdc) / perUnit
  // Offset from the judged point, along the carrier. A vector is a drawn
  // segment, so the solid has to land on the shaft rather than past its tip.
  const at = judged.clone().sub(origin).dot(direction)
  const room = [at + rng.sign() * wanted, at - rng.sign() * wanted].find(
    (t) => carrier.kind !== 'vector' || (t >= 0.08 * length && t <= 0.92 * length),
  )
  if (room == null) return null
  const centre = origin.clone().addScaledVector(direction, room)
  const solid = {
    key,
    role: 'distractor',
    ...makeSolid(rng, rng.pick(['cube', 'sphere']), centre),
  }
  // Perspective makes the offset along the line only approximate, and a carrier
  // that is itself a distractor starts off the probe, so check where the solid
  // actually landed rather than trusting the step.
  const centreNdc = toNdc(camera, centre)
  const reach = Math.min(...keepClearOf.map((ndc) => ndcDistance(centreNdc, ndc)))
  if (reach > PLACEMENT.solidOnTargetMaxNdc) return null

  return solidClearOfProbe(camera, solid, keepClearOf) &&
    solidClearOfSolids(camera, solid, solids) &&
    clearOfTargetLabels(camera, solid, labelAnchors)
    ? solid
    : null
}

function placeDistractor(rng, camera, placed, key, solids, forcedKind = null, points = []) {
  const { probe, base, targets, labelAnchors, keepClearOf } = placed
  const kind = forcedKind ?? rng.pick(DISTRACTOR_KINDS)
  const angle = rng.range(0, Math.PI * 2)
  const radius = PLACEMENT.distractorRadiusNdc * Math.sqrt(rng.next())
  const ndc = {
    x: probe.ndc.x + Math.cos(angle) * radius,
    y: probe.ndc.y + Math.sin(angle) * radius,
  }
  const depth = base + rng.range(-PLACEMENT.distractorDepthJitter, PLACEMENT.distractorDepthJitter)
  const anchor = worldAtNdc(camera, ndc, depth)
  if (!withinBounds(anchor)) return null

  let object
  if (kind === 'point') {
    if (keepClearOf.some((p) => ndcDistance(ndc, p) < PLACEMENT.clearOfCrossingNdc)) return null
    // Seen through a see-through solid, a point reads as a mark on its surface.
    const insideSolid = solids.some((solid) => {
      const centre = toVec(solid.centre)
      const reach = projectedRadius(camera, centre, solidBoundingRadius(solid))
      return ndcDistance(ndc, toNdc(camera, centre)) < reach + PLACEMENT.clearOfCrossingNdc
    })
    if (insideSolid) return null
    object = { key, role: 'distractor', kind, position: roundVec(anchor) }
  } else if (kind === 'line') {
    const direction = lineDirection(camera, rng, rng.range(0, Math.PI))
    const clearsProbe = keepClearOf.every(
      (p) => ndcDistanceToLine(camera, p, anchor, direction) >= PLACEMENT.clearOfCrossingNdc,
    )
    if (!clearsProbe) return null
    object = {
      key,
      role: 'distractor',
      kind,
      origin: roundVec(anchor),
      direction: roundVec(direction),
    }
    const touchesTarget = targets.some(
      (t) => isLinear(t) && separation3d(t, object) < PLACEMENT.minSeparation3d,
    )
    if (touchesTarget) return null
  } else {
    object = { key, role: 'distractor', ...makeSolid(rng, kind, anchor) }
    if (!solidClearOfProbe(camera, object, keepClearOf)) return null
    if (!solidClearOfSolids(camera, object, solids)) return null
    const reach = projectedRadius(camera, anchor, solidBoundingRadius(object))
    const coversPoint = points.some(
      (p) =>
        ndcDistance(toNdc(camera, toVec(p.position)), ndc) < reach + PLACEMENT.clearOfCrossingNdc,
    )
    if (coversPoint) return null
  }
  return clearOfTargetLabels(camera, object, labelAnchors) ? object : null
}

function tryGenerate(params, rng, camera) {
  const placed = placeTargets(params, rng, camera)
  if (!placed) return null
  const { anchors, probe, targets, reference, referenceLine } = placed

  const count = CLUTTER_DISTRACTORS[params.clutter]
  const distractors = []
  // Sphere targets count: nothing may overlap them on screen either.
  const solids = targets.filter(isSolid)
  const nextKey = () => `d${distractors.length + 1}`
  const retry = (place) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const object = place()
      if (object) return object
    }
    return null
  }

  // Only a line takes a collision accent (applyTubeCollisions looks for
  // geo_vector_line), so a pair with no line target needs a distractor line to
  // carry the solid, or T4 would render exactly like T1.
  // See docs/architecture/study-phase1.md#stimuli.
  // C's line can carry the solid too.
  let carriers = [...targets, ...(referenceLine ? [referenceLine] : [])].filter(
    (t) => t.kind === 'line',
  )
  if (!carriers.length) {
    const carrierLine = retry(() => placeDistractor(rng, camera, placed, nextKey(), solids, 'line'))
    if (!carrierLine) return null
    distractors.push(carrierLine)
    carriers = [carrierLine]
  }

  const anchored = placeSolidOnTarget(rng, camera, placed, carriers, nextKey(), solids)
  if (!anchored) return null
  distractors.push(anchored)
  solids.push(anchored)

  while (distractors.length < count) {
    const key = nextKey()
    const points = distractors.filter((d) => d.kind === 'point')
    const distractor = retry(() => placeDistractor(rng, camera, placed, key, solids, null, points))
    if (!distractor) return null
    distractors.push(distractor)
    if (isSolid(distractor)) solids.push(distractor)
  }

  const stimulus = {
    id: params.id,
    seed: params.seed,
    practice: Boolean(params.practice),
    clutter: params.clutter,
    difficulty: params.difficulty,
    pairType: params.pairType,
    question: params.question,
    probeNdc: [round(probe.ndc.x), round(probe.ndc.y)],
    anchorsNdc: {
      A: [round(anchors.A.x), round(anchors.A.y)],
      B: [round(anchors.B.x), round(anchors.B.y)],
    },
    colourSalt: rng.token(6),
    objects: [...targets, ...(reference ? [reference, referenceLine] : []), ...distractors],
  }

  if (params.question.type === 'distance') {
    const distances = targetDistances(stimulus)
    const nearer = distances.A < distances.B ? 'A' : 'B'
    if (nearer !== params.nearer) return null
    const judged = targetDepths(camera, stimulus)
    const nearerHigher = nearerIsHigher(camera, { ...stimulus, nearer })
    if (params.nearerHigher != null && nearerHigher !== params.nearerHigher) return null
    return {
      ...stimulus,
      nearer,
      nearerHigher,
      depths: { A: round(judged.A), B: round(judged.B) },
      distances: { A: round(distances.A), B: round(distances.B) },
      distanceRatio: round(Math.max(distances.A, distances.B) / Math.min(distances.A, distances.B)),
    }
  }

  const depths = targetDepths(camera, stimulus)
  if (depths.A == null || depths.B == null) return null
  const nearer = depths.A < depths.B ? 'A' : 'B'
  if (nearer !== params.nearer) return null
  const nearerHigher = nearerIsHigher(camera, { ...stimulus, nearer })
  if (params.nearerHigher != null && nearerHigher !== params.nearerHigher) return null
  return {
    ...stimulus,
    nearer,
    nearerHigher,
    depths: { A: round(depths.A), B: round(depths.B) },
    depthGap: round(Math.abs(depths.A - depths.B)),
  }
}

/**
 * One stimulus from explicit parameters. Deterministic in `params.seed`.
 *
 * @param {{ id: string, seed: string, clutter: 'low'|'high', difficulty: 'easy'|'medium'|'hard',
 *           pairType: string, nearer: 'A'|'B', nearerHigher?: boolean|null, question: object,
 *           practice?: boolean }} params
 */
export function generateStimulus(params, camera = makeStudyCamera()) {
  const rng = createRng(params.seed)
  for (let attempt = 0; attempt < 800; attempt++) {
    const stimulus = tryGenerate(params, rng, camera)
    if (stimulus) return stimulus
  }
  throw new Error(
    `[GeoScratch] Could not place Phase 1 stimulus ${params.id}: ` +
      `${params.pairType}, ${params.question.type}${params.question.band ? `/${params.question.band}` : ''}, ` +
      `${params.difficulty}, ${params.clutter} clutter, nearer ${params.nearer}`,
  )
}

/** `n` values dealt round-robin from a shuffled pool, so counts differ by at most one. */
function dealt(rng, values, n) {
  const pool = []
  while (pool.length < n) pool.push(...rng.shuffle([...values]))
  return rng.shuffle(pool.slice(0, n))
}

/** Questions for a list of types, with bands dealt evenly over the proximity ones. */
function questionsForTypes(rng, types) {
  const bands = dealt(
    rng,
    PROBE_BANDS.map((band) => band.id),
    types.filter((type) => type === 'proximity').length,
  )
  return types.map((type) => (type === 'proximity' ? { type, band: bands.pop() } : { type }))
}

/** Which target is nearer, dealt evenly within each question type. */
function nearersForTypes(rng, types) {
  const pools = Object.fromEntries(
    QUESTION_TYPES.map((type) => [
      type,
      dealt(rng, ['A', 'B'], types.filter((t) => t === type).length),
    ]),
  )
  return types.map((type) => pools[type].pop())
}

/**
 * Whether the nearer target is the higher one on screen, dealt evenly within
 * each question type that has a height difference (not occlusion).
 */
function highersForTypes(rng, types) {
  const pools = Object.fromEntries(
    QUESTION_TYPES.map((type) => [
      type,
      dealt(rng, [true, false], types.filter((t) => t === type).length),
    ]),
  )
  return types.map((type) => (type === 'occlusion' ? null : pools[type].pop()))
}

const PAIR_TYPES_BY_QUESTION = {
  occlusion: OCCLUSION_PAIR_TYPES,
  proximity: PAIR_TYPES,
  distance: DISTANCE_PAIR_TYPES,
}

/**
 * Pair types for a list of questions, dealt from pools shared by every clutter
 * level so each pairing appears equally often within its question type. Spheres
 * only ever appear in proximity questions.
 */
function pairTypePools(rng, questions) {
  const pools = Object.fromEntries(
    Object.entries(PAIR_TYPES_BY_QUESTION).map(([type, pairTypes]) => [
      type,
      dealt(rng, pairTypes, questions.filter((q) => q.type === type).length),
    ]),
  )
  return (question) => pools[question.type].pop()
}

/**
 * The fixed stimulus set every participant sees: measured stimuli (per clutter
 * level, by MEASURED_DIFFICULTY_COUNTS) and a separate practice set. Question
 * type is crossed with difficulty within each clutter level; which target is
 * nearer, the band and the pair type are dealt evenly within each question type.
 */
export function generateStimulusSet(setSeed = STUDY_STIMULUS_SEED) {
  const camera = makeStudyCamera()
  const rng = createRng(`${setSeed}:layout`)

  const plan = CLUTTER_LEVELS.flatMap((clutter) =>
    DIFFICULTY_LEVELS.flatMap((difficulty) =>
      dealt(rng, QUESTION_TYPES, MEASURED_DIFFICULTY_COUNTS[clutter][difficulty]).map((type) => ({
        clutter,
        difficulty,
        type,
      })),
    ),
  )
  const types = plan.map((entry) => entry.type)
  const questions = questionsForTypes(rng, types)
  const nearers = nearersForTypes(rng, types)
  const highers = highersForTypes(rng, types)
  const nextPairType = pairTypePools(rng, questions)
  const indexInClutter = {}

  const measured = plan.map(({ clutter, difficulty }, i) => {
    indexInClutter[clutter] = (indexInClutter[clutter] ?? 0) + 1
    const id = `m-${clutter}-${String(indexInClutter[clutter]).padStart(2, '0')}`
    return generateStimulus(
      {
        id,
        seed: `${setSeed}:${id}`,
        clutter,
        difficulty,
        pairType: nextPairType(questions[i]),
        question: questions[i],
        nearer: nearers[i],
        nearerHigher: highers[i],
      },
      camera,
    )
  })

  const practiceTypes = dealt(rng, QUESTION_TYPES, PRACTICE_TRIALS_PER_BLOCK)
  const practiceQuestions = questionsForTypes(rng, practiceTypes)
  const practiceNearers = nearersForTypes(rng, practiceTypes)
  const practiceHighers = highersForTypes(rng, practiceTypes)
  const nextPracticePairType = pairTypePools(rng, practiceQuestions)
  const practice = Array.from({ length: PRACTICE_TRIALS_PER_BLOCK }, (_, i) => {
    const id = `p-${String(i + 1).padStart(2, '0')}`
    return generateStimulus(
      {
        id,
        seed: `${setSeed}:${id}`,
        clutter: CLUTTER_LEVELS[i % CLUTTER_LEVELS.length],
        difficulty: i < PRACTICE_TRIALS_PER_BLOCK / 2 ? 'easy' : 'medium',
        pairType: nextPracticePairType(practiceQuestions[i]),
        question: practiceQuestions[i],
        nearer: practiceNearers[i],
        nearerHigher: practiceHighers[i],
        practice: true,
      },
      camera,
    )
  })

  return { seed: setSeed, measured, practice }
}

let cachedStudySet = null

/** The study's fixed set, generated once per page load. */
export function getStudyStimulusSet() {
  if (!cachedStudySet) cachedStudySet = generateStimulusSet(STUDY_STIMULUS_SEED)
  return cachedStudySet
}

export function findStimulus(stimulusSet, id) {
  return (
    stimulusSet.measured.find((s) => s.id === id) ?? stimulusSet.practice.find((s) => s.id === id)
  )
}
