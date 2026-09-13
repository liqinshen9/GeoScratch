import { describe, it, expect } from 'vitest'
import THREE from '@/utils/three'
import { generateStimulusSet, makeStudyCamera, targetDepths, toNdc } from './stimuli'
import {
  DEPTH_SEPARATIONS,
  CLUTTER_DISTRACTORS,
  CLUTTER_LEVELS,
  MEASURED_DIFFICULTY_COUNTS,
  PLACEMENT,
  STUDY_STIMULUS_SEED,
} from './stimulusConfig'

const set = generateStimulusSet('test-seed')
const camera = makeStudyCamera()
const all = [...set.measured, ...set.practice]
const toVec = (a) => new THREE.Vector3(a[0], a[1], a[2])
const anchorOf = (o) => toVec(o.position ?? o.centre ?? o.origin)
const ndcDist = (p, [x, y]) => {
  const n = toNdc(camera, p)
  return Math.hypot(n.x - x, n.y - y)
}

describe('generateStimulusSet', () => {
  it('is deterministic in its seed', () => {
    expect(generateStimulusSet('test-seed')).toEqual(set)
    expect(generateStimulusSet('other-seed')).not.toEqual(set)
  })

  it('generates the study set', () => {
    expect(() => generateStimulusSet(STUDY_STIMULUS_SEED)).not.toThrow()
  })

  it('has 8 measured stimuli per clutter level with the configured difficulty split', () => {
    expect(set.measured).toHaveLength(16)
    expect(set.practice).toHaveLength(4)
    for (const clutter of CLUTTER_LEVELS) {
      const group = set.measured.filter((s) => s.clutter === clutter)
      expect(group).toHaveLength(8)
      for (const [level, count] of Object.entries(MEASURED_DIFFICULTY_COUNTS[clutter])) {
        expect(group.filter((s) => s.difficulty === level)).toHaveLength(count)
      }
    }
  })

  it('balances nearer target and pair type within each clutter level', () => {
    for (const clutter of CLUTTER_LEVELS) {
      const group = set.measured.filter((s) => s.clutter === clutter)
      expect(group.filter((s) => s.nearer === 'A')).toHaveLength(4)
      expect(group.filter((s) => s.pairType === 'line-line')).toHaveLength(4)
    }
  })

  it('has unique ids and seeds', () => {
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length)
    expect(new Set(all.map((s) => s.seed)).size).toBe(all.length)
  })
})

describe('each stimulus', () => {
  it('separates the targets by its difficulty level, with ground truth matching the geometry', () => {
    for (const s of all) {
      const depths = targetDepths(camera, s)
      expect(Math.abs(depths.A - depths.B), s.id).toBeCloseTo(DEPTH_SEPARATIONS[s.difficulty], 1)
      expect(depths.A < depths.B ? 'A' : 'B', s.id).toBe(s.nearer)
    }
  })

  it('has targets A and B of the kinds its pair type says', () => {
    for (const s of all) {
      const targets = s.objects.filter((o) => o.role === 'target')
      expect(targets.map((t) => t.key).sort()).toEqual(['A', 'B'])
      const kinds = targets.map((t) => t.kind).sort()
      expect(kinds).toEqual(s.pairType === 'line-line' ? ['line', 'line'] : ['line', 'point'])
    }
  })

  it('has the clutter level number of distractors, including a solid for accents and camera shadows', () => {
    for (const s of all) {
      const distractors = s.objects.filter((o) => o.role === 'distractor')
      expect(distractors, s.id).toHaveLength(CLUTTER_DISTRACTORS[s.clutter])
      expect(
        distractors.some((d) => d.kind === 'cube' || d.kind === 'sphere'),
        s.id,
      ).toBe(true)
    }
  })

  it('keeps distractors in the neighbourhood of the targets but off the crossing itself', () => {
    const reach = Math.max(PLACEMENT.distractorRadiusNdc, PLACEMENT.solidOnTargetMaxNdc) + 0.02
    for (const s of all) {
      for (const d of s.objects.filter((o) => o.role === 'distractor')) {
        const distance = ndcDist(anchorOf(d), s.crossingNdc)
        expect(distance, `${s.id}/${d.key}`).toBeLessThanOrEqual(reach)
        if (d.kind === 'point') {
          expect(distance, `${s.id}/${d.key}`).toBeGreaterThanOrEqual(
            PLACEMENT.clearOfCrossingNdc - 0.01,
          )
        }
      }
    }
  })

  it('stays inside the scene box', () => {
    for (const s of all) {
      for (const o of s.objects) {
        const a = anchorOf(o)
        for (const c of [a.x, a.y, a.z]) {
          expect(Math.abs(c), `${s.id}/${o.key}`).toBeLessThanOrEqual(
            PLACEMENT.maxCoordinate + 0.01,
          )
        }
      }
    }
  })
})
