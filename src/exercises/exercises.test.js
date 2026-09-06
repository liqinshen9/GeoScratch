import { describe, it, expect } from 'vitest'
import THREE from '@/utils/three'
import { getExerciseModule, EXERCISE_MODULES } from './index'
import { EXERCISES } from '@/data/exercises'

/**
 * These cover the exercise checkers, which decide whether a student has passed.
 * They had no coverage before being split out of ExercisePage.
 *
 * The fakes below implement only the slice of the Blockly API the predicates
 * actually touch: type, fields, value inputs, and the next-block chain.
 */

let nextId = 0

/**
 * @param {string} type      Blockly block type.
 * @param {object} fields    Field name -> value.
 * @param {object} inputs    Input name -> child block.
 * @param {object} nextBlock Next block in a statement chain.
 */
function fakeBlock(type, fields = {}, inputs = {}, nextBlock = null) {
  return {
    id: `block-${nextId++}`,
    type,
    getFieldValue: (name) => fields[name],
    getInputTargetBlock: (name) => inputs[name] ?? null,
    getNextBlock: () => nextBlock,
    inputList: Object.values(inputs).map((b) => ({ connection: { targetBlock: () => b } })),
  }
}

const vec3 = (x, y, z) => fakeBlock('linalg_vec3', { X: x, Y: y, Z: z })
const point = (x, y, z) => fakeBlock('linalg_point', { X: x, Y: y, Z: z })
const scalar = (v) => fakeBlock('scalar', { scalar: v })

function fakeWorkspace(blocks) {
  const all = []
  const walk = (b) => {
    if (!b || all.includes(b)) return
    all.push(b)
    Object.values(b.inputList).forEach((i) => walk(i.connection.targetBlock()))
    walk(b.getNextBlock())
  }
  blocks.forEach(walk)
  return {
    getAllBlocks: () => all,
    getBlocksByType: (type) => all.filter((b) => b.type === type),
    getBlockById: (id) => all.find((b) => b.id === id) ?? null,
  }
}

/** A teapot mesh posed by an applied transform, as the scene would produce. */
function posedTeapot({ scale = 1, quaternion = null, position = [0, 0, 0] } = {}) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1))
  // getTransformTargetObject identifies the target by its authored centre and
  // size, not by its current pose -- those stay at the values the block set.
  mesh.userData.geoType = 'geo_teapot'
  mesh.userData.centre = new THREE.Vector3(0, 0, 0)
  mesh.userData.size = 1
  mesh.scale.setScalar(scale)
  mesh.position.set(...position)
  if (quaternion) mesh.quaternion.copy(quaternion)
  return mesh
}

const quatAbout = (axis, degrees) =>
  new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(degrees))

const teapotBlock = () => fakeBlock('geo_teapot', {}, { SIZE_INPUT: scalar(1) })

function pipelineTo(target, steps) {
  const chain = steps.reduceRight((next, step) => ({ ...step, getNextBlock: () => next }), null)
  return fakeBlock('transform_pipeline', {}, { INPUT: target, STEPS: chain })
}

describe('exercise registry', () => {
  it('has a module for every exercise listed in data/exercises.js', () => {
    EXERCISES.forEach(({ number }) => {
      expect(EXERCISE_MODULES[number], `exercise ${number}`).toBeDefined()
    })
  })

  it('gives every module the shape ExercisePage relies on', () => {
    Object.entries(EXERCISE_MODULES).forEach(([key, mod]) => {
      expect(mod.number, `exercise ${key} number`).toBe(Number(key))
      expect(mod.Givens).toBeTypeOf('function')
      expect(mod.Steps).toBeTypeOf('function')
      expect(mod.evaluate).toBeTypeOf('function')
    })
  })

  it('falls back to exercise 1 for an unknown number', () => {
    expect(getExerciseModule(99).number).toBe(1)
    expect(getExerciseModule(undefined).number).toBe(1)
  })

  it('returns a non-passing result for an empty workspace', () => {
    // The page calls evaluate on every render, including the very first one
    // before any workspace exists.
    Object.values(EXERCISE_MODULES).forEach((mod) => {
      const result = mod.evaluate({ objects: [], workspace: null })
      expect(result.passed, `exercise ${mod.number}`).toBe(false)
      expect(result.steps).toBeTypeOf('object')
      expect(result.answer).toBeTypeOf('object')
    })
  })
})

