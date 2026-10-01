import THREE from '@/utils/three'
import { OVERHEAD_LIGHT_POSITION } from '@/components/Scene3D/sceneConstants'
import { makeStudyCamera } from './stimuli'

// How much of each target's overhead shadow a participant can actually see.
// The only shadow receiver is the room (SceneFurniture's BoundingBoxRoom), so
// a target's shadow can land low on the floor, off screen, or on a near wall
// the camera culls. Logged per trial so T6/T7/T10 trials without a visible
// shadow can be told apart. See docs/architecture/study-phase1.md#shadow-visibility.

const { Vector3 } = THREE

// BoundingBoxRoom's half size; lines are also clipped to it (geoVectorLine.js).
const ROOM_HALF = 20
const LINE_SAMPLES = 64
const AXES = ['x', 'y', 'z']

const toVec = (arr) => new Vector3(arr[0], arr[1], arr[2])

/** Where the light's ray through `point` meets the room, and which face it hits. */
export function shadowOnRoom(point, light = toVec(OVERHEAD_LIGHT_POSITION)) {
  const d = point.clone().sub(light)
  let tExit = Infinity
  let face = null
  for (const axis of AXES) {
    if (Math.abs(d[axis]) < 1e-12) continue
    const sign = d[axis] > 0 ? 1 : -1
    const t = (sign * ROOM_HALF - light[axis]) / d[axis]
    if (t > 0 && t < tExit) {
      tExit = t
      face = `${sign > 0 ? 'P' : 'N'}${axis.toUpperCase()}`
    }
  }
  if (!face) return null
  return { point: light.clone().addScaledVector(d, tExit), face }
}

// BackSide walls: a face is culled when the camera is beyond its plane,
// the same test as SceneFurniture's openFaces.
function faceVisible(camera, face) {
  const axis = face[1].toLowerCase()
  const beyond =
    face[0] === 'P' ? camera.position[axis] > ROOM_HALF : camera.position[axis] < -ROOM_HALF
  return !beyond
}

function onScreen(camera, point) {
  const inView = point.clone().applyMatrix4(camera.matrixWorldInverse).z < 0
  const p = point.clone().project(camera)
  return inView && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1
}

function shadowPointVisible(camera, point, light) {
  const hit = shadowOnRoom(point, light)
  return Boolean(hit) && faceVisible(camera, hit.face) && onScreen(camera, hit.point)
}

// Slab clip of a line to the room, as geoVectorLine.js draws it.
function clipToRoom(origin, direction) {
  let tEnter = -Infinity
  let tExit = Infinity
  for (const axis of AXES) {
    const o = origin[axis]
    const d = direction[axis]
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(o) > ROOM_HALF) return null
      continue
    }
    const [t1, t2] = [(-ROOM_HALF - o) / d, (ROOM_HALF - o) / d].sort((a, b) => a - b)
    tEnter = Math.max(tEnter, t1)
    tExit = Math.min(tExit, t2)
  }
  return tExit < tEnter ? null : [tEnter, tExit]
}

/** Points along the drawn target whose shadows stand for its whole shadow. */
function castingPoints(object) {
  if (object.kind === 'point') return [toVec(object.position)]
  if (object.kind === 'sphere') return [toVec(object.centre)]
  const origin = toVec(object.origin)
  let direction
  let span
  if (object.kind === 'vector') {
    direction = toVec(object.vector)
    span = [0, 1]
  } else {
    direction = toVec(object.direction).normalize()
    span = clipToRoom(origin, direction)
    if (!span) return []
  }
  return Array.from({ length: LINE_SAMPLES + 1 }, (_, i) => {
    const t = span[0] + ((span[1] - span[0]) * i) / LINE_SAMPLES
    return origin.clone().addScaledVector(direction, t)
  })
}

/**
 * The share (0..1) of a target's overhead shadow that lands on a visible, on-screen
 * part of the room: a point or sphere is 0 or 1, a line or vector the share of
 * its length. Ignores other objects standing between the shadow and the camera.
 */
export function shadowVisibleShare(object, camera, light = toVec(OVERHEAD_LIGHT_POSITION)) {
  const points = castingPoints(object)
  if (!points.length) return 0
  const visible = points.filter((p) => shadowPointVisible(camera, p, light)).length
  return Math.round((visible / points.length) * 1000) / 1000
}

let studyCamera = null

/** `{ A, B }` shadow shares for a stimulus under the trial camera. */
export function targetShadowVisibility(stimulus, camera) {
  const cam = camera ?? (studyCamera ??= makeStudyCamera())
  const result = { A: null, B: null }
  for (const object of stimulus?.objects ?? []) {
    if (object.role === 'target' && object.key in result) {
      result[object.key] = shadowVisibleShare(object, cam)
    }
  }
  return result
}
