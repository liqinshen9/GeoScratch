import { describe, expect, it } from 'vitest'
import { COLOR_PRESETS, HIGH_CONTRAST_PALETTE, PALETTE_TONES, VIVID_PALETTE } from './colorPresets'
import { assignHues, minPairwiseDifference, optimizeHues } from '@/utils/categoricalPalette'

const NEUTRAL = { hue: 0, chroma: 0 }
const TONES = [PALETTE_TONES.light, PALETTE_TONES.dark]
const mid = ([min, max]) => (min + max) / 2
const sorted = (hues) => Object.values(hues).sort((a, b) => a - b)

describe.each([
  ['vivid', VIVID_PALETTE],
  ['highContrast', HIGH_CONTRAST_PALETTE],
])('%s palette', (name, palette) => {
  it('uses the optimiser output', () => {
    const hues = optimizeHues({ count: 6, chroma: palette.chroma, tones: TONES, fixed: [NEUTRAL] })
    expect(sorted(palette.hues)).toEqual(hues)
  })

  it('puts every type at one tone, light and dark', () => {
    const preset = COLOR_PRESETS[name]
    for (const [types, tone] of [
      [preset.types, PALETTE_TONES.light],
      [preset.dark.types, PALETTE_TONES.dark],
    ]) {
      for (const family of Object.values(types)) expect(mid(family.toneRange)).toBe(tone)
    }
  })

  it('keeps every pair of types clearly apart', () => {
    const members = [
      ...Object.values(palette.hues).map((hue) => ({ hue, chroma: palette.chroma })),
      NEUTRAL,
    ]
    expect(minPairwiseDifference(members, TONES)).toBeGreaterThan(20)
  })
})

it('assigns High Contrast hues against Vivid so types keep their colour family', () => {
  expect(assignHues(sorted(HIGH_CONTRAST_PALETTE.hues), VIVID_PALETTE.hues)).toEqual(
    HIGH_CONTRAST_PALETTE.hues,
  )
})

it('renders every Monochrome type as one grey at the palette tone', () => {
  const { monochrome } = COLOR_PRESETS
  for (const [types, tone] of [
    [monochrome.types, PALETTE_TONES.light],
    [monochrome.dark.types, PALETTE_TONES.dark],
  ]) {
    for (const family of Object.values(types)) {
      expect(family.chromaRange).toEqual([0, 0])
      expect(mid(family.toneRange)).toBe(tone)
    }
  }
})
