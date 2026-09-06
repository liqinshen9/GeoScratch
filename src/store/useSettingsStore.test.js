import { describe, it, expect, beforeEach } from 'vitest'
import useSettingsStore from './useSettingsStore'
import { LINE_STYLES, LINE_COLLISION_STYLES } from './lineStyles'
import { OBJECT_HIGHLIGHT_STYLES } from './highlightStyles'

describe('useSettingsStore', () => {
  beforeEach(() => {
    useSettingsStore.getState().clearExerciseOverrides()
    useSettingsStore.getState().resetSettings()
  })

  it('starts with the documented defaults', () => {
    const { settings } = useSettingsStore.getState()
    expect(settings.lineStyle).toBe(LINE_STYLES.PLAIN_TUBE)
    expect(settings.lineCollisionStyle).toBe(LINE_COLLISION_STYLES.DASHED)
    expect(settings.showLabels).toBe(true)
    expect(settings.haloEnabled).toBe(true)
    expect(settings.vectorStyle).toBe(LINE_STYLES.PLAIN_TUBE)
    expect(settings.extraThickVectors).toBe(false)
    expect(settings.objectHighlightStyle).toBe(OBJECT_HIGHLIGHT_STYLES.BLINK)
  })

  it('updateSetting changes only the targeted key', () => {
    useSettingsStore.getState().updateSetting('showLabels', false)
    const { settings } = useSettingsStore.getState()
    expect(settings.showLabels).toBe(false)
    expect(settings.showGrid).toBe(true) // untouched
  })

  it('resetSettings restores every key to its default after changes', () => {
    useSettingsStore.getState().updateSetting('showLabels', false)
    useSettingsStore.getState().updateSetting('haloEnabled', false)

    useSettingsStore.getState().resetSettings()

    const { settings } = useSettingsStore.getState()
    expect(settings.showLabels).toBe(true)
    expect(settings.haloEnabled).toBe(true)
  })

  describe('exercise overrides', () => {
    it('wins over both the default and the user setting', () => {
      useSettingsStore.getState().updateSetting('haloEnabled', true)
      useSettingsStore.getState().setExerciseOverrides({ haloEnabled: false })
      expect(useSettingsStore.getState().settings.haloEnabled).toBe(false)
      expect(useSettingsStore.getState().isSettingLocked('haloEnabled')).toBe(true)
      expect(useSettingsStore.getState().isSettingLocked('showGrid')).toBe(false)
    })

    it('keeps the user change underneath -- it re-applies when the override clears', () => {
      useSettingsStore.getState().setExerciseOverrides({ haloEnabled: false })
      useSettingsStore.getState().updateSetting('haloEnabled', false)
      // Override still wins while active
      expect(useSettingsStore.getState().settings.haloEnabled).toBe(false)

      useSettingsStore.getState().clearExerciseOverrides()
      expect(useSettingsStore.getState().settings.haloEnabled).toBe(false) // the user's value
    })

    it('clearExerciseOverrides reverts unchanged keys to their default', () => {
      useSettingsStore.getState().setExerciseOverrides({ colorPreset: 'monochrome' })
      expect(useSettingsStore.getState().settings.colorPreset).toBe('monochrome')

      useSettingsStore.getState().clearExerciseOverrides()
      expect(useSettingsStore.getState().settings.colorPreset).toBe('vivid')
    })

    it('resetSettings leaves the exercise override in place', () => {
      useSettingsStore.getState().setExerciseOverrides({ haloEnabled: false })
      useSettingsStore.getState().updateSetting('showLabels', false)

      useSettingsStore.getState().resetSettings()

      expect(useSettingsStore.getState().settings.showLabels).toBe(true) // user layer cleared
      expect(useSettingsStore.getState().settings.haloEnabled).toBe(false) // override kept
      expect(useSettingsStore.getState().isSettingLocked('haloEnabled')).toBe(true)
    })

    it('drops unknown keys and undefined values', () => {
      useSettingsStore.getState().setExerciseOverrides({
        haloEnabled: false,
        notARealSetting: 123,
        showGrid: undefined,
      })
      const { exerciseOverrides, settings } = useSettingsStore.getState()
      expect(exerciseOverrides).toEqual({ haloEnabled: false })
      expect(settings.notARealSetting).toBeUndefined()
      expect(settings.showGrid).toBe(true)
    })
  })
})
