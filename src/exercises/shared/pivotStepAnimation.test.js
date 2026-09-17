import { describe, it, expect, vi } from 'vitest'
import THREE from '@/utils/three'
import { installPivotStepAnimation } from './pivotStepAnimation'

describe('pivot step animation', () => {
  it('moves to the origin, rotates there, then returns, highlighting the active step', () => {
    const object = new THREE.Group()
    object.userData.srcBlockId = 'special'
    const cube = new THREE.Object3D()
    cube.position.set(1, 1, 1)
    const point = new THREE.Object3D()
    point.position.set(0, 2, 2)
    object.add(cube, point)
    object.userData.transformAnim = {
      startPos: new THREE.Vector3(), startQuat: new THREE.Quaternion(), startScale: new THREE.Vector3(1, 1, 1),
    }
    const step = (id, type, fields) => ({ id, type, getFieldValue: (name) => fields[name] })
    const steps = [
      step('move', 'trans_matrix', { TX: -1, TY: -1, TZ: -1 }),
      step('rotate', 'rot_matrix', { AXIS: 'Y', DEGREES: 90 }),
      step('return', 'trans_matrix', { TX: 1, TY: 1, TZ: 1 }),
    ]
    const workspace = { highlightBlock: vi.fn() }
    const normalAnimation = vi.fn()
    object.userData.animate = normalAnimation
    installPivotStepAnimation(object, steps, workspace)
    expect(object.userData.animate).toBe(normalAnimation)
    object.userData.animateSteps(0)
    expect(workspace.highlightBlock).toHaveBeenLastCalledWith('special')
    object.userData.animateSteps(0.2)
    expect(cube.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(1, 1, 1))).toBeCloseTo(0)
    expect(point.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(0, 2, 2))).toBeCloseTo(0)
    expect(workspace.highlightBlock).toHaveBeenLastCalledWith('special')
    object.userData.animateSteps(0.25)
    expect(workspace.highlightBlock).toHaveBeenLastCalledWith('move')
    object.userData.animateSteps(0.5)
    expect(cube.getWorldPosition(new THREE.Vector3()).length()).toBeCloseTo(0)
    expect(workspace.highlightBlock).toHaveBeenLastCalledWith('rotate')
    object.userData.animateSteps(0.75)
    expect(cube.getWorldPosition(new THREE.Vector3()).length()).toBeCloseTo(0)
    expect(point.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(1, 1, 1))).toBeCloseTo(0)
    expect(workspace.highlightBlock).toHaveBeenLastCalledWith('return')
    object.userData.animateSteps(1)
    expect(cube.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(1, 1, 1))).toBeCloseTo(0)
    expect(point.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(2, 2, 2))).toBeCloseTo(0)
    expect(workspace.highlightBlock).toHaveBeenLastCalledWith(null)
  })
})
