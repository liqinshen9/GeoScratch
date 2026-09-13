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
import { generateStimulusSet, lineLabelAnchor } from './stimuli'
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
const builtFor = (objects, key) =>
  objects.find((o) => o.userData?.srcBlockId === blockIdFor(stimulus, key))

describe('buildStimulusScene', () => {
  it("anchors each line's label exactly where the generator placed it", () => {
    const { objects } = buildStimulusScene(stimulus)
    const lines = stimulus.objects.filter((o) => o.kind === 'line')
    expect(lines.length).toBeGreaterThanOrEqual(2)
    for (const line of lines) {
      const built = builtFor(objects, line.key)
      expect(built, line.key).toBeTruthy()
      const expected = lineLabelAnchor(
        new THREE.Vector3(...line.origin),
        new THREE.Vector3(...line.direction),
      )
      expect(built.userData.segmentMid.distanceTo(expected), line.key).toBeLessThan(1e-6)
    }
  })

  it('hides every label except the A and B targets', () => {
    const { objects, hiddenLabelKeys } = buildStimulusScene(stimulus)
    for (const object of stimulus.objects) {
      const built = builtFor(objects, object.key)
      if (!built) continue
      const keys = getLabelVisibilityKeysForObject(built)
      const hidden = keys.every((key) => hiddenLabelKeys.has(key))
      expect(hidden, object.key).toBe(object.role !== 'target')
    }
  })
})
