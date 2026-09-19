import { describe, it, expect } from 'vitest'
import THREE from '@/utils/three'
import { linesIntersect } from '@/utils/lineIntersection'
import {
  generateStimulusSet,
  makeStudyCamera,
  toNdc,
  targetLabelAnchor,
  separation3d,
  depthOfTargetAt,
  ndcDistanceToLine,
} from './stimuli'
import { PLACEMENT } from './stimulusConfig'

const set = generateStimulusSet('layout-seed')
const camera = makeStudyCamera()
const all = [...set.measured, ...set.practice]
const toVec = (a) => new THREE.Vector3(a[0], a[1], a[2])
const targetsOf = (s) => s.objects.filter((o) => o.role === 'target')
const isLinear = (o) => o.kind === 'line' || o.kind === 'vector'
const labelNdc = (target) => toNdc(camera, targetLabelAnchor(target))

/** A line or vector as the infinite line it lies on. */
const infiniteLine = (o) => ({
  origin: toVec(o.origin),
  direction: (o.kind === 'vector' ? toVec(o.vector) : toVec(o.direction)).normalize(),
})

const ndcDistanceTo = (ndc, object) => {
  if (isLinear(object)) {
    const { origin, direction } = infiniteLine(object)
    return ndcDistanceToLine(camera, ndc, origin, direction)
  }
  const centre = toNdc(camera, toVec(object.position ?? object.centre))
  return Math.hypot(ndc.x - centre.x, ndc.y - centre.y)
}

describe('targets never meet in 3D', () => {
  it('keeps the two targets at least the minimum separation apart', () => {
    for (const s of all) {
      const [a, b] = targetsOf(s)
      expect(separation3d(a, b), s.id).toBeGreaterThanOrEqual(PLACEMENT.minSeparation3d)
    }
  })

  it('never lets a target line or vector touch another one, so halo immunity cannot fire', () => {
    for (const s of all) {
      const linear = s.objects.filter(isLinear)
      for (const target of linear.filter((o) => o.role === 'target')) {
        for (const other of linear.filter((o) => o !== target)) {
          const label = `${s.id}/${target.key}-${other.key}`
          expect(separation3d(target, other), label).toBeGreaterThanOrEqual(
            PLACEMENT.minSeparation3d,
          )
          const a = infiniteLine(target)
          const b = infiniteLine(other)
          expect(linesIntersect(a.origin, a.direction, b.origin, b.direction), label).toBe(false)
        }
      }
    }
  })
})

describe('proximity questions', () => {
  it('keeps the same target nearer right across the band', () => {
    const half = PLACEMENT.probeBandHalfWidthNdc
    for (const s of all.filter((s) => s.question.type === 'proximity')) {
      const [a, b] = targetsOf(s)
      for (const x of [s.probeNdc[0] - half, s.probeNdc[0], s.probeNdc[0] + half]) {
        const probe = { type: 'proximity', x }
        const depths = { [a.key]: depthOfTargetAt(camera, a, probe) }
        depths[b.key] = depthOfTargetAt(camera, b, probe)
        expect(depths.A, `${s.id} at ${x}`).not.toBeNull()
        expect(depths.B, `${s.id} at ${x}`).not.toBeNull()
        expect(depths.A < depths.B ? 'A' : 'B', `${s.id} at ${x}`).toBe(s.nearer)
      }
    }
  })
})

describe('target labels', () => {
  it('anchors each line and vector label on screen, clear of the probe and the other target', () => {
    for (const s of all) {
      const targets = targetsOf(s)
      const probe = { x: s.probeNdc[0], y: s.probeNdc[1] }
      for (const target of targets.filter(isLinear)) {
        const ndc = labelNdc(target)
        const other = targets.find((t) => t !== target)
        const label = `${s.id}/${target.key}`
        expect(Math.abs(ndc.x), label).toBeLessThanOrEqual(PLACEMENT.labelOnScreenNdc.x)
        expect(Math.abs(ndc.y), label).toBeLessThanOrEqual(PLACEMENT.labelOnScreenNdc.y)
        expect(Math.hypot(ndc.x - probe.x, ndc.y - probe.y), label).toBeGreaterThanOrEqual(
          PLACEMENT.labelClearOfCrossingNdc - 1e-3,
        )
        expect(ndcDistanceTo(ndc, other), label).toBeGreaterThanOrEqual(
          PLACEMENT.labelClearOfOtherTargetNdc - 1e-3,
        )
      }
    }
  })

  it('keeps distractor lines and points off the target labels', () => {
    for (const s of all) {
      const anchors = targetsOf(s).map(labelNdc)
      for (const d of s.objects.filter((o) => o.role === 'distractor')) {
        if (d.kind !== 'line' && d.kind !== 'point') continue
        for (const ndc of anchors) {
          expect(ndcDistanceTo(ndc, d), `${s.id}/${d.key}`).toBeGreaterThanOrEqual(
            PLACEMENT.clearOfTargetLabelNdc - 1e-3,
          )
        }
      }
    }
  })
})

describe('targetLabelAnchor', () => {
  const v = (x, y, z) => new THREE.Vector3(x, y, z)

  it('is the midpoint of a line clipped to the 40-unit scene box', () => {
    const line = { kind: 'line', origin: [5, 0, 0], direction: [1, 0, 0] }
    expect(targetLabelAnchor(line).distanceTo(v(0, 0, 0))).toBeLessThan(1e-9)
    // x clips at t = -20..20, y = 10 + t clips at t = -30..10, so t spans -20..10.
    const tilted = { kind: 'line', origin: [0, 10, 0], direction: [1, 1, 0] }
    expect(targetLabelAnchor(tilted).distanceTo(v(-5, 5, 0))).toBeLessThan(1e-9)
  })

  it('is the tip of a vector, where the vector builder hangs its label', () => {
    const vector = { kind: 'vector', origin: [1, 2, 3], vector: [2, 0, -1] }
    expect(targetLabelAnchor(vector).distanceTo(v(3, 2, 2))).toBeLessThan(1e-9)
  })
})
