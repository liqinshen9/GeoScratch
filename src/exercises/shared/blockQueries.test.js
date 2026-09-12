import { describe, it, expect } from 'vitest'
import { getInputBlock } from './blockQueries'

// Minimal stand-in for a Blockly block: only the socket lookup the queries use.
function block(type, inputs = {}) {
  return { type, getInputTargetBlock: (name) => inputs[name] ?? null }
}

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
