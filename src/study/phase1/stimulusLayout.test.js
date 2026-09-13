import { describe, it, expect } from 'vitest'
import THREE from '@/utils/three'
import { linesIntersect } from '@/utils/lineIntersection'
import {
  generateStimulusSet,
  makeStudyCamera,
  toNdc,
  lineLabelAnchor,
  separation3d,
  ndcDistanceToLine,
} from './stimuli'
import { PLACEMENT } from './stimulusConfig'

const set = generateStimulusSet('layout-seed')
const camera = makeStudyCamera()
const all = [...set.measured, ...set.practice]
const toVec = (a) => new THREE.Vector3(a[0], a[1], a[2])
const targetsOf = (s) => s.objects.filter((o) => o.role === 'target')
const labelNdc = (line) => toNdc(camera, lineLabelAnchor(toVec(line.origin), toVec(line.direction)))
const ndcDistanceTo = (ndc, object) =>
  object.kind === 'point'
    ? Math.hypot(
        ...Object.values(toNdc(camera, toVec(object.position))).map(
          (v, i) => v - [ndc.x, ndc.y][i],
        ),
      )
    : ndcDistanceToLine(camera, ndc, toVec(object.origin), toVec(object.direction))

describe('targets never meet in 3D', () => {
  it('keeps the two targets at least the minimum separation apart', () => {
    for (const s of all) {
      const targets = targetsOf(s)
      const line = targets.find((t) => t.kind === 'line')
      const other = targets.find((t) => t !== line)
      expect(separation3d(line, other), s.id).toBeGreaterThanOrEqual(PLACEMENT.minSeparation3d)
    }
  })

  it('never lets a target line touch any other line, so halo immunity cannot fire', () => {
    for (const s of all) {
      const lines = s.objects.filter((o) => o.kind === 'line')
      for (const target of lines.filter((o) => o.role === 'target')) {
        for (const other of lines.filter((o) => o !== target)) {
          const label = `${s.id}/${target.key}-${other.key}`
          expect(separation3d(target, other), label).toBeGreaterThanOrEqual(
            PLACEMENT.minSeparation3d,
          )
          expect(
            linesIntersect(
              toVec(target.origin),
              toVec(target.direction).normalize(),
              toVec(other.origin),
              toVec(other.direction).normalize(),
            ),
            label,
          ).toBe(false)
        }
      }
    }
  })
})

describe('target labels', () => {
  it('anchors each line label on screen, clear of the crossing and the other target', () => {
    for (const s of all) {
      const targets = targetsOf(s)
      const crossing = { x: s.crossingNdc[0], y: s.crossingNdc[1] }
      for (const line of targets.filter((t) => t.kind === 'line')) {
        const ndc = labelNdc(line)
        const other = targets.find((t) => t !== line)
        const label = `${s.id}/${line.key}`
        expect(Math.abs(ndc.x), label).toBeLessThanOrEqual(PLACEMENT.labelOnScreenNdc.x)
        expect(Math.abs(ndc.y), label).toBeLessThanOrEqual(PLACEMENT.labelOnScreenNdc.y)
        expect(Math.hypot(ndc.x - crossing.x, ndc.y - crossing.y), label).toBeGreaterThanOrEqual(
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
      const anchors = targetsOf(s)
        .filter((t) => t.kind === 'line')
        .map(labelNdc)
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

describe('lineLabelAnchor', () => {
  it('is the midpoint of the line clipped to the 40-unit scene box', () => {
    const v = (x, y, z) => new THREE.Vector3(x, y, z)
    expect(lineLabelAnchor(v(5, 0, 0), v(1, 0, 0)).distanceTo(v(0, 0, 0))).toBeLessThan(1e-9)
    // x clips at t = -20..20, y = 10 + t clips at t = -30..10, so t spans -20..10.
    expect(lineLabelAnchor(v(0, 10, 0), v(1, 1, 0)).distanceTo(v(-5, 5, 0))).toBeLessThan(1e-9)
  })
})
