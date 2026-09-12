// @vitest-environment jsdom
// buildVectorShaftGlyph paints a ring texture onto a canvas, so it needs a DOM.
import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
// The builder needs the augmented THREE (fat lines); the pure layout helpers
// above are happy with bare three.
import AppTHREE from '@/utils/three'
import {
  arrowheadMaxAspectScale,
  arrowheadMaxHeadScale,
  buildVectorShaftGlyph,
  computeVectorShaftLayout,
} from './vectorShaftGlyph'

const HEAD_LENGTH = 0.35 // an arbitrary style's cone length, for these tests

describe('computeVectorShaftLayout', () => {
  it('stops the shaft short of the tip by the given arrowhead length', () => {
    const origin = new THREE.Vector3(0, 0, 0)
    const direction = new THREE.Vector3(1, 0, 0)
    const length = 4

    const { shaftLength, shaftMid, shaftEnd } = computeVectorShaftLayout(
      origin,
      direction,
      length,
      HEAD_LENGTH,
    )

    expect(shaftLength).toBeCloseTo(length - HEAD_LENGTH)
    expect(shaftEnd.x).toBeCloseTo(length - HEAD_LENGTH)
    expect(shaftMid.x).toBeCloseTo(shaftLength / 2)
  })

  it('clamps shaft length to a positive floor for vectors shorter than the arrowhead', () => {
    const origin = new THREE.Vector3(1, 2, 3)
    const direction = new THREE.Vector3(0, 0, 1)
    const length = 0.05 // well under HEAD_LENGTH

    const { shaftLength, shaftEnd } = computeVectorShaftLayout(
      origin,
      direction,
      length,
      HEAD_LENGTH,
    )

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

// The cone angle a head of this radius and length opens to, tip to tip.
const coneAngleDeg = (radius, headLength) => Math.atan(radius / headLength) * (360 / Math.PI)

describe('arrowheadMaxAspectScale', () => {
  it('is the scale at which the head opens to 60 degrees', () => {
    const radius = 0.2
    const headLength = 0.35
    const cap = arrowheadMaxAspectScale(radius, headLength)

    expect(coneAngleDeg(radius * cap, headLength)).toBeCloseTo(60)
  })

  it('is 1 for a head authored exactly at the limit', () => {
    const headLength = 0.3
    const radius = headLength * Math.tan(Math.PI / 6)

    expect(arrowheadMaxAspectScale(radius, headLength)).toBeCloseTo(1)
  })

  // Ringed Tube is authored wider than the cap (76 degrees), so its cap is
  // below 1 and ZoomInvariantScaler lengthens its head even at rest.
  it('drops below 1 for a head authored wider than the limit', () => {
    const cap = arrowheadMaxAspectScale(0.22, 0.28)

    expect(cap).toBeLessThan(1)
    expect(coneAngleDeg(0.22, 0.28 * Math.max(1, 1 / cap))).toBeCloseTo(60)
  })

  // What ZoomInvariantScaler does with it: lengthScale = max(1, scale / cap).
  it('holds the angle at 60 degrees once the cap is passed', () => {
    const radius = 0.2
    const headLength = 0.35
    const cap = arrowheadMaxAspectScale(radius, headLength)
    const crossScale = 3.4

    const lengthScale = Math.max(1, crossScale / cap)

    expect(coneAngleDeg(radius * crossScale, headLength * lengthScale)).toBeCloseTo(60)
  })

  it('leaves the head untouched below the cap', () => {
    const cap = arrowheadMaxAspectScale(0.2, 0.35)

    expect(Math.max(1, 1 / cap)).toBe(1)
  })
})

describe('arrowheadMaxHeadScale', () => {
  const TUBE_HEAD_RADIUS = 0.2

  it('lets the head reach a fixed fraction of the vector, no more', () => {
    // A long vector can afford a big head, so the cap sits above the zoom
    // ceiling and never binds.
    expect(arrowheadMaxHeadScale(TUBE_HEAD_RADIUS, 20)).toBeGreaterThan(3.4)
    // A short one cannot.
    expect(arrowheadMaxHeadScale(TUBE_HEAD_RADIUS, 2)).toBeLessThan(3.4)
  })

  it('never shrinks a head below its authored size', () => {
    // A vector shorter than its own head keeps the head it has.
    expect(arrowheadMaxHeadScale(TUBE_HEAD_RADIUS, 0.1)).toBe(1)
    expect(arrowheadMaxHeadScale(TUBE_HEAD_RADIUS, 0)).toBe(1)
  })

  it('grows in proportion to the vector length', () => {
    const short = arrowheadMaxHeadScale(TUBE_HEAD_RADIUS, 4)
    const long = arrowheadMaxHeadScale(TUBE_HEAD_RADIUS, 8)
    expect(long).toBeCloseTo(short * 2)
  })

  // What ZoomInvariantScaler does with both caps together. The fraction bounds
  // the head's RADIUS; the cone-angle rule then sets its length, and neither
  // ever shrinks a head below its authored size.
  const headAt = (radius, headLength, vectorLength, zoomScale) => {
    const headScale = Math.min(zoomScale, arrowheadMaxHeadScale(radius, vectorLength))
    const lengthScale = Math.max(1, headScale / arrowheadMaxAspectScale(radius, headLength))
    return { worldRadius: radius * headScale, worldLength: headLength * lengthScale }
  }

  it('caps a short vector at its share of the length', () => {
    const { worldRadius, worldLength } = headAt(0.2, 0.35, 2, 3.4)

    expect(worldRadius).toBeCloseTo(0.3) // 0.15 * 2, not 0.2 * 3.4 = 0.68
    expect(coneAngleDeg(worldRadius, worldLength)).toBeCloseTo(60)
  })

  it('lets a long vector use the full zoom scale', () => {
    const { worldRadius, worldLength } = headAt(0.2, 0.35, 20, 3.4)

    expect(worldRadius).toBeCloseTo(0.68) // fraction cap (3.0) never binds
    expect(coneAngleDeg(worldRadius, worldLength)).toBeCloseTo(60)
  })
})

describe('setVectorSegment', () => {
  // jsdom has no 2d context without the native canvas package, and the glyph
  // paints a ring texture on one. Only fillStyle/fillRect are touched.
  beforeAll(() => {
    window.HTMLCanvasElement.prototype.getContext = () => ({
      fillStyle: '',
      fillRect: () => {},
    })
  })

  const build = () =>
    buildVectorShaftGlyph(
      AppTHREE,
      'test-block',
      new AppTHREE.Vector3(0, 0, 0),
      new AppTHREE.Vector3(1, 0, 0),
      2,
      '#123456',
    )

  it('re-anchors, re-aims and rescales in one call', () => {
    const glyph = build()
    glyph.userData.setVectorSegment(new AppTHREE.Vector3(1, 2, 3), new AppTHREE.Vector3(0, 5, 0), 4)

    expect(glyph.userData.vectorOrigin.toArray()).toEqual([1, 2, 3])
    // Stored normalised, whatever magnitude was handed in.
    expect(glyph.userData.vectorDirection.toArray()).toEqual([0, 1, 0])
    expect(glyph.userData.vectorLength).toBe(4)
  })

  it('keeps whichever parts are omitted', () => {
    const glyph = build()
    glyph.userData.setVectorSegment(null, null, 7)
    expect(glyph.userData.vectorOrigin.toArray()).toEqual([0, 0, 0])
    expect(glyph.userData.vectorDirection.toArray()).toEqual([1, 0, 0])
    expect(glyph.userData.vectorLength).toBe(7)
  })

  it('ignores a degenerate direction rather than producing NaN geometry', () => {
    const glyph = build()
    glyph.userData.setVectorSegment(null, new AppTHREE.Vector3(0, 0, 0), 3)
    expect(glyph.userData.vectorDirection.toArray()).toEqual([1, 0, 0])
  })

  // setVectorLength is what staged reveals drive; it must survive the refactor
  // that split the rebuild out from it.
  it('leaves setVectorLength working on the re-aimed axis', () => {
    const glyph = build()
    glyph.userData.setVectorSegment(new AppTHREE.Vector3(0, 1, 0), new AppTHREE.Vector3(0, 0, 1), 5)
    glyph.userData.setVectorLength(1)
    expect(glyph.userData.vectorLength).toBe(1)
    expect(glyph.userData.vectorOrigin.toArray()).toEqual([0, 1, 0])
    expect(glyph.userData.vectorDirection.toArray()).toEqual([0, 0, 1])
  })
})
