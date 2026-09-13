import { afterEach, describe, expect, it } from 'vitest'
import THREE from '@/utils/three'
import { getScalarInputValue, scalarValueFromBlock, vector3FromBlock } from './sceneHelpers'

function scalarBlock(value) {
  return {
    type: 'scalar',
    getFieldValue: () => String(value),
  }
}

function scalarArithmeticBlock(op, a, b) {
  return {
    type: 'scalar_arithmetic',
    getFieldValue: () => op,
    getInputTargetBlock: (name) => (name === 'A' ? a : b),
  }
}

function blockWithInputs(type, inputs, fields = {}) {
  return {
    type,
    getFieldValue: (name) => fields[name],
    getInputTargetBlock: (name) => inputs[name] ?? null,
  }
}

describe('scalar block helpers', () => {
  it('reads scalar values and scalar arithmetic from connected inputs', () => {
    const block = blockWithInputs('geo_sphere', {
      RADIUS_INPUT: scalarArithmeticBlock('multiply', scalarBlock(2), scalarBlock(3)),
    })

    expect(scalarValueFromBlock(scalarBlock(4))).toBe(4)
    expect(getScalarInputValue(block, 'RADIUS_INPUT', null, 1)).toBe(6)
  })
})

describe('vector3FromBlock', () => {
  afterEach(() => {
    delete globalThis.window
  })

  const pointOnObject = (id) => ({ type: 'geo_show_point_on_object', id })

  // Its fields say nothing about where the point is -- it is picked at run
  // time -- which left the subtraction drawer showing dashes for Q.
  it('reads a point on an object from the run that placed it', () => {
    globalThis.window = {
      threeObjStore: { q4: { userData: { point: new THREE.Vector3(1, -2, 3) } } },
    }
    expect(vector3FromBlock(pointOnObject('q4')).toArray()).toEqual([1, -2, 3])
  })

  it('has nothing to show before the scene has run', () => {
    globalThis.window = { threeObjStore: {} }
    expect(vector3FromBlock(pointOnObject('q4'))).toBe(null)
  })

  it('subtracts that point in a vector arithmetic block', () => {
    globalThis.window = {
      threeObjStore: { q4: { userData: { point: new THREE.Vector3(1, -2, 3) } } },
    }
    const p = blockWithInputs('linalg_point', {}, { X: '-9', Y: '8', Z: '7' })
    const minus = blockWithInputs(
      'vector_arithmetic',
      { U: p, V: pointOnObject('q4') },
      { OP: 'subtract' },
    )
    expect(vector3FromBlock(minus).toArray()).toEqual([-10, 10, 4])
  })
})