describe('exercise 1 (scale by 3)', () => {
  const mod = EXERCISE_MODULES[1]

  it('passes when the teapot is scaled by 3 via a pipeline step', () => {
    const teapot = teapotBlock()
    const workspace = fakeWorkspace([
      pipelineTo(teapot, [fakeBlock('scale_matrix', { SX: 3, SY: 3, SZ: 3 })]),
    ])
    const result = mod.evaluate({ objects: [posedTeapot({ scale: 3 })], workspace })

    expect(result.passed).toBe(true)
    expect(result.steps).toEqual({ teapot: true, pipeline: true, scale: true })
  })

  it('does not pass on the wrong scale factor', () => {
    const teapot = teapotBlock()
    const workspace = fakeWorkspace([
      pipelineTo(teapot, [fakeBlock('scale_matrix', { SX: 2, SY: 2, SZ: 2 })]),
    ])
    const result = mod.evaluate({ objects: [posedTeapot({ scale: 2 })], workspace })

    expect(result.passed).toBe(false)
    expect(result.incorrect).toBe(true)
  })

  it('does not pass when the object is scaled but no pipeline step produced it', () => {
    // Guards the "typed the answer in" case: the pose is right, the working is missing.
    const workspace = fakeWorkspace([teapotBlock()])
    const result = mod.evaluate({ objects: [posedTeapot({ scale: 3 })], workspace })

    expect(result.passed).toBe(false)
    // The card still reads as correct -- the pose genuinely matches.
    expect(result.correct).toBe(true)
  })

  it('is neither correct nor incorrect before anything is built', () => {
    const result = mod.evaluate({ objects: [], workspace: fakeWorkspace([]) })
    expect(result.correct).toBe(false)
    expect(result.incorrect).toBe(false)
  })
})

describe('exercise 2 (rotate 90 about Z)', () => {
  const mod = EXERCISE_MODULES[2]

  it('passes for a 90 degree Z rotation', () => {
    const workspace = fakeWorkspace([
      pipelineTo(teapotBlock(), [fakeBlock('rot_matrix', { AXIS: 'Z', DEGREES: 90 })]),
    ])
    const objects = [posedTeapot({ quaternion: quatAbout(new THREE.Vector3(0, 0, 1), 90) })]

    expect(mod.evaluate({ objects, workspace }).passed).toBe(true)
  })

  it('does not pass for a rotation about the wrong axis', () => {
    const workspace = fakeWorkspace([
      pipelineTo(teapotBlock(), [fakeBlock('rot_matrix', { AXIS: 'Y', DEGREES: 90 })]),
    ])
    const objects = [posedTeapot({ quaternion: quatAbout(new THREE.Vector3(0, 1, 0), 90) })]

    expect(mod.evaluate({ objects, workspace }).passed).toBe(false)
  })
})

describe('exercise 3 (scale 2 and rotate 45 about Y)', () => {
  const mod = EXERCISE_MODULES[3]

  const bothSteps = () => [
    fakeBlock('scale_matrix', { SX: 2, SY: 2, SZ: 2 }),
    fakeBlock('rot_matrix', { AXIS: 'Y', DEGREES: 45 }),
  ]
  const posed = () =>
    posedTeapot({ scale: 2, quaternion: quatAbout(new THREE.Vector3(0, 1, 0), 45) })

  it('passes when both steps are present', () => {
    const workspace = fakeWorkspace([pipelineTo(teapotBlock(), bothSteps())])
    const result = mod.evaluate({ objects: [posed()], workspace })

    expect(result.passed).toBe(true)
    expect(result.steps.scale).toBe(true)
    expect(result.steps.rotate).toBe(true)
  })

  it('accepts the two steps in either order', () => {
    const workspace = fakeWorkspace([pipelineTo(teapotBlock(), bothSteps().reverse())])
    expect(mod.evaluate({ objects: [posed()], workspace }).passed).toBe(true)
  })

  it('does not pass with only the scale step', () => {
    const workspace = fakeWorkspace([
      pipelineTo(teapotBlock(), [fakeBlock('scale_matrix', { SX: 2, SY: 2, SZ: 2 })]),
    ])
    const result = mod.evaluate({ objects: [posedTeapot({ scale: 2 })], workspace })

    expect(result.passed).toBe(false)
    expect(result.steps.scale).toBe(true)
    expect(result.steps.rotate).toBe(false)
  })

  it('exposes seedWorkspace for its decorative blocks', () => {
    expect(mod.seedWorkspace).toBeTypeOf('function')
  })
})

describe('exercise 4 (translate by (3,0,0))', () => {
  const mod = EXERCISE_MODULES[4]

  it('passes for the target translation', () => {
    const workspace = fakeWorkspace([
      pipelineTo(teapotBlock(), [fakeBlock('trans_matrix', { TX: 3, TY: 0, TZ: 0 })]),
    ])
    const objects = [posedTeapot({ position: [3, 0, 0] })]

    expect(mod.evaluate({ objects, workspace }).passed).toBe(true)
  })

  it('does not pass for a translation along the wrong axis', () => {
    const workspace = fakeWorkspace([
      pipelineTo(teapotBlock(), [fakeBlock('trans_matrix', { TX: 0, TY: 3, TZ: 0 })]),
    ])
    const objects = [posedTeapot({ position: [0, 3, 0] })]

    expect(mod.evaluate({ objects, workspace }).passed).toBe(false)
  })
})

