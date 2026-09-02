import { describe, expect, it } from 'vitest'
import {
  getScalarInputValue,
  matrix4FromTransformStepBlock,
  scalarValueFromBlock,
} from './sceneHelpers'

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

  it('builds transform matrices from scalar input blocks', () => {
    const scale = blockWithInputs('scale_matrix', {
      SX_INPUT: scalarBlock(2),
      SY_INPUT: scalarBlock(3),
      SZ_INPUT: scalarBlock(4),
    })
    const matrix = matrix4FromTransformStepBlock(scale)

    expect(matrix.elements[0]).toBe(2)
    expect(matrix.elements[5]).toBe(3)
    expect(matrix.elements[10]).toBe(4)
  })
})
