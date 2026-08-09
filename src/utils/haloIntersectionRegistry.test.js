import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { registerHaloLine, resetHaloIntersectionRegistry } from './haloIntersectionRegistry'
import { getHaloId } from './haloIdRegistry'

describe('registerHaloLine / resetHaloIntersectionRegistry', () => {
  beforeEach(() => {
    resetHaloIntersectionRegistry()
  })

  it('grants mutual immunity to two lines that genuinely intersect', () => {
    const addImmuneA = vi.fn()
    const addImmuneB = vi.fn()

    registerHaloLine('line-a', new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0), addImmuneA)
    registerHaloLine('line-b', new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 1, 0), addImmuneB)

    expect(addImmuneA).toHaveBeenCalledTimes(1)
    expect(addImmuneA).toHaveBeenCalledWith(getHaloId('line-b'))
    expect(addImmuneB).toHaveBeenCalledTimes(1)
    expect(addImmuneB).toHaveBeenCalledWith(getHaloId('line-a'))
  })

  it('grants no immunity to lines that are depth-separated (cross only in projection)', () => {
    const addImmuneA = vi.fn()
    const addImmuneB = vi.fn()

    registerHaloLine('line-c', new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0), addImmuneA)
    registerHaloLine('line-d', new THREE.Vector3(0, -1, 5), new THREE.Vector3(0, 1, 0), addImmuneB)

    expect(addImmuneA).not.toHaveBeenCalled()
    expect(addImmuneB).not.toHaveBeenCalled()
  })

  it('only grants immunity against lines it actually touches, not every registered line', () => {
    const addImmuneA = vi.fn()
    const addImmuneB = vi.fn()
    const addImmuneC = vi.fn()

    // line-a and line-b intersect at the origin; line-c is parallel to line-a,
    // offset in both y and z so it also can't cross line-b.
    registerHaloLine('line-a', new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0), addImmuneA)
    registerHaloLine('line-b', new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 1, 0), addImmuneB)
    registerHaloLine('line-c', new THREE.Vector3(-1, 5, 3), new THREE.Vector3(1, 0, 0), addImmuneC)

    expect(addImmuneA).toHaveBeenCalledTimes(1)
    expect(addImmuneC).not.toHaveBeenCalled()
    expect(addImmuneB).toHaveBeenCalledTimes(1)
  })

  it('clears all registered lines so a later run starts immune-free', () => {
    const addImmuneA = vi.fn()
    const addImmuneB = vi.fn()
    registerHaloLine('line-a', new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0), addImmuneA)

    resetHaloIntersectionRegistry()

    registerHaloLine('line-b', new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 1, 0), addImmuneB)
    expect(addImmuneB).not.toHaveBeenCalled()
  })
})
