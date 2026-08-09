import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { linesIntersect } from './lineIntersection'

describe('linesIntersect', () => {
  it('detects two lines that genuinely cross at a point', () => {
    const p1 = new THREE.Vector3(-1, 0, 0)
    const d1 = new THREE.Vector3(1, 0, 0)
    const p2 = new THREE.Vector3(0, -1, 0)
    const d2 = new THREE.Vector3(0, 1, 0)
    expect(linesIntersect(p1, d1, p2, d2)).toBe(true)
  })

  it('rejects lines that cross only in screen-space projection but are separated in depth', () => {
    const p1 = new THREE.Vector3(-1, 0, 0)
    const d1 = new THREE.Vector3(1, 0, 0)
    const p2 = new THREE.Vector3(0, -1, 5)
    const d2 = new THREE.Vector3(0, 1, 0)
    expect(linesIntersect(p1, d1, p2, d2)).toBe(false)
  })

  it('rejects parallel lines (no unique closest point)', () => {
    const p1 = new THREE.Vector3(0, 0, 0)
    const d1 = new THREE.Vector3(1, 0, 0)
    const p2 = new THREE.Vector3(0, 1, 0)
    const d2 = new THREE.Vector3(1, 0, 0)
    expect(linesIntersect(p1, d1, p2, d2)).toBe(false)
  })

  it('accepts two lines sharing a point exactly', () => {
    const shared = new THREE.Vector3(2, 3, -1)
    const p1 = shared.clone().addScaledVector(new THREE.Vector3(1, 0, 0), -4)
    const d1 = new THREE.Vector3(1, 0, 0)
    const p2 = shared.clone().addScaledVector(new THREE.Vector3(0, 0, 1), 3)
    const d2 = new THREE.Vector3(0, 0, 1)
    expect(linesIntersect(p1, d1, p2, d2)).toBe(true)
  })
})
