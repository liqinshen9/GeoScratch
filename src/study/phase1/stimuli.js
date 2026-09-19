import THREE from '@/utils/three'
import { closestApproach } from '@/utils/lineIntersection'
import { createRng } from './prng'
import {
  CAMERA,
  VIEWPORT,
  STUDY_STIMULUS_SEED,
  DEPTH_SEPARATIONS,
  DIFFICULTY_LEVELS,
  CLUTTER_DISTRACTORS,
  CLUTTER_LEVELS,
  MEASURED_DIFFICULTY_COUNTS,
  PRACTICE_TRIALS_PER_BLOCK,
  PAIR_KINDS,
  PAIR_TYPES,
  OCCLUSION_PAIR_TYPES,
  PROBE_BANDS,
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

/** The judged point of a trial: a crossing, or a screen column for a band. */
export function probeOf(stimulus) {
  const ndc = { x: stimulus.probeNdc[0], y: stimulus.probeNdc[1] }
  return stimulus.question.type === 'occlusion'
    ? { type: 'occlusion', ndc }
    : { type: 'proximity', ndc, x: ndc.x }
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
  const [yA, yB] = rng.next() < 0.5 ? [lower, lower + gap] : [lower + gap, lower]
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
    const { min, max } = PLACEMENT.targetSphereRadius
    const radius = round(rng.range(min, max))
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

function placeTargets(params, rng, camera) {
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

function placeDistractor(rng, camera, placed, key, solids, forcedKind = null) {
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
  }
  return clearOfTargetLabels(camera, object, labelAnchors) ? object : null
}

function tryGenerate(params, rng, camera) {
  const placed = placeTargets(params, rng, camera)
  if (!placed) return null
  const { anchors, probe, targets } = placed

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
  let carriers = targets.filter((t) => t.kind === 'line')
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
    const distractor = retry(() => placeDistractor(rng, camera, placed, key, solids))
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
    objects: [...targets, ...distractors],
  }

  const depths = targetDepths(camera, stimulus)
  if (depths.A == null || depths.B == null) return null
  const nearer = depths.A < depths.B ? 'A' : 'B'
  if (nearer !== params.nearer) return null
  return {
    ...stimulus,
    nearer,
    depths: { A: round(depths.A), B: round(depths.B) },
    depthGap: round(Math.abs(depths.A - depths.B)),
  }
}

/**
 * One stimulus from explicit parameters. Deterministic in `params.seed`.
 *
 * @param {{ id: string, seed: string, clutter: 'low'|'high', difficulty: 'easy'|'medium'|'hard',
 *           pairType: string, nearer: 'A'|'B', question: object, practice?: boolean }} params
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

/** An occlusion question, or a proximity question in one of the three bands. */
function questionsFor(rng, count) {
  const types = dealt(rng, ['occlusion', 'proximity'], count)
  const bands = dealt(
    rng,
    PROBE_BANDS.map((band) => band.id),
    types.filter((type) => type === 'proximity').length,
  )
  return types.map((type) => (type === 'occlusion' ? { type } : { type, band: bands.pop() }))
}

/**
 * Pair types for a list of questions, dealt from pools shared by every clutter
 * level so each pairing appears equally often within its question type. Spheres
 * only ever appear in proximity questions.
 */
function pairTypePools(rng, questions) {
  const count = (type) => questions.filter((q) => q.type === type).length
  const occlusion = dealt(rng, OCCLUSION_PAIR_TYPES, count('occlusion'))
  const proximity = dealt(rng, PAIR_TYPES, count('proximity'))
  return (question) => (question.type === 'occlusion' ? occlusion.pop() : proximity.pop())
}

/**
 * The fixed stimulus set every participant sees: measured stimuli (per clutter
 * level, by MEASURED_DIFFICULTY_COUNTS) and a separate practice set. Question
 * type, which target is nearer and the pair type are balanced within each
 * clutter level.
 */
export function generateStimulusSet(setSeed = STUDY_STIMULUS_SEED) {
  const camera = makeStudyCamera()
  const rng = createRng(`${setSeed}:layout`)

  // Difficulty, question type and which target is nearer are balanced within
  // each clutter level; pair type is dealt from one pool across both.
  const plan = CLUTTER_LEVELS.map((clutter) => {
    const difficulties = DIFFICULTY_LEVELS.flatMap((level) =>
      Array(MEASURED_DIFFICULTY_COUNTS[clutter][level]).fill(level),
    )
    return {
      clutter,
      difficulties,
      nearers: dealt(rng, ['A', 'B'], difficulties.length),
      questions: questionsFor(rng, difficulties.length),
    }
  })
  const nextPairType = pairTypePools(
    rng,
    plan.flatMap((entry) => entry.questions),
  )

  const measured = []
  for (const { clutter, difficulties, nearers, questions } of plan) {
    difficulties.forEach((difficulty, i) => {
      const id = `m-${clutter}-${String(i + 1).padStart(2, '0')}`
      measured.push(
        generateStimulus(
          {
            id,
            seed: `${setSeed}:${id}`,
            clutter,
            difficulty,
            pairType: nextPairType(questions[i]),
            question: questions[i],
            nearer: nearers[i],
          },
          camera,
        ),
      )
    })
  }

  const practiceNearers = dealt(rng, ['A', 'B'], PRACTICE_TRIALS_PER_BLOCK)
  const practiceQuestions = questionsFor(rng, PRACTICE_TRIALS_PER_BLOCK)
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
