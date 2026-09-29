import { describe, it, expect } from 'vitest'
import THREE from '@/utils/three'
import { makePipelineStepAnimation } from './pipelineStepAnimation'

const worldPosition = (object) => object.getWorldPosition(new THREE.Vector3())

describe('makePipelineStepAnimation', () => {
  // The pivot exercise's pipeline: to the origin, rotate there, back again.
  function pivot() {
    const object = new THREE.Group()
    const cube = new THREE.Object3D()
    cube.position.set(1, 1, 1)
    const point = new THREE.Object3D()
    point.position.set(0, 2, 2)
    object.add(cube, point)
    const start = {
      startPos: new THREE.Vector3(),
      startQuat: new THREE.Quaternion(),
      startScale: new THREE.Vector3(1, 1, 1),
    }
    const steps = [
      new THREE.Matrix4().makeTranslation(-1, -1, -1),
      new THREE.Matrix4().makeRotationY(Math.PI / 2),
      new THREE.Matrix4().makeTranslation(1, 1, 1),
    ]
    const animate = makePipelineStepAnimation(object, start, steps, ['move', 'rotate', 'return'])
    return { object, cube, point, animate }
  }

  it('plays each step in its own slice, naming the step that is playing', () => {
    const { object, cube, point, animate } = pivot()

    animate(0)
    expect(worldPosition(cube).distanceTo(new THREE.Vector3(1, 1, 1))).toBeCloseTo(0)
    expect(object.userData.animActiveBlockId).toBe('move')

    animate(1 / 3)
    expect(worldPosition(cube).length()).toBeCloseTo(0)
    expect(object.userData.animActiveBlockId).toBe('rotate')

    animate(0.5)
    expect(worldPosition(cube).length()).toBeCloseTo(0)
    expect(worldPosition(point).length()).toBeCloseTo(Math.sqrt(3))

    animate(2 / 3)
    expect(worldPosition(point).distanceTo(new THREE.Vector3(1, 1, 1))).toBeCloseTo(0)
    expect(object.userData.animActiveBlockId).toBe('return')

    animate(1)
    expect(worldPosition(cube).distanceTo(new THREE.Vector3(1, 1, 1))).toBeCloseTo(0)
    expect(worldPosition(point).distanceTo(new THREE.Vector3(2, 2, 2))).toBeCloseTo(0)
    expect(object.userData.animActiveBlockId).toBe(null)
  })

  it('gives each step the time a whole pipeline had', () => {
    expect(pivot().animate.durationScale).toBe(3)
  })

  it('applies the easing to each step on its own', () => {
    const { cube, animate } = pivot()
    // Halfway through the first step, a step ease holds it at its start.
    animate(1 / 6, (t) => (t < 1 ? 0 : 1))
    expect(worldPosition(cube).distanceTo(new THREE.Vector3(1, 1, 1))).toBeCloseTo(0)
  })
})
