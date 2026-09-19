// @vitest-environment jsdom
//
// Builds a real stimulus through the editor's pipeline, so the generator's
// assumptions about what the builders draw are checked against the builders.
import { describe, it, expect, beforeAll, vi } from 'vitest'

// Same workaround as vectorReveal.test.js: colorSystem's colour library doesn't
// resolve under vitest; builders read window.GeoScratchColors instead.
vi.mock('@/store/colorSystem', () => ({
  forInstance: () => '#3366cc',
  forInstanceVariant: () => '#3366cc',
  forRole: () => '#ff8800',
  subscribeToPreset: () => () => {},
}))

import THREE from '@/utils/three'
import '@/store/useSettingsStore'
import { getLabelVisibilityKeysForObject } from '@/components/Scene3D/labels/labelData'
import { buildStimulusScene } from './buildStimulusScene'
import { generateStimulusSet, getStudyStimulusSet, targetLabelAnchor } from './stimuli'
import { blockIdFor } from './stimulusToXml'

beforeAll(() => {
  window.GeoScratchColors = {
    forInstance: () => '#3366cc',
    forInstanceVariant: () => '#3366cc',
    forRole: () => '#ff8800',
    subscribeToPreset: () => () => {},
  }
  const noop = () => {}
  const fakeCtx = new Proxy(
    { fillStyle: '', canvas: null },
    { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => ((t[k] = v), true) },
  )
  HTMLCanvasElement.prototype.getContext = () => fakeCtx
})

const set = generateStimulusSet('scene-seed')
const stimulus = set.measured.find((s) => s.pairType === 'line-line' && s.clutter === 'high')
const withVector = set.measured.find((s) =>
  s.objects.some((o) => o.role === 'target' && o.kind === 'vector'),
)
const builtFor = (objects, forStimulus, key) =>
  objects.find((o) => o.userData?.srcBlockId === blockIdFor(forStimulus, key))

describe('buildStimulusScene', () => {
  it("anchors each line's label exactly where the generator placed it", () => {
    const { objects } = buildStimulusScene(stimulus)
    const lines = stimulus.objects.filter((o) => o.kind === 'line')
    expect(lines.length).toBeGreaterThanOrEqual(2)
    for (const line of lines) {
      const built = builtFor(objects, stimulus, line.key)
      expect(built, line.key).toBeTruthy()
      expect(built.userData.segmentMid.distanceTo(targetLabelAnchor(line)), line.key).toBeLessThan(
        1e-6,
      )
    }
  })

  it("anchors a vector's label at the tip the generator expects", () => {
    expect(withVector, 'a measured stimulus with a vector target').toBeTruthy()
    const { objects } = buildStimulusScene(withVector)
    for (const vector of withVector.objects.filter((o) => o.kind === 'vector')) {
      const built = builtFor(objects, withVector, vector.key)
      expect(built, vector.key).toBeTruthy()
      const tip = new THREE.Vector3(...built.userData.labelAnchors.tip.position)
      expect(tip.distanceTo(targetLabelAnchor(vector)), vector.key).toBeLessThan(1e-6)
    }
  })

  it('hides every label except the A and B targets', () => {
    const { objects, hiddenLabelKeys } = buildStimulusScene(stimulus)
    for (const object of stimulus.objects) {
      const built = builtFor(objects, stimulus, object.key)
      if (!built) continue
      const keys = getLabelVisibilityKeysForObject(built)
      const hidden = keys.every((key) => hiddenLabelKeys.has(key))
      expect(hidden, object.key).toBe(object.role !== 'target')
    }
  })
})

// T4 and T10 draw an accent where a line passes through a solid, and only a
// geo_vector_line takes one, so a stimulus with no line-through-solid renders
// those conditions exactly like T1.
describe('collision accents', () => {
  it('gives every stimulus in the study set a line passing through a solid', () => {
    const studySet = getStudyStimulusSet()
    for (const s of [...studySet.measured, ...studySet.practice]) {
      const { objects } = buildStimulusScene(s)
      const accented = objects.filter((o) => o.userData?.hasCollisionAccent)
      expect(accented.length, `${s.id} (${s.pairType})`).toBeGreaterThan(0)
    }
  })
})
