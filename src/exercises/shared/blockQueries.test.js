import { describe, it, expect } from 'vitest'
import { getInputBlock, planeNormalFromBlock } from './blockQueries'

// Minimal stand-in for a Blockly block: only the socket lookup the queries use.
function block(type, inputs = {}, fields = {}) {
  return {
    type,
    getInputTargetBlock: (name) => inputs[name] ?? null,
    getFieldValue: (name) => fields[name],
  }
}

const vec = (x, y, z) => block('linalg_vec3', {}, { X: x, Y: y, Z: z })
const plane = (norm) => block('parametric_plane', norm ? { norm } : {})
const xyz = (v) => [v.x, v.y, v.z]

const wrap = (inner) => block('geo_variable', { VALUE: inner })

describe('getInputBlock', () => {
  it('returns the block plugged into the socket', () => {
    const point = block('linalg_point')
    expect(getInputBlock(block('vector_arithmetic', { U: point }), 'U')).toBe(point)
  })

  it('returns null for an empty socket, and for no block at all', () => {
    expect(getInputBlock(block('vector_arithmetic'), 'U')).toBeNull()
    expect(getInputBlock(null, 'U')).toBeNull()
    expect(getInputBlock({}, 'U')).toBeNull()
  })

  // Naming a value plugs it into a geo_variable wrapper. Every exercise step
  // whose predicate walks a socket broke the moment a student named an input:
  // the walk stopped at the wrapper, whose type matches nothing.
  it('sees through a geo_variable wrapper to the block it holds', () => {
    const point = block('linalg_point')
    expect(getInputBlock(block('vector_arithmetic', { U: wrap(point) }), 'U')).toBe(point)
  })

  it('sees through nested wrappers', () => {
    const point = block('linalg_point')
    expect(getInputBlock(block('vector_arithmetic', { U: wrap(wrap(point)) }), 'U')).toBe(point)
  })

  it('returns null for a wrapper with an empty socket', () => {
    expect(getInputBlock(block('vector_arithmetic', { U: block('geo_variable') }), 'U')).toBeNull()
  })

  it('terminates on a wrapper cycle rather than hanging the checker', () => {
    const cycle = { type: 'geo_variable' }
    cycle.getInputTargetBlock = () => cycle
    expect(getInputBlock(block('vector_arithmetic', { U: cycle }), 'U')).toBe(cycle)
  })
})

// parametric_plane defaults an absent or zero normal to +Y and renders the unit
// normal. A block check that read the socket literally rejected planes the app
// drew as correct: exercise 5's step 1 passed on the rendered object while
// step 4 failed on the same plane.
describe('planeNormalFromBlock', () => {
  it('reads an explicit normal', () => {
    expect(xyz(planeNormalFromBlock(plane(vec(0, 1, 0))))).toEqual([0, 1, 0])
  })

  it('defaults an empty socket to +Y, matching the renderer', () => {
    expect(xyz(planeNormalFromBlock(plane(null)))).toEqual([0, 1, 0])
  })

  it('defaults a zero-length normal to +Y, matching the renderer', () => {
    expect(xyz(planeNormalFromBlock(plane(vec(0, 0, 0))))).toEqual([0, 1, 0])
  })

  it('normalises, so a scaled normal is the same plane', () => {
    expect(xyz(planeNormalFromBlock(plane(vec(0, 5, 0))))).toEqual([0, 1, 0])
  })

  it('sees through a variable wrapper on the normal', () => {
    const wrapped = block('geo_variable', { VALUE: vec(0, 1, 0) })
    expect(xyz(planeNormalFromBlock(plane(wrapped)))).toEqual([0, 1, 0])
  })
})
