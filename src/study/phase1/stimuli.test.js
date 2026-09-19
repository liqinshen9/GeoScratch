import { describe, it, expect } from 'vitest'
import THREE from '@/utils/three'
import { generateStimulusSet, makeStudyCamera, targetDepths, toNdc, anchorPoint } from './stimuli'
import {
  DEPTH_SEPARATIONS,
  CLUTTER_DISTRACTORS,
  CLUTTER_LEVELS,
  MEASURED_DIFFICULTY_COUNTS,
  OCCLUSION_PAIR_TYPES,
  PAIR_KINDS,
  PAIR_TYPES,
  PLACEMENT,
  PROBE_BANDS,
  QUESTION_TYPES,
  STUDY_STIMULUS_SEED,
} from './stimulusConfig'

const set = generateStimulusSet('test-seed')
const camera = makeStudyCamera()
const all = [...set.measured, ...set.practice]
const ndcDist = (p, [x, y]) => {
  const n = toNdc(camera, p)
  return Math.hypot(n.x - x, n.y - y)
}
// Mirrors the generator's own solid-vs-solid clearance: centres apart on screen
// by more than the two projected radii.
const boundingRadius = (o) => (o.kind === 'cube' ? (o.size * Math.sqrt(3)) / 2 : o.radius)
const projectedRadius = (o) => {
  const centre = anchorPoint(o)
  const depth = -centre.clone().applyMatrix4(camera.matrixWorldInverse).z
  return boundingRadius(o) / (depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
}
const screenGapBetween = (a, b) => {
  const pa = toNdc(camera, anchorPoint(a))
  const pb = toNdc(camera, anchorPoint(b))
  return Math.hypot(pa.x - pb.x, pa.y - pb.y) - projectedRadius(a) - projectedRadius(b)
}

const countBy = (stimuli, key) =>
  stimuli.reduce((counts, s) => ({ ...counts, [key(s)]: (counts[key(s)] || 0) + 1 }), {})

describe('generateStimulusSet', () => {
  it('is deterministic in its seed', () => {
    expect(generateStimulusSet('test-seed')).toEqual(set)
    expect(generateStimulusSet('other-seed')).not.toEqual(set)
  })

  it('generates the study set', () => {
    expect(() => generateStimulusSet(STUDY_STIMULUS_SEED)).not.toThrow()
  })

  it('has 12 measured stimuli per clutter level with the configured difficulty split', () => {
    expect(set.measured).toHaveLength(24)
    expect(set.practice).toHaveLength(4)
    for (const clutter of CLUTTER_LEVELS) {
      const group = set.measured.filter((s) => s.clutter === clutter)
      expect(group).toHaveLength(12)
      for (const [level, count] of Object.entries(MEASURED_DIFFICULTY_COUNTS[clutter])) {
        expect(group.filter((s) => s.difficulty === level)).toHaveLength(count)
      }
    }
  })

  it('balances nearer target and question type within each clutter level', () => {
    for (const clutter of CLUTTER_LEVELS) {
      const group = set.measured.filter((s) => s.clutter === clutter)
      expect(group.filter((s) => s.nearer === 'A')).toHaveLength(6)
      for (const type of QUESTION_TYPES) {
        expect(
          group.filter((s) => s.question.type === type),
          type,
        ).toHaveLength(6)
      }
    }
  })

  it('deals every pair type equally often within its question type', () => {
    const byType = (type) => set.measured.filter((s) => s.question.type === type)
    expect(countBy(byType('occlusion'), (s) => s.pairType)).toEqual(
      Object.fromEntries(OCCLUSION_PAIR_TYPES.map((p) => [p, 3])),
    )
    expect(countBy(byType('proximity'), (s) => s.pairType)).toEqual(
      Object.fromEntries(PAIR_TYPES.map((p) => [p, 2])),
    )
  })

  it('spreads proximity questions over the three bands', () => {
    const bands = countBy(
      set.measured.filter((s) => s.question.type === 'proximity'),
      (s) => s.question.band,
    )
    expect(bands).toEqual(Object.fromEntries(PROBE_BANDS.map((b) => [b.id, 4])))
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
      expect(targets.map((t) => t.kind).sort(), s.id).toEqual([...PAIR_KINDS[s.pairType]].sort())
    }
  })

  it('never asks which solid is in front: an occlusion question needs a crossing', () => {
    for (const s of all.filter((s) => s.question.type === 'occlusion')) {
      expect(OCCLUSION_PAIR_TYPES, s.id).toContain(s.pairType)
      expect(
        s.objects.filter((o) => o.role === 'target').map((t) => t.kind),
        s.id,
      ).not.toContain('sphere')
    }
  })

  it('puts a proximity question in one of the bands, and its targets in that column', () => {
    for (const s of all.filter((s) => s.question.type === 'proximity')) {
      const band = PROBE_BANDS.find((b) => b.id === s.question.band)
      expect(band, s.id).toBeTruthy()
      expect(Math.abs(s.probeNdc[0] - band.x), s.id).toBeLessThanOrEqual(
        PLACEMENT.probeBandXJitterNdc + 1e-6,
      )
      for (const key of ['A', 'B']) {
        expect(s.anchorsNdc[key][0], `${s.id}/${key}`).toBeCloseTo(s.probeNdc[0], 2)
      }
      const [yA, yB] = [s.anchorsNdc.A[1], s.anchorsNdc.B[1]]
      expect(Math.abs(yA - yB), s.id).toBeGreaterThanOrEqual(PLACEMENT.proximityGapNdc.min - 1e-6)
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

  it('keeps distractors in the neighbourhood of the targets but off every judged point', () => {
    const reach = Math.max(PLACEMENT.distractorRadiusNdc, PLACEMENT.solidOnTargetMaxNdc) + 0.02
    for (const s of all) {
      const judged = [s.probeNdc, s.anchorsNdc.A, s.anchorsNdc.B]
      for (const d of s.objects.filter((o) => o.role === 'distractor')) {
        const distances = judged.map((ndc) => ndcDist(anchorPoint(d), ndc))
        expect(Math.min(...distances), `${s.id}/${d.key}`).toBeLessThanOrEqual(reach)
        if (d.kind === 'point') {
          expect(Math.min(...distances), `${s.id}/${d.key}`).toBeGreaterThanOrEqual(
            PLACEMENT.clearOfCrossingNdc - 0.01,
          )
        }
      }
    }
  })

  it('never lets two solids overlap on screen', () => {
    for (const s of all) {
      const solids = s.objects.filter((o) => o.kind === 'cube' || o.kind === 'sphere')
      for (let i = 0; i < solids.length; i++) {
        for (let j = i + 1; j < solids.length; j++) {
          const gap = screenGapBetween(solids[i], solids[j])
          expect(gap, `${s.id}/${solids[i].key}-${solids[j].key}`).toBeGreaterThanOrEqual(
            PLACEMENT.solidClearOfSolidNdc - 1e-6,
          )
        }
      }
    }
  })

  it('stays inside the scene box', () => {
    for (const s of all) {
      for (const o of s.objects) {
        const points = [anchorPoint(o)]
        if (o.kind === 'vector') points.push(anchorPoint(o).add(new THREE.Vector3(...o.vector)))
        for (const p of points) {
          for (const c of [p.x, p.y, p.z]) {
            expect(Math.abs(c), `${s.id}/${o.key}`).toBeLessThanOrEqual(
              PLACEMENT.maxCoordinate + 0.01,
            )
          }
        }
      }
    }
  })
})
