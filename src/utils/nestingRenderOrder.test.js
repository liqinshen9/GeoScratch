import { describe, it, expect } from 'vitest'
import THREE from './three'
import { boxMostlyContains, computeNestingRenderOrders } from './nestingRenderOrder'

const box = (min, max) => new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max))

/** A minimal Object3D-shaped stand-in whose world bounds are a known box. */
function meshOfSize(size, position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size))
  mesh.position.set(...position)
  return mesh
}

describe('boxMostlyContains', () => {
  const outer = box([-5, -5, -5], [5, 5, 5])

  it('contains a fully enclosed smaller box', () => {
    expect(boxMostlyContains(outer, box([-1, -1, -1], [1, 1, 1]))).toBe(true)
  })

  it('tolerates a spout poking out of the container', () => {
    // A teapot's bounding box is genuinely wider than the cube it sits in; a
    // strict containsBox would call this "not nested" and reintroduce the
    // flicker this module exists to prevent.
    expect(boxMostlyContains(outer, box([-5.4, -4, -4], [5.4, 4, 4]))).toBe(true)
  })

  it('rejects a box that only barely overlaps', () => {
    expect(boxMostlyContains(outer, box([4, 4, 4], [9, 9, 9]))).toBe(false)
  })

  it('rejects a disjoint box', () => {
    expect(boxMostlyContains(outer, box([20, 20, 20], [25, 25, 25]))).toBe(false)
  })

  it('rejects an inner box that is not actually smaller', () => {
    // Guards against two equal boxes each "containing" the other, which would
    // make the ordering non-deterministic.
    expect(boxMostlyContains(outer, box([-5, -5, -5], [5, 5, 5]))).toBe(false)
    expect(boxMostlyContains(outer, box([-9, -9, -9], [9, 9, 9]))).toBe(false)
  })

  it('rejects a degenerate zero-volume box', () => {
    expect(boxMostlyContains(outer, box([0, 0, 0], [0, 0, 0]))).toBe(false)
  })
})

// computeNestingRenderOrders negates a count, so "no containers" comes back as
// -0. That is identical to 0 for three.js's renderOrder, but toEqual
// distinguishes the two, so normalise the sign before asserting.
const orders = (objects) => computeNestingRenderOrders(objects).map((n) => n + 0)

describe('computeNestingRenderOrders', () => {
  it('gives a nested object an earlier render order than its container', () => {
    const cube = meshOfSize(10)
    const teapot = meshOfSize(2)

    // Lower renders first (further back), so the container blends over it.
    expect(orders([cube, teapot])).toEqual([0, -1])
  })

  it('is independent of the order objects are passed in', () => {
    const cube = meshOfSize(10)
    const teapot = meshOfSize(2)

    expect(orders([teapot, cube])).toEqual([-1, 0])
  })

  it('gives every disjoint object the same order', () => {
    const a = meshOfSize(2, [-20, 0, 0])
    const b = meshOfSize(2, [20, 0, 0])

    expect(orders([a, b])).toEqual([0, 0])
  })

  it('stacks orders for an object nested two deep', () => {
    const outer = meshOfSize(20)
    const middle = meshOfSize(10)
    const inner = meshOfSize(2)

    expect(orders([outer, middle, inner])).toEqual([0, -1, -2])
  })

  it('tolerates null and non-Object3D entries', () => {
    // The objects array comes straight from the generated-code store, which can
    // hold a hole if a block failed to build.
    expect(orders([null, meshOfSize(2), undefined])).toEqual([0, 0, 0])
  })

  it('returns an order per input object', () => {
    const objects = [meshOfSize(10), meshOfSize(2), meshOfSize(1)]
    expect(computeNestingRenderOrders(objects)).toHaveLength(objects.length)
  })
})
