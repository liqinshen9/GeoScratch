import { describe, it, expect } from 'vitest'
import { SETTING_KEYS, DEFAULT_SETTINGS } from '@/store/useSettingsStore'
import { COLOR_PRESETS } from '@/store/colorPresets'
import { TECHNIQUES, TECHNIQUE_IDS, getTechnique } from './conditions'

const diffKeys = (a, b) => SETTING_KEYS.filter((key) => a[key] !== b[key]).sort()

// The keys each condition changes relative to its base, per the Method table.
const EXPECTED_DIFFS = {
  T2: ['lineStyle', 'vectorStyle'],
  T3: ['lineStyle', 'vectorStyle'],
  T4: ['lineCollisionStyle'],
  T5: ['haloEnabled', 'haloLineVectorEnabled'],
  T6: ['objectsReceiveShadows', 'pointShadowsEnabled', 'primitivesCastShadows'],
  T7: ['cameraShadowsEnabled'],
  T8: ['colorPreset'],
  T9: ['colorPreset'],
  T10: [
    'cameraShadowsEnabled',
    'haloEnabled',
    'haloLineVectorEnabled',
    'lineCollisionStyle',
    'objectsReceiveShadows',
    'pointShadowsEnabled',
    'primitivesCastShadows',
  ],
}

describe('Phase 1 conditions', () => {
  it('has T1..T10 in order', () => {
    expect(TECHNIQUE_IDS).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10'])
  })

  it('pins every setting key in every condition', () => {
    for (const technique of TECHNIQUES) {
      expect(Object.keys(technique.settings).sort()).toEqual([...SETTING_KEYS].sort())
    }
  })

  it('differs from its base only in the cue under test', () => {
    for (const [id, keys] of Object.entries(EXPECTED_DIFFS)) {
      const technique = getTechnique(id)
      const base = getTechnique(technique.base)
      expect(diffKeys(technique.settings, base.settings), id).toEqual([...keys].sort())
    }
  })

  it('keeps non-cue settings at the app defaults so the scene looks like the 3D view', () => {
    const t1 = getTechnique('T1').settings
    expect(diffKeys(t1, DEFAULT_SETTINGS)).toEqual(
      expect.not.arrayContaining(['showGrid', 'showBox', 'showAxes', 'showLabels', 'labelDetail']),
    )
    expect(t1.autoFocusOnNewObject).toBe(false)
    expect(t1.theme).toBe('light')
  })

  it('switches every cue off in T1', () => {
    const t1 = getTechnique('T1').settings
    expect(t1.lineStyle).toBe('plain_line')
    expect(t1.lineCollisionStyle).toBe('none')
    expect(t1.haloEnabled).toBe(false)
    expect(t1.pointShadowsEnabled).toBe(false)
    expect(t1.cameraShadowsEnabled).toBe(false)
    expect(t1.colorPreset).toBe('vivid')
  })

  it('only names colour presets that exist', () => {
    for (const technique of TECHNIQUES) {
      expect(COLOR_PRESETS[technique.settings.colorPreset], technique.id).toBeTruthy()
    }
  })
})
