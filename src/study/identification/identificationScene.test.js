// @vitest-environment jsdom
//
// Builds every identification scene through the editor's pipeline: each block
// must draw exactly one top-level object, or the click that answers a trial
// could not be mapped back to a block.
import { describe, it, expect, beforeAll, vi } from 'vitest'

// Same workaround as stimulusScene.test.js: the colour library doesn't resolve
// under vitest; builders read window.GeoScratchColors instead.
vi.mock('@/store/colorSystem', () => ({
  forInstance: () => '#3366cc',
  forInstanceVariant: () => '#3366cc',
  forRole: () => '#ff8800',
  subscribeToPreset: () => () => {},
}))

import '@/store/useSettingsStore'
import { buildSceneFromXml } from '@/study/phase1/buildStimulusScene'
import { getIdentificationScenes } from './scenes'
import { identificationToXml, blockIdFor } from './identificationToXml'

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

describe('identification scene build', () => {
  const scenes = getIdentificationScenes()
  it('draws one object per block, keyed by that block', () => {
    for (const scene of [...scenes.measured.flat(), ...scenes.practice.flat()]) {
      const objects = buildSceneFromXml(identificationToXml(scene))
      const ids = objects.map((o) => o.userData?.srcBlockId).sort()
      expect(ids).toEqual(scene.objects.map((o) => blockIdFor(scene, o.key)).sort())
    }
  })
})
