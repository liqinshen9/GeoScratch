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

const lineOf = (object) => ({
  origin: toVec(object.origin),
  direction: toVec(object.direction).normalize(),
})

/** Closest 3D distance between a stimulus line and another line or point. */
export function separation3d(line, other) {
  const a = lineOf(line)
  if (other.kind === 'point') {
    const offset = toVec(other.position).sub(a.origin)
    return offset.sub(a.direction.clone().multiplyScalar(offset.dot(a.direction))).length()
  }
  const b = lineOf(other)
  const approach = closestApproach(a.origin, a.direction, b.origin, b.direction)
  return approach ? approach.distance : Infinity
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

function ndcDistanceToObject(camera, ndc, object) {
  if (object.kind === 'point') return ndcDistance(ndc, toNdc(camera, toVec(object.position)))
  return ndcDistanceToLine(camera, ndc, toVec(object.origin), toVec(object.direction))
}

/**
 * Screen positions of the line targets' labels, or null if any label would sit
 * off screen, near the crossing, or on the other target, where it could be read
 * as belonging to the wrong object.
 */
function targetLabelAnchors(camera, crossing, targets) {
  const anchors = []
  for (const target of targets) {
    if (target.kind !== 'line') continue
    const ndc = toNdc(camera, lineLabelAnchor(toVec(target.origin), toVec(target.direction)))
    const other = targets.find((t) => t !== target)
    if (
      Math.abs(ndc.x) > PLACEMENT.labelOnScreenNdc.x ||
      Math.abs(ndc.y) > PLACEMENT.labelOnScreenNdc.y ||
      ndcDistance(ndc, crossing) < PLACEMENT.labelClearOfCrossingNdc ||
      ndcDistanceToObject(camera, ndc, other) < PLACEMENT.labelClearOfOtherTargetNdc
    ) {
      return null
    }
    anchors.push(ndc)
  }
  return anchors
}

/** Approximate on-screen radius of a sphere of `radius` at `centre`, in NDC y units. */
function projectedRadius(camera, centre, radius) {
  const depth = viewDepth(camera, centre)
  return radius / (depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
}

function solidBoundingRadius(object) {
  return object.kind === 'cube' ? (object.size * Math.sqrt(3)) / 2 : object.radius
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
  if (kind === 'cube') return { kind, centre: roundVec(centre), size: round(rng.range(1.4, 2.4)) }
  return { kind, centre: roundVec(centre), radius: round(rng.range(0.7, 1.2)) }
}

function solidClearOfCrossing(camera, solid, crossing) {
  const centre = toVec(solid.centre)
  const clearance =
    ndcDistance(toNdc(camera, centre), crossing) -
    projectedRadius(camera, centre, solidBoundingRadius(solid))
  return clearance >= PLACEMENT.clearOfCrossingNdc && withinBounds(centre)
}

function clearOfTargetLabels(camera, object, labelAnchors) {
  const min = PLACEMENT.clearOfTargetLabelNdc
  return labelAnchors.every((ndc) => {
    if (object.kind === 'line' || object.kind === 'point') {
      return ndcDistanceToObject(camera, ndc, object) >= min
    }
    const centre = toVec(object.centre)
    const radius = projectedRadius(camera, centre, solidBoundingRadius(object))
    return ndcDistance(ndc, toNdc(camera, centre)) - radius >= min
  })
}

/**
 * Camera-space depth of each target where the pair meets on screen, recomputed
 * from the rounded geometry actually written to blocks.
 */
export function targetDepths(camera, stimulus) {
  const crossing = { x: stimulus.crossingNdc[0], y: stimulus.crossingNdc[1] }
  const depths = {}
  for (const object of stimulus.objects) {
    if (object.role !== 'target') continue
    const point =
      object.kind === 'point'
        ? toVec(object.position)
        : lineAtNdc(camera, crossing, toVec(object.origin), toVec(object.direction))
    depths[object.key] = viewDepth(camera, point)
  }
  return depths
}

function placeTargets(params, rng, camera) {
  const crossing = {
    x: rng.range(-PLACEMENT.crossingNdc.x, PLACEMENT.crossingNdc.x),
    y: rng.range(-PLACEMENT.crossingNdc.y, PLACEMENT.crossingNdc.y),
  }
  const cameraDistance = camera.position.distanceTo(toVec(CAMERA.target))
  const base = cameraDistance + rng.range(-PLACEMENT.depthJitter, PLACEMENT.depthJitter)
  const gap = DEPTH_SEPARATIONS[params.difficulty]
  const depth = {
    A: params.nearer === 'A' ? base - gap / 2 : base + gap / 2,
    B: params.nearer === 'A' ? base + gap / 2 : base - gap / 2,
  }

  const kinds =
    params.pairType === 'line-point'
      ? rng.next() < 0.5
        ? { A: 'line', B: 'point' }
        : { A: 'point', B: 'line' }
      : { A: 'line', B: 'line' }

  const angleA = rng.range(0, Math.PI)
  const minAngle = THREE.MathUtils.degToRad(PLACEMENT.minCrossingAngleDeg)
  const angleB = angleA + rng.sign() * rng.range(minAngle, Math.PI - minAngle)
  const angles = { A: angleA, B: angleB }

  const targets = []
  for (const key of ['A', 'B']) {
    const anchor = worldAtNdc(camera, crossing, depth[key])
    if (!withinBounds(anchor)) return null
    if (kinds[key] === 'point') {
      targets.push({ key, role: 'target', kind: 'point', position: roundVec(anchor) })
    } else {
      targets.push({
        key,
        role: 'target',
        kind: 'line',
        origin: roundVec(anchor),
        direction: roundVec(lineDirection(camera, rng, angles[key])),
      })
    }
  }
  const line = targets.find((t) => t.kind === 'line')
  const other = targets.find((t) => t !== line)
  if (separation3d(line, other) < PLACEMENT.minSeparation3d) return null

  const labelAnchors = targetLabelAnchors(camera, crossing, targets)
  if (!labelAnchors) return null
  return { crossing, base, targets, labelAnchors }
}

/** A solid threaded on a target line away from the crossing, so T4/T7 have something to show. */
function placeSolidOnTarget(rng, camera, crossing, targets, labelAnchors) {
  const lines = targets.filter((t) => t.kind === 'line')
  const line = rng.pick(lines)
  const origin = toVec(line.origin)
  const direction = toVec(line.direction).normalize()
  const perUnit = ndcDistance(toNdc(camera, origin.clone().add(direction)), toNdc(camera, origin))
  if (perUnit < 1e-6) return null
  const wanted = rng.range(PLACEMENT.solidOnTargetMinNdc, PLACEMENT.solidOnTargetMaxNdc)
  const centre = origin.clone().addScaledVector(direction, rng.sign() * (wanted / perUnit))
  const solid = {
    key: 'd1',
    role: 'distractor',
    ...makeSolid(rng, rng.pick(['cube', 'sphere']), centre),
  }
  return solidClearOfCrossing(camera, solid, crossing) &&
    clearOfTargetLabels(camera, solid, labelAnchors)
    ? solid
    : null
}

function placeDistractor(rng, camera, crossing, base, key, targets, labelAnchors) {
  const kind = rng.pick(DISTRACTOR_KINDS)
  const angle = rng.range(0, Math.PI * 2)
  const radius = PLACEMENT.distractorRadiusNdc * Math.sqrt(rng.next())
  const ndc = { x: crossing.x + Math.cos(angle) * radius, y: crossing.y + Math.sin(angle) * radius }
  const depth = base + rng.range(-PLACEMENT.distractorDepthJitter, PLACEMENT.distractorDepthJitter)
  const anchor = worldAtNdc(camera, ndc, depth)
  if (!withinBounds(anchor)) return null

  let object
  if (kind === 'point') {
    if (ndcDistance(ndc, crossing) < PLACEMENT.clearOfCrossingNdc) return null
    object = { key, role: 'distractor', kind, position: roundVec(anchor) }
  } else if (kind === 'line') {
    const direction = lineDirection(camera, rng, rng.range(0, Math.PI))
    if (ndcDistanceToLine(camera, crossing, anchor, direction) < PLACEMENT.clearOfCrossingNdc) {
      return null
    }
    object = {
      key,
      role: 'distractor',
      kind,
      origin: roundVec(anchor),
      direction: roundVec(direction),
    }
    const touchesTarget = targets.some(
      (t) => t.kind === 'line' && separation3d(t, object) < PLACEMENT.minSeparation3d,
    )
    if (touchesTarget) return null
  } else {
    object = { key, role: 'distractor', ...makeSolid(rng, kind, anchor) }
    if (!solidClearOfCrossing(camera, object, crossing)) return null
  }
  return clearOfTargetLabels(camera, object, labelAnchors) ? object : null
}

function tryGenerate(params, rng, camera) {
  const placed = placeTargets(params, rng, camera)
  if (!placed) return null
  const { crossing, base, targets, labelAnchors } = placed

  const count = CLUTTER_DISTRACTORS[params.clutter]
  const distractors = []
  const anchored = placeSolidOnTarget(rng, camera, crossing, targets, labelAnchors)
  if (!anchored) return null
  distractors.push(anchored)

  while (distractors.length < count) {
    const key = `d${distractors.length + 1}`
    let distractor = null
    for (let attempt = 0; attempt < 60 && !distractor; attempt++) {
      distractor = placeDistractor(rng, camera, crossing, base, key, targets, labelAnchors)
    }
    if (!distractor) return null
    distractors.push(distractor)
  }

  const stimulus = {
    id: params.id,
    seed: params.seed,
    practice: Boolean(params.practice),
    clutter: params.clutter,
    difficulty: params.difficulty,
    pairType: params.pairType,
    crossingNdc: [round(crossing.x), round(crossing.y)],
    colourSalt: rng.token(6),
    objects: [...targets, ...distractors],
  }

  const depths = targetDepths(camera, stimulus)
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
 *           pairType: 'line-line'|'line-point', nearer: 'A'|'B', practice?: boolean }} params
 */
export function generateStimulus(params, camera = makeStudyCamera()) {
  const rng = createRng(params.seed)
  for (let attempt = 0; attempt < 500; attempt++) {
    const stimulus = tryGenerate(params, rng, camera)
    if (stimulus) return stimulus
  }
  throw new Error(`[GeoScratch] Could not place Phase 1 stimulus ${params.id}`)
}

const balanced = (a, b, n) => [...Array(n / 2).fill(a), ...Array(n / 2).fill(b)]

/**
 * The fixed stimulus set every participant sees: measured stimuli (per clutter
 * level, by MEASURED_DIFFICULTY_COUNTS) and a separate practice set. Which
 * target is nearer and the pair type are balanced within each clutter level.
 */
export function generateStimulusSet(setSeed = STUDY_STIMULUS_SEED) {
  const camera = makeStudyCamera()
  const rng = createRng(`${setSeed}:layout`)

  const measured = []
  for (const clutter of CLUTTER_LEVELS) {
    const difficulties = DIFFICULTY_LEVELS.flatMap((level) =>
      Array(MEASURED_DIFFICULTY_COUNTS[clutter][level]).fill(level),
    )
    const nearers = rng.shuffle(balanced('A', 'B', difficulties.length))
    const pairTypes = rng.shuffle(balanced('line-line', 'line-point', difficulties.length))
    difficulties.forEach((difficulty, i) => {
      const id = `m-${clutter}-${String(i + 1).padStart(2, '0')}`
      measured.push(
        generateStimulus(
          {
            id,
            seed: `${setSeed}:${id}`,
            clutter,
            difficulty,
            pairType: pairTypes[i],
            nearer: nearers[i],
          },
          camera,
        ),
      )
    })
  }

  const practiceNearers = rng.shuffle(balanced('A', 'B', PRACTICE_TRIALS_PER_BLOCK))
  const practicePairs = rng.shuffle(balanced('line-line', 'line-point', PRACTICE_TRIALS_PER_BLOCK))
  const practice = Array.from({ length: PRACTICE_TRIALS_PER_BLOCK }, (_, i) => {
    const id = `p-${String(i + 1).padStart(2, '0')}`
    return generateStimulus(
      {
        id,
        seed: `${setSeed}:${id}`,
        clutter: CLUTTER_LEVELS[i % CLUTTER_LEVELS.length],
        difficulty: i < PRACTICE_TRIALS_PER_BLOCK / 2 ? 'easy' : 'medium',
        pairType: practicePairs[i],
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
