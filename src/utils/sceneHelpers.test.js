import { describe, expect, it } from 'vitest'
import { getScalarInputValue, scalarValueFromBlock } from './sceneHelpers'

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
