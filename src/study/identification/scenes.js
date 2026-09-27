import THREE from '@/utils/three'
import { createRng } from '@/study/phase1/prng'
import { makeStudyCamera, viewDepth } from '@/study/phase1/stimuli'
import {
  IDENTIFICATION_SEED,
  IDENTIFICATION_CELLS,
  MEASURED_TRIALS_PER_CELL,
  PRACTICE_TRIALS_PER_BLOCK,
  SCENE_KINDS,
  OBJECTS_PER_SCENE,
  PLACEMENT,
  IDENTIFY_VIEWPORT,
} from './identificationConfig'

// Procedural identification scenes: plain data that identificationToXml turns
// into blocks. See docs/architecture/study-session.md#identification-task.

const ASPECT = IDENTIFY_VIEWPORT.width / IDENTIFY_VIEWPORT.height

/** On-screen extent of an object, in NDC y units (x scaled by the aspect). */
function screenFootprint(camera, object) {
  const centre = new THREE.Vector3(...object.position)
  const p = centre.clone().project(camera)
  const extent =
    object.kind === 'sphere'
      ? object.radius
      : object.kind === 'cube'
        ? (object.size * Math.sqrt(3)) / 2
        : 0.3
  const depth = viewDepth(camera, centre)
  const radius = extent / (depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
  return { x: p.x * ASPECT, y: p.y, radius, inFront: depth > 0 }
}

function fitsOnScreen(footprint) {
  const { x, y, radius } = footprint
  const limit = PLACEMENT.maxNdc
  return (
    footprint.inFront && Math.abs(x) + radius <= limit * ASPECT && Math.abs(y) + radius <= limit
  )
}

function apart(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius >= PLACEMENT.minSeparationNdc
}

function randomObject(rng, kind, key) {
  const { coordinateRange: c, heightRange: h } = PLACEMENT
  const coord = (range) => range.min + rng.int(range.max - range.min + 1)
  const object = { key, kind, position: [coord(c), coord(h), coord(c)] }
  if (kind === 'sphere') object.radius = rng.pick(PLACEMENT.sphereRadii)
  if (kind === 'cube') object.size = rng.pick(PLACEMENT.cubeSizes)
  return object
}

/**
 * One scene: `OBJECTS_PER_SCENE` objects of `kind`, each whole on screen and
 * clear of the others, no two at the same position, and one of them the target.
 */
export function generateScene(id, kind, camera = makeStudyCamera(IDENTIFY_VIEWPORT)) {
  const rng = createRng(`${IDENTIFICATION_SEED}:${id}`)
  const objects = []
  const footprints = []
  const taken = new Set()
  for (let attempt = 0; objects.length < OBJECTS_PER_SCENE; attempt++) {
    if (attempt >= PLACEMENT.maxAttempts) {
      throw new Error(`[GeoScratch] Could not place identification scene ${id}`)
    }
    const object = randomObject(rng, kind, `o${objects.length + 1}`)
    const position = object.position.join(',')
    const footprint = screenFootprint(camera, object)
    if (taken.has(position) || !fitsOnScreen(footprint)) continue
    if (!footprints.every((other) => apart(footprint, other))) continue
    taken.add(position)
    objects.push(object)
    footprints.push(footprint)
  }
  return { id, kind, objects, targetKey: objects[rng.int(objects.length)].key }
}

/**
 * The fixed scene set: one measured set of `MEASURED_TRIALS_PER_CELL` scenes
 * per cell, and practice scenes for each block. Distinct scenes in every set,
 * so a participant cannot answer a later block from memory of an earlier one.
 * Kinds are balanced across each set.
 */
export function generateIdentificationScenes() {
  const camera = makeStudyCamera(IDENTIFY_VIEWPORT)
  const setCount = IDENTIFICATION_CELLS.length
  const measured = Array.from({ length: setCount }, (_, set) =>
    Array.from({ length: MEASURED_TRIALS_PER_CELL }, (_, i) =>
      generateScene(
        `m${set + 1}-${String(i + 1).padStart(2, '0')}`,
        SCENE_KINDS[i % SCENE_KINDS.length],
        camera,
      ),
    ),
  )
  const practice = Array.from({ length: setCount }, (_, block) =>
    Array.from({ length: PRACTICE_TRIALS_PER_BLOCK }, (_, i) =>
      generateScene(
        `p${block + 1}-${i + 1}`,
        SCENE_KINDS[(block + i) % SCENE_KINDS.length],
        camera,
      ),
    ),
  )
  return { seed: IDENTIFICATION_SEED, measured, practice }
}

let cached = null
export function getIdentificationScenes() {
  cached ??= generateIdentificationScenes()
  return cached
}

export function findScene(scenes, id) {
  return [...scenes.measured.flat(), ...scenes.practice.flat()].find((s) => s.id === id) ?? null
}
