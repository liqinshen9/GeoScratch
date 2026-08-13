import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { computeVectorShaftLayout } from './vectorShaftGlyph'

const HEAD_LENGTH = 0.35 // an arbitrary style's cone length, for these tests

describe('computeVectorShaftLayout', () => {
  it('stops the shaft short of the tip by the given arrowhead length', () => {
    const origin = new THREE.Vector3(0, 0, 0)
    const direction = new THREE.Vector3(1, 0, 0)
    const length = 4

    const { shaftLength, shaftMid, shaftEnd } = computeVectorShaftLayout(origin, direction, length, HEAD_LENGTH)

    expect(shaftLength).toBeCloseTo(length - HEAD_LENGTH)
    expect(shaftEnd.x).toBeCloseTo(length - HEAD_LENGTH)
    expect(shaftMid.x).toBeCloseTo(shaftLength / 2)
  })

  it('clamps shaft length to a positive floor for vectors shorter than the arrowhead', () => {
    const origin = new THREE.Vector3(1, 2, 3)
    const direction = new THREE.Vector3(0, 0, 1)
    const length = 0.05 // well under HEAD_LENGTH

    const { shaftLength, shaftEnd } = computeVectorShaftLayout(origin, direction, length, HEAD_LENGTH)

    expect(shaftLength).toBeGreaterThan(0)
    expect(shaftLength).toBeLessThan(HEAD_LENGTH)
    expect(shaftEnd.distanceTo(origin)).toBeCloseTo(shaftLength)
  })

  it('respects an arbitrary origin and direction', () => {
    const origin = new THREE.Vector3(2, 0, 0)
    const direction = new THREE.Vector3(0, 1, 0)
    const length = 1

    const { shaftEnd } = computeVectorShaftLayout(origin, direction, length, HEAD_LENGTH)

    expect(shaftEnd.x).toBeCloseTo(2)
    expect(shaftEnd.y).toBeCloseTo(length - HEAD_LENGTH)
    expect(shaftEnd.z).toBeCloseTo(0)
  })

  it('places the shaft end exactly headLength short of the true tip (origin + direction*length)', () => {
    const origin = new THREE.Vector3(-6, 1, 1)
    const direction = new THREE.Vector3(1, 0, 0)
    const length = 11
    const headLength = 0.2

    const { shaftEnd } = computeVectorShaftLayout(origin, direction, length, headLength)
    const trueTip = origin.clone().addScaledVector(direction, length)

    expect(shaftEnd.distanceTo(trueTip)).toBeCloseTo(headLength)
  })
})