describe('exercise 7 (distance between spheres)', () => {
  const mod = EXERCISE_MODULES[7]

  // |B - A| = |(7, -3, 5)| = sqrt(83); minus radii 1.3 and 0.9.
  const EXPECTED = Math.sqrt(83) - 1.3 - 0.9

  function solvedWorkspace() {
    const centreA = point(-4, 2, 1)
    const centreB = point(3, -1, 6)
    const sphereA = fakeBlock('geo_sphere', {}, { CENTRE: centreA, RADIUS_INPUT: scalar(1.3) })
    const sphereB = fakeBlock('geo_sphere', {}, { CENTRE: centreB, RADIUS_INPUT: scalar(0.9) })
    const difference = fakeBlock(
      'vector_arithmetic',
      { OP: 'subtract' },
      { U: centreB, V: centreA },
    )
    const magnitude = fakeBlock('vector_magnitude', {}, { V: difference })
    const radiusSum = fakeBlock(
      'scalar_arithmetic',
      { OP: 'add' },
      { A: scalar(1.3), B: scalar(0.9) },
    )
    const answer = fakeBlock(
      'scalar_arithmetic',
      { OP: 'subtract' },
      { A: magnitude, B: radiusSum },
    )
    return { workspace: fakeWorkspace([sphereA, sphereB, answer]), answer }
  }

  const scalarResult = (blockId, value) => ({
    userData: { geoType: 'scalar_arithmetic_result', srcBlockId: blockId, value },
  })

  it('passes on a fully built solution', () => {
    const { workspace, answer } = solvedWorkspace()
    const result = mod.evaluate({ objects: [scalarResult(answer.id, EXPECTED)], workspace })

    expect(result.passed).toBe(true)
    expect(result.answer.value).toBeCloseTo(EXPECTED)
    expect(result.steps).toEqual({
      spheres: true,
      difference: true,
      magnitude: true,
      distance: true,
    })
  })

  it('reads the answer from the radius-subtracting block, not any loose scalar', () => {
    // The centre-to-centre magnitude is also a scalar in the workspace; picking
    // it up would report the wrong answer as correct-looking.
    const { workspace, answer } = solvedWorkspace()
    const objects = [
      { userData: { geoType: 'scalar_arithmetic_result', srcBlockId: 'unrelated', value: 999 } },
      scalarResult(answer.id, EXPECTED),
    ]

    expect(mod.evaluate({ objects, workspace }).answer.value).toBeCloseTo(EXPECTED)
  })

  it('does not pass when the spheres have the wrong radii', () => {
    const centreA = point(-4, 2, 1)
    const sphereA = fakeBlock('geo_sphere', {}, { CENTRE: centreA, RADIUS_INPUT: scalar(5) })
    const workspace = fakeWorkspace([sphereA])

    const result = mod.evaluate({ objects: [], workspace })
    expect(result.passed).toBe(false)
    expect(result.steps.spheres).toBe(false)
  })
})

describe('exercise 5 (point to plane)', () => {
  const mod = EXERCISE_MODULES[5]

  it('recognises the point P vector in the workspace', () => {
    const workspace = fakeWorkspace([vec3(3, 4, 5)])
    expect(mod.evaluate({ objects: [], workspace }).steps.pointP).toBe(true)
  })

  it('does not recognise a different point as P', () => {
    const workspace = fakeWorkspace([vec3(1, 1, 1)])
    expect(mod.evaluate({ objects: [], workspace }).steps.pointP).toBe(false)
  })

  it('offers a reusable block template', () => {
    expect(mod.reusableBlockTemplate.xmlText).toContain('point_plane_distance')
  })
})

describe('exercise 6 (skew lines)', () => {
  const mod = EXERCISE_MODULES[6]

  it('recognises both given lines', () => {
    const line1 = fakeBlock('geo_vector', {}, { POS: point(1, 2, 0), DIR: vec3(1, 2, 3) })
    const line2 = fakeBlock('geo_vector', {}, { POS: point(5, 5, -3), DIR: vec3(2, -1, 1) })

    expect(
      mod.evaluate({ objects: [], workspace: fakeWorkspace([line1, line2]) }).steps.lines,
    ).toBe(true)
  })

  it('does not accept only one of the two lines', () => {
    const line1 = fakeBlock('geo_vector', {}, { POS: point(1, 2, 0), DIR: vec3(1, 2, 3) })

    expect(mod.evaluate({ objects: [], workspace: fakeWorkspace([line1]) }).steps.lines).toBe(false)
  })

  it('reads the distance straight off an Intersect 3D result', () => {
    const objects = [{ userData: { geoType: 'geo_line_intersection', distance: 4.24 } }]
    expect(mod.evaluate({ objects, workspace: fakeWorkspace([]) }).answer.value).toBeCloseTo(4.24)
  })
})
